import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { QuizQuestion } from "../appTypes";

export function useQuizQuestions(lessonId: string) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lessonId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    supabase
      .from("quiz_questions_public")
      .select("id, type, question_text, audio_text, options, matching_pairs, explanation, order_index")
      .eq("lesson_id", lessonId)
      .order("order_index")
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError(fetchError.message);
        } else {
          setQuestions(
            (data ?? []).map((q) => ({
              id: q.id as string,
              type: q.type as QuizQuestion["type"],
              questionText: q.question_text as string,
              audioText: (q.audio_text as string | null) ?? undefined,
              options: (q.options as string[] | null) ?? undefined,
              matchingPairs: (q.matching_pairs as { de: string; vi: string }[] | null) ?? undefined,
              explanation: (q.explanation as string | null) ?? "",
            })),
          );
        }
        setLoading(false);
      });
  }, [lessonId]);

  return { questions, loading, error };
}
