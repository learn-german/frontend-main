import { useState, useEffect, useCallback, Dispatch, SetStateAction } from "react";
import { supabase } from "../supabase";
import { UserStats } from "../appTypes";

const EMPTY_STATS: UserStats = {
  xp: 0,
  streak: 0,
  completedLessons: [],
  quizScores: {},
};

export function useUserStats(userId: string | null): {
  stats: UserStats;
  statsLoading: boolean;
  setStats: Dispatch<SetStateAction<UserStats>>;
} {
  const [stats, setStats] = useState<UserStats>(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    if (!userId) {
      setStats(EMPTY_STATS);
      return;
    }

    setStatsLoading(true);

    const [statsRes, progressRes] = await Promise.all([
      supabase
        .from("user_stats")
        .select("xp, streak")
        .eq("user_id", userId)
        .single(),
      supabase
        .from("lesson_progress")
        .select("lesson_id, quiz_score")
        .eq("user_id", userId),
    ]);

    setStats({
      xp: statsRes.data?.xp ?? 0,
      streak: statsRes.data?.streak ?? 0,
      completedLessons: (progressRes.data ?? []).map((p) => p.lesson_id as string),
      quizScores: Object.fromEntries(
        (progressRes.data ?? [])
          .filter((p) => p.quiz_score !== null)
          .map((p) => [p.lesson_id as string, p.quiz_score as number]),
      ),
    });

    setStatsLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, statsLoading, setStats };
}
