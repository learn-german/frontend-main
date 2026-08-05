import { useState, useEffect } from "react";
import { supabase } from "../supabase";

/**
 * Set nào đang có draft (đã lưu, chưa nộp) — cho badge "Đang làm" ở danh
 * sách set. Mirror useExerciseSetAttempts trong useExerciseSetAttempt.ts.
 */
export function useExerciseSetDrafts(setIds: string[]): {
  draftSetIds: Set<string>;
  loading: boolean;
  markDraftSaved: (setId: string, hasDraft: boolean) => void;
} {
  const [draftSetIds, setDraftSetIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const key = setIds.join(",");

  useEffect(() => {
    if (setIds.length === 0) {
      setDraftSetIds(new Set());
      setLoading(false);
      return;
    }

    setLoading(true);

    supabase
      .from("exercise_set_drafts")
      .select("set_id")
      .in("set_id", setIds)
      .then(({ data }) => {
        setDraftSetIds(new Set((data ?? []).map((row) => row.set_id as string)));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Cập nhật lạc quan ngay sau khi Lưu/Nộp bài — fetch ở trên chỉ chạy 1
  // lần theo setIds nên không tự phản ánh thay đổi trong cùng phiên.
  const markDraftSaved = (setId: string, hasDraft: boolean) => {
    setDraftSetIds((prev) => {
      const next = new Set(prev);
      if (hasDraft) next.add(setId);
      else next.delete(setId);
      return next;
    });
  };

  return { draftSetIds, loading, markDraftSaved };
}
