import { useState, useEffect } from "react";
import { supabase } from "../supabase";

/**
 * Set nào có ít nhất 1 nhóm câu hỏi trong reading_question_groups_public —
 * mirror useNonEmptySetIds.ts, nhưng nguồn là bảng riêng cho bài đọc
 * (reading_question_groups), không phải grammar_exercises.
 */
export function useNonEmptyReadingSetIds(setIds: string[]): {
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
      .from("reading_question_groups_public")
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
