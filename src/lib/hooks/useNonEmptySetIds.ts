import { useState, useEffect } from "react";
import { supabase } from "../supabase";

/**
 * Set nào có ít nhất 1 câu hỏi trong grammar_exercises_public — dùng để ẩn
 * set đã bị xoá hết câu hỏi (nhưng chưa xoá chính set) khỏi danh sách bài
 * tập của học viên. Cùng bảng câu hỏi dùng chung cho cả 3 category, xem
 * useGrammarExercises.ts.
 */
export function useNonEmptySetIds(setIds: string[]): {
  nonEmptySetIds: Set<string>;
  loading: boolean;
} {
  const [nonEmptySetIds, setNonEmptySetIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const key = setIds.join(",");

  useEffect(() => {
    if (setIds.length === 0) {
      setNonEmptySetIds(new Set());
      setLoading(false);
      return;
    }

    setLoading(true);

    supabase
      .from("grammar_exercises_public")
      .select("set_id")
      .in("set_id", setIds)
      .then(({ data }) => {
        setNonEmptySetIds(new Set((data ?? []).map((row) => row.set_id as string)));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { nonEmptySetIds, loading };
}
