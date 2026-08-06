import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import type { QuizCategory } from "../completion";
import { summarizeAttempts, type LessonSetSummary } from "../lessonSetSummary";

/**
 * Tóm tắt kết quả làm bài gần nhất của 1 lesson+category cho học viên hiện
 * tại — dùng cho khối "N/M bài đã đạt" ở LessonDetailPage. null nghĩa là
 * đang tải HOẶC chưa từng nộp bài category này (component cha không hiện
 * gì thêm trong cả 2 trường hợp, không cần phân biệt).
 */
export function useLessonSetSummary(
  lessonId: string,
  category: QuizCategory,
): { summary: LessonSetSummary | null; loading: boolean } {
  const [summary, setSummary] = useState<LessonSetSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    supabase
      .from("exercise_sets")
      .select("id")
      .eq("lesson_id", lessonId)
      .eq("category", category)
      .eq("status", "published")
      .then(async ({ data: sets }) => {
        const candidateIds = (sets ?? []).map((s) => s.id as string);
        if (candidateIds.length === 0) {
          if (!cancelled) { setSummary(null); setLoading(false); }
          return;
        }

        const [exercisesRes, attemptsRes] = await Promise.all([
          supabase.from("grammar_exercises_public").select("set_id").in("set_id", candidateIds),
          supabase.from("exercise_set_attempts")
            .select("set_id, is_passed, score, submitted_at")
            .in("set_id", candidateIds),
        ]);
        if (cancelled) return;

        const nonEmptySetIds = [...new Set((exercisesRes.data ?? []).map((r) => r.set_id as string))];
        setSummary(summarizeAttempts(nonEmptySetIds, attemptsRes.data ?? []));
        setLoading(false);
      }, () => {
        if (!cancelled) { setSummary(null); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [lessonId, category]);

  return { summary, loading };
}
