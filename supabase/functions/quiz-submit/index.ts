import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const answers: Record<string, string> = body.answers;

    if (!lesson_id || !answers) {
      return new Response(JSON.stringify({ error: "lesson_id and answers required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read quiz_questions base table (has correct_answer, never exposed to client)
    const { data: questions, error: qErr } = await supabase
      .from("quiz_questions")
      .select("id, type, correct_answer")
      .eq("lesson_id", lesson_id);

    if (qErr || !questions) {
      return new Response(JSON.stringify({ error: "Failed to load questions" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sort matching answer strings alphabetically by de key before comparing
    const normalizeMatching = (s: string) =>
      s.split("|")
        .map(p => p.trim())
        .sort((a, b) => a.localeCompare(b))
        .join("|");

    // Score calculation
    let correct = 0;
    for (const q of questions) {
      const userAnswer = (answers[q.id] ?? "").trim();
      const correctAnswer = (q.correct_answer ?? "").trim();

      if (q.type === "matching") {
        if (normalizeMatching(userAnswer) === normalizeMatching(correctAnswer)) correct++;
      } else {
        if (userAnswer.toLowerCase() === correctAnswer.toLowerCase()) correct++;
      }
    }

    const total = questions.length;
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const passed = score >= PASS_THRESHOLD;

    // Idempotency: check if already completed
    const { data: existing } = await supabase
      .from("lesson_progress")
      .select("lesson_id")
      .eq("user_id", user.id)
      .eq("lesson_id", lesson_id)
      .maybeSingle();

    let xp_earned = 0;

    if (passed && !existing) {
      await supabase.rpc("increment_xp", { p_user_id: user.id, p_amount: XP_REWARD });
      xp_earned = XP_REWARD;
    }

    // UPSERT lesson_progress (idempotent)
    await supabase.from("lesson_progress").upsert(
      { user_id: user.id, lesson_id, quiz_score: score },
      { onConflict: "user_id,lesson_id" },
    );

    return new Response(
      JSON.stringify({ score, total, passed, xp_earned }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
