import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export interface GrammarAttempt {
  answers: Record<string, string>;
  blankResults: Record<string, boolean[]>;
  choiceResults: Record<string, boolean>;
  exerciseResults: Record<string, boolean>;
  score: number;
  total: number;
  bestScore: number;
  attemptCount: number;
}

/**
 * Loads the learner's saved grammar attempt for a lesson. RLS restricts the
 * table to the caller's own rows, so no user_id filter is needed here.
 */
export function useGrammarAttempt(lessonId: string): {
  attempt: GrammarAttempt | null;
  loading: boolean;
} {
  const [attempt, setAttempt] = useState<GrammarAttempt | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!lessonId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    supabase
      .from("grammar_attempts")
      .select("answers, blank_results, choice_results, exercise_results, score, total, best_score, attempt_count")
      .eq("lesson_id", lessonId)
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
              }
            : null,
        );
        setLoading(false);
      }, () => {
        // supabase-js resolves rather than rejects on HTTP errors, but guard
        // against a thrown error inside the handler leaving loading stuck true.
        // (The query builder's thenable isn't a real Promise, so it exposes no
        // .catch — the onRejected argument of .then is the only hook available.)
        setAttempt(null);
        setLoading(false);
      });
  }, [lessonId]);

  return { attempt, loading };
}
