import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabase";
import { UserStats, Level } from "../appTypes";
import {
  computeCompletedLessons,
  buildScoresByLesson,
  LessonProgressRow,
  LessonQuizFlags,
  QuizCategory,
} from "../completion";

interface BaseStats {
  xp: number;
  streak: number;
  unlockedLevels: Level[];
}

const EMPTY_BASE: BaseStats = { xp: 0, streak: 0, unlockedLevels: [] };

export function useUserStats(
  userId: string | null,
  lessons: LessonQuizFlags[],
): {
  stats: UserStats;
  statsLoading: boolean;
  applyLessonCompleteReward: (xpAwarded: number, newStreak: number) => void;
  applyQuizResult: (
    lessonId: string,
    category: QuizCategory,
    scorePercentage: number,
    xpEarned: number,
  ) => void;
} {
  const [base, setBase] = useState<BaseStats>(EMPTY_BASE);
  const [progressRows, setProgressRows] = useState<LessonProgressRow[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!userId) {
      setBase(EMPTY_BASE);
      setProgressRows([]);
      return;
    }

    setStatsLoading(true);

    const [statsRes, progressRes, profileRes] = await Promise.all([
      supabase.from("user_stats").select("xp, streak").eq("user_id", userId).single(),
      supabase.from("lesson_progress").select("lesson_id, category, quiz_score").eq("user_id", userId),
      supabase.from("profiles").select("unlocked_levels").eq("id", userId).single(),
    ]);

    setBase({
      xp: statsRes.data?.xp ?? 0,
      streak: statsRes.data?.streak ?? 0,
      unlockedLevels: (profileRes.data?.unlocked_levels ?? []) as Level[],
    });
    setProgressRows((progressRes.data ?? []) as LessonProgressRow[]);
    setStatsLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const completedLessons = useMemo(
    () => computeCompletedLessons(lessons, progressRows),
    [lessons, progressRows],
  );

  const quizScoresByCategory = useMemo(() => buildScoresByLesson(progressRows), [progressRows]);

  const quizScores = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [lessonId, byCat] of Object.entries(quizScoresByCategory)) {
      if (byCat.nguphap !== undefined) out[lessonId] = byCat.nguphap;
    }
    return out;
  }, [quizScoresByCategory]);

  const stats: UserStats = {
    xp: base.xp,
    streak: base.streak,
    completedLessons,
    quizScores,
    quizScoresByCategory,
    unlockedLevels: base.unlockedLevels,
  };

  const applyLessonCompleteReward = useCallback((xpAwarded: number, newStreak: number) => {
    setBase((prev) => ({ ...prev, xp: prev.xp + xpAwarded, streak: newStreak }));
  }, []);

  const applyQuizResult = useCallback(
    (lessonId: string, category: QuizCategory, scorePercentage: number, xpEarned: number) => {
      setBase((prev) => ({ ...prev, xp: prev.xp + xpEarned }));
      setProgressRows((prev) => {
        const idx = prev.findIndex((r) => r.lesson_id === lessonId && r.category === category);
        if (idx === -1) {
          return [...prev, { lesson_id: lessonId, category, quiz_score: scorePercentage }];
        }
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quiz_score: scorePercentage };
        return copy;
      });
    },
    [],
  );

  return { stats, statsLoading, applyLessonCompleteReward, applyQuizResult };
}
