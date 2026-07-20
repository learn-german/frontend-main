import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { GrammarExercise } from "../appTypes";

export function useGrammarExercises(lessonId: string) {
  const [exercises, setExercises] = useState<GrammarExercise[]>([]);
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
      .from("grammar_exercises_public")
      .select("id, lesson_id, type, prompt_text, transformation_hint, tokens, classification_groups, classification_items, explanation, order_index")
      .eq("lesson_id", lessonId)
      .order("order_index")
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError(fetchError.message);
        } else {
          setExercises(
            (data ?? []).map((e) => ({
              id: e.id as string,
              lessonId: e.lesson_id as string,
              type: e.type as GrammarExercise["type"],
              promptText: (e.prompt_text as string | null) ?? undefined,
              transformationHint: (e.transformation_hint as string | null) ?? undefined,
              tokens: (e.tokens as string[] | null) ?? undefined,
              classificationGroups: (e.classification_groups as string[] | null) ?? undefined,
              classificationItems: (e.classification_items as string[] | null) ?? undefined,
              explanation: (e.explanation as string | null) ?? "",
            })),
          );
        }
        setLoading(false);
      });
  }, [lessonId]);

  return { exercises, loading, error };
}
