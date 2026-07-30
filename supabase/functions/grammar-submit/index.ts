import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeGrammarScore, projectAnswers } from "./scoring.ts";
import { computeAttemptUpdate } from "./attemptUpdate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const XP_REWARD = 30;
const PASS_THRESHOLD = 80; // percent

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const lesson_id: string = body.lesson_id;
    // Not yet validated against the loaded exercises — projectAnswers() below
    // does that once we know which exercise ids are legitimate for this lesson.
    const rawAnswers: Record<string, unknown> | undefined = body.answers;

    if (!lesson_id || !rawAnswers) {
      return new Response(JSON.stringify({ error: "lesson_id and answers required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: exercises, error: exErr } = await supabase
      .from("grammar_exercises")
      .select("id, type, correct_answer, acceptable_answers, classification_items, blanks, options, exercise_sets!inner(status)")
      .eq("lesson_id", lesson_id)
      .eq("exercise_sets.status", "published");

    if (exErr || !exercises) {
      return new Response(JSON.stringify({ error: "Failed to load exercises" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Project down to exercise ids that actually exist for this lesson, coerce
    // to strings, and cap length, BEFORE scoring or persisting. This keeps a
    // malformed/oversized/unknown-id payload out of both the grader and the
    // stored row, and guarantees the persisted snapshot is exactly the set the
    // hydrate path (useGrammarAttempt) iterates.
    const answers = projectAnswers(exercises, rawAnswers);

    const { total, score, blankResults, choiceResults, exerciseResults } = computeGrammarScore(
      exercises,
      answers,
    );
    const passed = score >= PASS_THRESHOLD;

    const { data: existingAttempt } = await supabase
      .from("grammar_attempts")
      .select("best_score, attempt_count")
      .eq("user_id", user.id)
      .eq("lesson_id", lesson_id)
      .maybeSingle();

    const update = computeAttemptUpdate(existingAttempt, score, XP_REWARD, PASS_THRESHOLD);

    // Award XP BEFORE persisting best_score. best_score is exactly the flag
    // that suppresses future XP awards (reachedPassNow checks previousBest
    // against the pass threshold in computeAttemptUpdate). If the process died
    // between these two writes with the order reversed, the learner would
    // become permanently ineligible for XP they never actually received. A
    // duplicate award on a retried request is a strictly better failure mode
    // than a silent permanent forfeiture — do not "tidy" this back.
    if (update.xp_earned > 0) {
      await supabase.rpc("increment_xp", { p_user_id: user.id, p_amount: update.xp_earned });
    }

    const { error: attemptError } = await supabase.from("grammar_attempts").upsert(
      {
        lesson_id,
        user_id: user.id,
        answers,
        blank_results: blankResults,
        choice_results: choiceResults,
        exercise_results: exerciseResults,
        score,
        total,
        best_score: update.best_score,
        attempt_count: update.attempt_count,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "lesson_id,user_id" },
    );

    if (attemptError) {
      // The whole point of this table is to survive a refresh. If we can't
      // persist it, we must not report success — the client would show a
      // result card that silently disappears on the next load, exactly the
      // bug this table exists to fix.
      return new Response(JSON.stringify({ error: "Failed to save attempt" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("lesson_progress").upsert(
      { user_id: user.id, lesson_id, category: "nguphap", quiz_score: update.best_score },
      { onConflict: "user_id,lesson_id,category" },
    );

    return new Response(
      JSON.stringify({
        score,
        total,
        passed,
        xp_earned: update.xp_earned,
        best_score: update.best_score,
        attempt_count: update.attempt_count,
        blankResults,
        choiceResults,
        exerciseResults,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
