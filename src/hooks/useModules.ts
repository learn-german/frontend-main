import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { Module, Lesson, Level, VocabularyItem, GrammarExplanation, QuizQuestion } from "../lib/appTypes";

export function useModules() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      const [{ data: modulesData }, { data: lessonsData }, { data: quizData }] = await Promise.all([
        supabase.from("modules").select("*").order("order_index"),
        supabase.from("lessons").select("*").order("order_index"),
        supabase.from("quiz_questions_public").select("*").order("order_index"),
      ]);

      if (!modulesData) {
        setLoading(false);
        return;
      }

      const mapped: Module[] = modulesData.map((m) => ({
        id: m.id,
        level: m.level as Level,
        title: m.title,
        titleVi: m.title_vi,
        lessons: (lessonsData ?? [])
          .filter((l) => l.module_id === m.id)
          .map((l): Lesson => ({
            id: l.id,
            moduleId: l.module_id,
            moduleTitle: m.title_vi,
            level: l.level as Level,
            title: l.title,
            titleVi: l.title_vi,
            duration: l.duration ?? "",
            objective: l.objective ?? "",
            summary: l.summary ?? "",
            youtubeId: l.youtube_id ?? undefined,
            orderIndex: l.order_index,
            nextLessonId: l.next_lesson_id ?? null,
            vocabulary: (l.vocabulary ?? []) as VocabularyItem[],
            grammar: (l.grammar ?? {}) as GrammarExplanation,
            quiz: (quizData ?? [])
              .filter((q) => q.lesson_id === l.id)
              .map((q): QuizQuestion => ({
                id: q.id,
                type: q.type as QuizQuestion["type"],
                questionText: q.question_text,
                audioText: q.audio_text ?? undefined,
                options: (q.options ?? undefined) as string[] | undefined,
                matchingPairs: (q.matching_pairs ?? undefined) as { de: string; vi: string }[] | undefined,
                explanation: q.explanation,
              })),
          })),
      }));

      setModules(mapped);
      setLoading(false);
    }

    fetchAll();
  }, []);

  return { modules, loading };
}
