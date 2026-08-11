import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeReadingScore, deriveCorrectAnswers, deriveExplanations, projectAnswers } from "./scoring.ts";
import { computeSetAttemptUpdate, type ExistingSetAttempt } from "./setAttemptUpdate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const XP_REWARD = 30;

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
    const set_id: string = body.set_id;
    const submission_id: string = body.submission_id;
    const rawAnswers: Record<string, unknown> | undefined = body.answers;

    if (!set_id || !submission_id || !rawAnswers) {
      return new Response(JSON.stringify({ error: "set_id, submission_id and answers required" }), {
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

    const { data: set, error: setErr } = await supabase
      .from("exercise_sets")
      .select("id, lesson_id, category, status")
      .eq("id", set_id)
      .eq("status", "published")
      .maybeSingle();

    if (setErr || !set) {
      return new Response(JSON.stringify({ error: "Set not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: groups, error: groupsErr } = await supabase
      .from("reading_question_groups")
      .select("id, question_type, statements, sub_questions, explanation")
      .eq("set_id", set_id);

    if (groupsErr || !groups || groups.length === 0) {
      return new Response(JSON.stringify({ error: "Failed to load exercises" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const answers = projectAnswers(groups, rawAnswers);
    const { total, correct, itemResults } = computeReadingScore(groups, answers);

    const { data: existingRow } = await supabase
      .from("exercise_set_attempts")
      .select("best_score, attempt_count, is_passed, revealed, last_submission_id")
      .eq("user_id", user.id)
      .eq("set_id", set_id)
      .maybeSingle();

    // Idempotency: cùng submission_id với lần trước -> trả lại đúng kết quả
    // cũ, không chấm lại, không tăng attempt_count. Cùng cơ chế bảo vệ
    // double-click/retry như grammar-submit.
    if (existingRow && existingRow.last_submission_id === submission_id) {
      const revealedNow = existingRow.revealed;
      return new Response(
        JSON.stringify({
          score: existingRow.best_score,
          total,
          correct,
          isPassed: existingRow.is_passed,
          revealed: revealedNow,
          attemptCount: existingRow.attempt_count,
          bestScore: existingRow.best_score,
          xpEarned: 0,
          lessonQuizScore: 0,
          itemResults,
          ...(revealedNow
            ? {
                correctAnswers: deriveCorrectAnswers(groups),
                explanations: deriveExplanations(groups),
              }
            : {}),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const existing: ExistingSetAttempt | null = existingRow
      ? {
          bestScore: existingRow.best_score,
          attemptCount: existingRow.attempt_count,
          isPassed: existingRow.is_passed,
          revealed: existingRow.revealed,
        }
      : null;

    const update = computeSetAttemptUpdate(existing, correct, total, XP_REWARD);

    if (update.xpEarned > 0) {
      await supabase.rpc("increment_xp", { p_user_id: user.id, p_amount: update.xpEarned });
    }

    // itemResults lưu vào exercise_results — cột JSONB generic
    // Record<string,boolean> đã có sẵn từ grammar-submit, không cần cột mới:
    // reading dùng đúng shape đó, blank_results/choice_results/
    // classification_results để rỗng vì không áp dụng cho bài đọc.
    const { error: attemptError } = await supabase.from("exercise_set_attempts").upsert(
      {
        user_id: user.id,
        set_id,
        category: set.category,
        answers,
        blank_results: {},
        choice_results: {},
        exercise_results: itemResults,
        classification_results: {},
        score: update.score,
        total,
        best_score: update.bestScore,
        attempt_count: update.attemptCount,
        is_passed: update.isPassed,
        revealed: update.revealed,
        last_submission_id: submission_id,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "user_id,set_id" },
    );

    if (attemptError) {
      return new Response(JSON.stringify({ error: "Failed to save attempt" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rollup lesson_progress.quiz_score: giống hệt logic grammar-submit,
    // chỉ đổi nguồn "set nào có câu hỏi thật" sang reading_question_groups.
    const { data: lessonSets } = await supabase
      .from("exercise_sets")
      .select("id")
      .eq("lesson_id", set.lesson_id)
      .eq("category", set.category)
      .eq("status", "published");

    const candidateSetIds = (lessonSets ?? []).map((s) => s.id);
    const { data: nonEmptySetRows } = await supabase
      .from("reading_question_groups")
      .select("set_id")
      .in("set_id", candidateSetIds);
    const nonEmptySetIds = new Set((nonEmptySetRows ?? []).map((r) => r.set_id as string));
    const setIds = candidateSetIds.filter((id) => nonEmptySetIds.has(id));

    const { data: lessonAttempts } = await supabase
      .from("exercise_set_attempts")
      .select("set_id, best_score, is_passed")
      .eq("user_id", user.id)
      .in("set_id", setIds);

    const attemptsBySetId = new Map((lessonAttempts ?? []).map((a) => [a.set_id, a]));
    const allPassed = setIds.length > 0 && setIds.every((id) => attemptsBySetId.get(id)?.is_passed === true);
    const lessonQuizScore = allPassed
      ? 100
      : Math.round(
          setIds.reduce((sum, id) => sum + (attemptsBySetId.get(id)?.best_score ?? 0), 0) / setIds.length,
        );

    const { data: previousProgress } = await supabase
      .from("lesson_progress")
      .select("quiz_score")
      .eq("user_id", user.id)
      .eq("lesson_id", set.lesson_id)
      .eq("category", set.category)
      .maybeSingle();

    const lessonJustCompleted = allPassed && (previousProgress?.quiz_score ?? 0) < 100;
    if (lessonJustCompleted) {
      await supabase.rpc("increment_xp", { p_user_id: user.id, p_amount: XP_REWARD });
    }

    await supabase.from("lesson_progress").upsert(
      { user_id: user.id, lesson_id: set.lesson_id, category: set.category, quiz_score: lessonQuizScore },
      { onConflict: "user_id,lesson_id,category" },
    );

    return new Response(
      JSON.stringify({
        score: update.score,
        total,
        correct,
        isPassed: update.isPassed,
        revealed: update.revealed,
        attemptCount: update.attemptCount,
        bestScore: update.bestScore,
        xpEarned: update.xpEarned + (lessonJustCompleted ? XP_REWARD : 0),
        lessonQuizScore,
        itemResults,
        ...(update.revealed
          ? {
              correctAnswers: deriveCorrectAnswers(groups),
              explanations: deriveExplanations(groups),
            }
          : {}),
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
