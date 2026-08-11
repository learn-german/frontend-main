import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export interface ReadingStatement {
  text: string;
}

export interface ReadingSubQuestion {
  text_snippet: string | null;
  image_key: string | null;
  question: string;
  options: string[];
}

export interface ReadingQuestionGroupPublic {
  id: string;
  passageId: string;
  title: string | null;
  questionIntro: string | null;
  questionType: "richtig_falsch" | "multiple_choice";
  statements: ReadingStatement[];
  subQuestions: ReadingSubQuestion[];
  orderIndex: number;
}

export interface ReadingPassageLite {
  id: string;
  textDe: string;
}

/**
 * Nhóm câu hỏi đọc + văn bản liên quan cho 1 set (đáp án đã bị strip ở view
 * reading_question_groups_public — xem migration 20260810130000). Không
 * dùng useGrammarExercises vì bảng nguồn hoàn toàn khác
 * (reading_question_groups, không phải grammar_exercises).
 */
export function useReadingQuestionGroups(setId: string): {
  groups: ReadingQuestionGroupPublic[];
  passagesById: Record<string, ReadingPassageLite>;
  loading: boolean;
  error: string | null;
} {
  const [groups, setGroups] = useState<ReadingQuestionGroupPublic[]>([]);
  const [passagesById, setPassagesById] = useState<Record<string, ReadingPassageLite>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!setId) {
      setGroups([]);
      setPassagesById({});
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .from("reading_question_groups_public")
      .select("id, passage_id, title, question_intro, question_type, statements, sub_questions, order_index")
      .eq("set_id", setId)
      .order("order_index")
      .then(async ({ data, error: groupsError }) => {
        if (cancelled) return;
        if (groupsError) {
          setError(groupsError.message);
          setLoading(false);
          return;
        }

        const rows = data ?? [];
        const parsedGroups: ReadingQuestionGroupPublic[] = rows.map((row) => ({
          id: row.id as string,
          passageId: row.passage_id as string,
          title: row.title as string | null,
          questionIntro: row.question_intro as string | null,
          questionType: row.question_type as "richtig_falsch" | "multiple_choice",
          statements: (row.statements as ReadingStatement[] | null) ?? [],
          subQuestions: (row.sub_questions as ReadingSubQuestion[] | null) ?? [],
          orderIndex: row.order_index as number,
        }));

        const passageIds = [...new Set(parsedGroups.map((g) => g.passageId))];
        const passageMap: Record<string, ReadingPassageLite> = {};
        if (passageIds.length > 0) {
          const { data: passages, error: passagesError } = await supabase
            .from("reading_passages")
            .select("id, text_de")
            .in("id", passageIds);
          if (cancelled) return;
          if (passagesError) {
            setError(passagesError.message);
            setLoading(false);
            return;
          }
          for (const p of passages ?? []) {
            passageMap[p.id as string] = { id: p.id as string, textDe: p.text_de as string };
          }
        }

        setGroups(parsedGroups);
        setPassagesById(passageMap);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [setId]);

  return { groups, passagesById, loading, error };
}
