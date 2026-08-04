import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export interface SetAttempt {
  answers: Record<string, string>;
  blankResults: Record<string, boolean[]>;
  choiceResults: Record<string, boolean>;
  exerciseResults: Record<string, boolean>;
  score: number;
  total: number;
  bestScore: number;
  attemptCount: number;
  isPassed: boolean;
  revealed: boolean;
}

const SET_ATTEMPT_COLUMNS =
  "answers, blank_results, choice_results, exercise_results, score, total, best_score, attempt_count, is_passed, revealed";

/**
 * Trạng thái attempt của 1 set cho học viên hiện tại. RLS restricts the
 * table to the caller's own rows (own-read only, không có admin-all — xem
 * comment trong migration 20260730142404_exercise_set_attempts.sql), nên
 * không cần tự lọc user_id ở đây.
 */
export function useExerciseSetAttempt(setId: string): {
  attempt: SetAttempt | null;
  loading: boolean;
} {
  const [attempt, setAttempt] = useState<SetAttempt | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!setId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    supabase
      .from("exercise_set_attempts")
      .select(SET_ATTEMPT_COLUMNS)
      .eq("set_id", setId)
      .maybeSingle()
      .then(({ data }) => {
        setAttempt(
          data
            ? {
                answers: (data.answers as Record<string, string> | null) ?? {},
                blankResults: (data.blank_results as Record<string, boolean[]> | null) ?? {},
                choiceResults: (data.choice_results as Record<string, boolean> | null) ?? {},
                exerciseResults: (data.exercise_results as Record<string, boolean> | null) ?? {},
                score: data.score as number,
                total: data.total as number,
                bestScore: data.best_score as number,
                attemptCount: data.attempt_count as number,
                isPassed: data.is_passed as boolean,
                revealed: data.revealed as boolean,
              }
            : null,
        );
        setLoading(false);
      }, () => {
        setAttempt(null);
        setLoading(false);
      });
  }, [setId]);

  return { attempt, loading };
}

export interface SetAttemptStatus {
  isPassed: boolean;
  attemptCount: number;
}

/** Badge trạng thái cho danh sách set — chỉ cần isPassed/attemptCount. */
export function useExerciseSetAttempts(setIds: string[]): {
  attemptsBySetId: Record<string, SetAttemptStatus>;
  loading: boolean;
  updateAttempt: (setId: string, status: SetAttemptStatus) => void;
} {
  const [attemptsBySetId, setAttemptsBySetId] = useState<Record<string, SetAttemptStatus>>({});
  const [loading, setLoading] = useState(true);
  const key = setIds.join(",");

  useEffect(() => {
    if (setIds.length === 0) {
      setAttemptsBySetId({});
      setLoading(false);
      return;
    }

    setLoading(true);

    supabase
      .from("exercise_set_attempts")
      .select("set_id, is_passed, attempt_count")
      .in("set_id", setIds)
      .then(({ data }) => {
        const map: Record<string, SetAttemptStatus> = {};
        for (const row of data ?? []) {
          map[row.set_id as string] = {
            isPassed: row.is_passed as boolean,
            attemptCount: row.attempt_count as number,
          };
        }
        setAttemptsBySetId(map);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Cho phép cập nhật lạc quan ngay sau khi nộp bài — fetch ở trên chỉ chạy
  // 1 lần theo setIds nên không tự phản ánh kết quả vừa nộp trong cùng phiên.
  const updateAttempt = (setId: string, status: SetAttemptStatus) => {
    setAttemptsBySetId((prev) => ({ ...prev, [setId]: status }));
  };

  return { attemptsBySetId, loading, updateAttempt };
}
