import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { nextDefaultSetTitle } from "../exerciseSetTitle";

export { nextDefaultSetTitle };

export interface ExerciseSet {
  id: string;
  lessonId: string;
  category: string;
  title: string;
  orderIndex: number;
  status: "draft" | "published";
}

interface ExerciseSetRow {
  id: string;
  lesson_id: string;
  category: string;
  title: string;
  order_index: number;
  status: "draft" | "published";
}

const fromRow = (row: ExerciseSetRow): ExerciseSet => ({
  id: row.id,
  lessonId: row.lesson_id,
  category: row.category,
  title: row.title,
  orderIndex: row.order_index,
  status: row.status,
});

export function useExerciseSets(lessonId: string | null) {
  const [sets, setSets] = useState<ExerciseSet[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!lessonId) {
      setSets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("exercise_sets")
      .select("id, lesson_id, category, title, order_index, status")
      .eq("lesson_id", lessonId)
      .order("order_index")
      .then(({ data }) => {
        setSets(((data ?? []) as ExerciseSetRow[]).map(fromRow));
        setLoading(false);
      });
  }, [lessonId]);

  useEffect(() => { refetch(); }, [refetch]);

  const renameSet = async (id: string, title: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.from("exercise_sets").update({ title }).eq("id", id);
    if (!error) refetch();
    return { error: error?.message ?? null };
  };

  const toggleSetStatus = async (
    id: string,
    current: "draft" | "published",
  ): Promise<{ error: string | null }> => {
    const next = current === "draft" ? "published" : "draft";
    const { error } = await supabase.from("exercise_sets").update({ status: next }).eq("id", id);
    if (!error) refetch();
    return { error: error?.message ?? null };
  };

  const createSet = async (
    forLessonId: string,
    category: string,
    orderIndex: number,
  ): Promise<{ data: ExerciseSet | null; error: string | null }> => {
    const { data, error } = await supabase
      .from("exercise_sets")
      .insert({
        lesson_id: forLessonId,
        category,
        title: nextDefaultSetTitle(sets.length),
        order_index: orderIndex,
        status: "draft",
      })
      .select("id, lesson_id, category, title, order_index, status")
      .single();
    if (error || !data) return { data: null, error: error?.message ?? "Không tạo được bài tập." };
    const created = fromRow(data as ExerciseSetRow);
    setSets((prev) => [...prev, created]);
    return { data: created, error: null };
  };

  return { sets, loading, refetch, renameSet, toggleSetStatus, createSet };
}
