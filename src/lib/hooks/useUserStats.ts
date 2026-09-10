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
import {
  buildWeekActivity,
  daysBetween,
  mondayOfWeekContaining,
  vnCalendarDateIso,
} from "../learningStreak";

interface BaseStats {
  xp: number;
  streak: number;
  unlockedLevels: Level[];
}

const EMPTY_BASE: BaseStats = { xp: 0, streak: 0, unlockedLevels: [] };

interface LearningActivityDayRow {
  activity_date: string;
}

const createEmptyWeekActivity = (): boolean[] => Array(7).fill(false);

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(
    Date.UTC(
      Number(isoDate.slice(0, 4)),
      Number(isoDate.slice(5, 7)) - 1,
      Number(isoDate.slice(8, 10)),
    ),
  );
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function markTodayActive(previous: boolean[]): boolean[] {
  const today = vnCalendarDateIso();
  const monday = mondayOfWeekContaining(today);
  const index = daysBetween(monday, today);
  if (index < 0 || index >= 7 || previous[index]) return previous;
  const next = [...previous];
  next[index] = true;
  return next;
}

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
    newStreak?: number,
  ) => void;
  lessonIdsCompletedToday: string[];
  weekActivity: boolean[];
} {
  const [base, setBase] = useState<BaseStats>(EMPTY_BASE);
  const [progressRows, setProgressRows] = useState<LessonProgressRow[]>([]);
  const [weekActivity, setWeekActivity] = useState<boolean[]>(createEmptyWeekActivity);
  const [statsLoading, setStatsLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!userId) {
      setBase(EMPTY_BASE);
      setProgressRows([]);
      setWeekActivity(createEmptyWeekActivity());
      return;
    }

    setStatsLoading(true);
    const today = vnCalendarDateIso();
    const monday = mondayOfWeekContaining(today);
    const sunday = addDaysIso(monday, 6);

    const [statsRes, progressRes, profileRes, weekActivityRes] = await Promise.all([
      supabase.from("user_stats").select("xp, streak").eq("user_id", userId).single(),
      supabase.from("lesson_progress").select("lesson_id, category, quiz_score, completed_at").eq("user_id", userId),
      supabase.from("profiles").select("unlocked_levels").eq("id", userId).single(),
      supabase
        .from("learning_activity_days")
        .select("activity_date")
        .eq("user_id", userId)
        .gte("activity_date", monday)
        .lte("activity_date", sunday),
    ]);

    setBase({
      xp: statsRes.data?.xp ?? 0,
      streak: statsRes.data?.streak ?? 0,
      unlockedLevels: (profileRes.data?.unlocked_levels ?? []) as Level[],
    });
    setProgressRows((progressRes.data ?? []) as LessonProgressRow[]);
    const activityRows = (weekActivityRes.data ?? []) as LearningActivityDayRow[];
    setWeekActivity(buildWeekActivity(activityRows.map((row) => row.activity_date), monday));
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

  // "Đã học hôm nay" = bài có ít nhất 1 lượt làm bài (lesson_progress) hôm
  // nay — không chỉ bài đã hoàn thành, để phản ánh đúng hoạt động trong ngày.
  const lessonIdsCompletedToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const ids = new Set<string>();
    for (const row of progressRows) {
      if (row.completed_at?.slice(0, 10) === today) ids.add(row.lesson_id);
    }
    return Array.from(ids);
  }, [progressRows]);

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
    setWeekActivity(markTodayActive);
  }, []);

  const applyQuizResult = useCallback(
    (lessonId: string, category: QuizCategory, scorePercentage: number, xpEarned: number, newStreak?: number) => {
      setBase((prev) => ({ ...prev, xp: prev.xp + xpEarned, streak: newStreak ?? prev.streak }));
      if (newStreak !== undefined) setWeekActivity(markTodayActive);
      setProgressRows((prev) => {
        const idx = prev.findIndex((r) => r.lesson_id === lessonId && r.category === category);
        const completed_at = new Date().toISOString();
        if (idx === -1) {
          return [...prev, { lesson_id: lessonId, category, quiz_score: scorePercentage, completed_at }];
        }
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quiz_score: scorePercentage, completed_at };
        return copy;
      });
    },
    [],
  );

  return { stats, statsLoading, applyLessonCompleteReward, applyQuizResult, lessonIdsCompletedToday, weekActivity };
}
