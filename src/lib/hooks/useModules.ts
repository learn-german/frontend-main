import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { Module, Lesson, Level, GrammarExplanation } from "../appTypes";

type SupabaseLesson = {
  id: string;
  level: string;
  title: string;
  title_vi: string;
  objective: string | null;
  summary: string | null;
  youtube_id: string | null;
  duration: string;
  order_index: number;
  xp_reward: number;
  next_lesson_id: string | null;
  vocabulary_md: string | null;
  grammar: unknown;
  grammar_md: string | null;
  speaking_md: string | null;
  writing_prompt_md: string | null;
  listening_url: string | null;
  video_r2_key: string | null;
  listening_clips: { id: string; r2_key: string; order_index: number }[];
  reading_passages: { id: string; text_de: string; order_index: number }[];
};

type SupabaseModule = {
  id: string;
  level: string;
  title: string;
  title_vi: string;
  order_index: number;
  lessons: SupabaseLesson[];
};

function transformModule(
  m: SupabaseModule,
  nguphapLessonIds: Set<string>,
  quizCategoriesByLesson: Map<string, Set<string>>,
): Module {
  return {
    id: m.id,
    level: m.level as Level,
    title: m.title,
    titleVi: m.title_vi,
    lessons: (m.lessons ?? []).map((l): Lesson => ({
      id: l.id,
      moduleId: m.id,
      moduleTitle: m.title_vi,
      level: l.level as Level,
      title: l.title,
      titleVi: l.title_vi,
      duration: l.duration,
      objective: l.objective ?? "",
      summary: l.summary ?? "",
      youtubeId: l.youtube_id ?? undefined,
      orderIndex: l.order_index,
      nextLessonId: l.next_lesson_id,
      vocabularyMd: l.vocabulary_md ?? undefined,
      grammar: (l.grammar as GrammarExplanation) ?? { title: "", rule: "", examples: [] },
      grammarMd: l.grammar_md ?? undefined,
      speakingMd: l.speaking_md ?? undefined,
      writingPromptMd: l.writing_prompt_md ?? undefined,
      hasNguphapQuestions: nguphapLessonIds.has(l.id),
      // Nghe/Đọc chỉ bắt buộc pass khi đã có câu hỏi được soạn — có file mp3
      // hay đoạn văn thôi thì chưa đủ, nếu không bài học sẽ khóa vĩnh viễn.
      hasNgheQuestions: quizCategoriesByLesson.get(l.id)?.has("nghe") ?? false,
      hasDocQuestions: quizCategoriesByLesson.get(l.id)?.has("doc") ?? false,
      videoR2Key: l.video_r2_key ?? undefined,
      // Sorted client-side rather than relying on a 3-level-deep Supabase
      // nested .order() call (modules -> lessons -> listening_clips), which
      // has uncertain referencedTable path support at that depth.
      listeningClips: [...(l.listening_clips ?? [])]
        .sort((a, b) => a.order_index - b.order_index)
        .map((c) => ({ id: c.id, r2Key: c.r2_key })),
      // Sorted client-side for the same reason as listeningClips above (no
      // reliance on a 3-level-deep Supabase nested .order() call).
      readingPassages: [...(l.reading_passages ?? [])]
        .sort((a, b) => a.order_index - b.order_index)
        .map((p) => ({ id: p.id, textDe: p.text_de })),
    })),
  };
}

export function useModules(userId: string | null): { modules: Module[]; loading: boolean; error: string | null } {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setModules([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    Promise.all([
      supabase
        .from("modules")
        .select(`
          id, level, title, title_vi, order_index,
          lessons (
            id, level, title, title_vi, objective, summary,
            youtube_id, duration, order_index, xp_reward,
            next_lesson_id, vocabulary_md, grammar,
            grammar_md, speaking_md, writing_prompt_md, video_r2_key,
            listening_clips (id, r2_key, order_index),
            reading_passages (id, text_de, order_index)
          )
        `)
        .order("order_index")
        .order("order_index", { referencedTable: "lessons" }),
      supabase
        .from("grammar_exercises_public")
        .select("lesson_id"),
      supabase
        .from("quiz_questions_public")
        .select("lesson_id, category"),
    ]).then(([modulesRes, nguphapRes, quizRes]) => {
      if (cancelled) return;
      if (modulesRes.error) {
        setError(modulesRes.error.message);
      } else if (nguphapRes.error || quizRes.error) {
        // Nếu 2 query cờ câu hỏi lỗi, "không có cờ" sẽ bị hiểu nhầm là "mục
        // không có câu hỏi" -> tự động hoàn thành sai. Coi lỗi này nghiêm
        // trọng như lỗi modulesRes, không build flags từ tập rỗng.
        setError((nguphapRes.error ?? quizRes.error)?.message ?? "Không thể tải dữ liệu câu hỏi.");
      } else {
        const nguphapLessonIds = new Set((nguphapRes.data ?? []).map((r) => r.lesson_id as string));
        const quizCategoriesByLesson = new Map<string, Set<string>>();
        for (const row of (quizRes.data ?? []) as { lesson_id: string; category: string }[]) {
          const categories = quizCategoriesByLesson.get(row.lesson_id) ?? new Set<string>();
          categories.add(row.category);
          quizCategoriesByLesson.set(row.lesson_id, categories);
        }
        setModules(
          (modulesRes.data ?? []).map((m) =>
            transformModule(m as SupabaseModule, nguphapLessonIds, quizCategoriesByLesson),
          ),
        );
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [userId]);

  return { modules, loading, error };
}
