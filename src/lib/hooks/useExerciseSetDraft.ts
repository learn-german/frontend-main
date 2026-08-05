import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { hasAnyAnswer } from "../exerciseSetDraftLogic";

export interface SetDraft {
  answers: Record<string, string>;
}

/**
 * Draft đáp án chưa nộp, key theo (user, set). Học viên tự đọc/ghi trực
 * tiếp qua PostgREST (RLS own read/write) — khác exercise_set_attempts,
 * không qua Edge Function vì draft không liên quan chấm điểm/đáp án đúng.
 */
export function useExerciseSetDraft(setId: string): {
  draft: SetDraft | null;
  loading: boolean;
  saveDraft: (answers: Record<string, string>) => Promise<{ error: string | null }>;
  deleteDraft: () => Promise<void>;
} {
  const [draft, setDraft] = useState<SetDraft | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!setId) {
      setDraft(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("exercise_set_drafts")
      .select("answers")
      .eq("set_id", setId)
      .maybeSingle()
      .then(({ data }) => {
        setDraft(data ? { answers: data.answers as Record<string, string> } : null);
        setLoading(false);
      });
  }, [setId]);

  useEffect(() => { refetch(); }, [refetch]);

  const saveDraft = useCallback(
    async (answers: Record<string, string>): Promise<{ error: string | null }> => {
      if (!setId || !hasAnyAnswer(answers)) return { error: null };
      const { error } = await supabase.from("exercise_set_drafts").upsert(
        { set_id: setId, answers, updated_at: new Date().toISOString() },
        { onConflict: "user_id,set_id" },
      );
      if (!error) setDraft({ answers });
      return { error: error ? error.message : null };
    },
    [setId],
  );

  const deleteDraft = useCallback(async () => {
    if (!setId) return;
    await supabase.from("exercise_set_drafts").delete().eq("set_id", setId);
    setDraft(null);
  }, [setId]);

  return { draft, loading, saveDraft, deleteDraft };
}
