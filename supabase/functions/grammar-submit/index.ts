import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeGrammarScore, deriveCorrectAnswers, projectAnswers } from "./scoring.ts";
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

    const { data: exercises, error: exErr } = await supabase
      .from("grammar_exercises")
      .select("id, type, correct_answer, acceptable_answers, classification_items, blanks, options, explanation")
      .eq("set_id", set_id);

    if (exErr || !exercises || exercises.length === 0) {
      return new Response(JSON.stringify({ error: "Failed to load exercises" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const answers = projectAnswers(exercises, rawAnswers);
    const { total, correct, blankResults, choiceResults, exerciseResults, classificationResults } =
      computeGrammarScore(exercises, answers);

    const { data: existingRow } = await supabase
      .from("exercise_set_attempts")
      .select("best_score, attempt_count, is_passed, revealed, last_submission_id")
      .eq("user_id", user.id)
      .eq("set_id", set_id)
      .maybeSingle();

    // Idempotency: cùng submission_id với lần trước -> trả lại đúng kết quả
    // cũ, không chấm lại, không tăng attempt_count. Bảo vệ double-click và
    // request bị retry (mạng chập chờn gửi lại cùng request).
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
          blankResults,
          choiceResults,
          exerciseResults,
          classificationResults,
          ...(revealedNow
            ? {
                correctAnswers: deriveCorrectAnswers(exercises),
                explanations: Object.fromEntries(exercises.map((e) => [e.id, e.explanation ?? ""])),
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

    const { error: attemptError } = await supabase.from("exercise_set_attempts").upsert(
      {
        user_id: user.id,
        set_id,
        category: set.category,
        answers,
        blank_results: blankResults,
        choice_results: choiceResults,
        exercise_results: exerciseResults,
        classification_results: classificationResults,
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

    // Rollup lesson_progress.quiz_score: 100 chỉ khi TOÀN BỘ set nguphap của
    // lesson đã pass, ngược lại trung bình best_score các set (0 cho set
    // chưa làm) — không dùng 0 cứng vì Dashboard hiển thị số này trực tiếp.
    const { data: lessonSets } = await supabase
      .from("exercise_sets")
      .select("id")
      .eq("lesson_id", set.lesson_id)
      .eq("category", set.category)
      .eq("status", "published");

    // Set published nhưng chưa có câu hỏi nào (đã bị ẩn khỏi danh sách học
    // viên — xem GrammarSetListPage.tsx/QuizSetListPage.tsx) không được tính
    // vào rollup: học viên không còn cách nào mở/nộp bài set đó nữa, nên nếu
    // vẫn nằm trong setIds thì allPassed vĩnh viễn false và best_score luôn
    // cộng thêm 0 vào mẫu số — khoá lesson mãi mãi dù học viên đã làm hết
    // mọi bài thực sự nhìn thấy được.
    const candidateSetIds = (lessonSets ?? []).map((s) => s.id);
    const { data: nonEmptySetRows } = await supabase
      .from("grammar_exercises")
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

    // XP cấp lesson: chỉ khi rollup vừa chuyển từ <100 sang 100 ở LẦN NÀY —
    // tránh thưởng trùng nếu 2 request submit set khác nhau chạy gần đồng
    // thời cùng đẩy lesson qua ngưỡng "toàn bộ set đã pass".
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
        blankResults,
        choiceResults,
        exerciseResults,
        classificationResults,
        ...(update.revealed
          ? {
              correctAnswers: deriveCorrectAnswers(exercises),
              explanations: Object.fromEntries(exercises.map((e) => [e.id, e.explanation ?? ""])),
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
