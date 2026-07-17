import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { QuizQuestion } from "../appTypes";

export function useQuizQuestions(lessonId: string, category: "nguphap" | "nghe" | "doc") {
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
      .select("id, type, category, question_text, answer_text, audio_text, audio_clip_id, reading_passage_id, options, matching_pairs, explanation, order_index")
      .eq("lesson_id", lessonId)
      .eq("category", category)
      .order("order_index")
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError(fetchError.message);
        } else {
          setQuestions(
            (data ?? []).map((q) => ({
              id: q.id as string,
              type: q.type as QuizQuestion["type"],
              category: q.category as QuizQuestion["category"],
              questionText: q.question_text as string,
              answerText: (q.answer_text as string | null) ?? undefined,
              audioText: (q.audio_text as string | null) ?? undefined,
              audioClipId: (q.audio_clip_id as string | null) ?? undefined,
              readingPassageId: (q.reading_passage_id as string | null) ?? undefined,
              options: (q.options as string[] | null) ?? undefined,
              matchingPairs: (q.matching_pairs as { de: string; vi: string }[] | null) ?? undefined,
              explanation: (q.explanation as string | null) ?? "",
            })),
          );
        }
        setLoading(false);
      });
  }, [lessonId, category]);

  return { questions, loading, error };
}
