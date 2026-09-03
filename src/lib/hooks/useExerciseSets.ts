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
  generalInstruction?: string | null;
  audioClipId?: string | null;
}

interface ExerciseSetRow {
  id: string;
  lesson_id: string;
  category: string;
  title: string;
  order_index: number;
  status: "draft" | "published";
  general_instruction?: string | null;
  audio_clip_id?: string | null;
}

const SET_SELECT =
  "id, lesson_id, category, title, order_index, status, general_instruction, audio_clip_id";

const fromRow = (row: ExerciseSetRow): ExerciseSet => ({
  id: row.id,
  lessonId: row.lesson_id,
  category: row.category,
  title: row.title,
  orderIndex: row.order_index,
  status: row.status,
  generalInstruction: row.general_instruction ?? null,
  audioClipId: row.audio_clip_id ?? null,
});

// Không lọc theo 1 lesson — trang admin hiển thị danh sách bài tập của
// NHIỀU lesson cùng lúc (mỗi group trong list có thể thuộc lesson khác
// nhau), nên cần tra cứu set theo id cho bất kỳ lesson nào đang render,
// giống cách fetchExercises() đã tải toàn bộ grammar_exercises không lọc
// theo lesson.
export function useExerciseSets() {
  const [sets, setSets] = useState<ExerciseSet[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    supabase
      .from("exercise_sets")
      .select(SET_SELECT)
      .order("lesson_id")
      .order("order_index")
      .then(({ data }) => {
        setSets(((data ?? []) as ExerciseSetRow[]).map(fromRow));
        setLoading(false);
      });
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

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
    const existingCountForLesson = sets.filter((s) => s.lessonId === forLessonId).length;
    const { data, error } = await supabase
      .from("exercise_sets")
      .insert({
        lesson_id: forLessonId,
        category,
        title: nextDefaultSetTitle(existingCountForLesson),
        order_index: orderIndex,
        status: "draft",
      })
      .select(SET_SELECT)
      .single();
    if (error || !data) return { data: null, error: error?.message ?? "Không tạo được bài tập." };
    const created = fromRow(data as ExerciseSetRow);
    setSets((prev) => [...prev, created]);
    return { data: created, error: null };
  };

  const createReadingSet = async (
    forLessonId: string,
    orderIndex: number,
  ): Promise<{ data: ExerciseSet | null; error: string | null }> => {
    const existingCountForLesson = sets.filter((s) => s.lessonId === forLessonId && s.category === "doc").length;
    const { data, error } = await supabase
      .from("exercise_sets")
      .insert({
        lesson_id: forLessonId,
        category: "doc",
        title: nextDefaultSetTitle(existingCountForLesson),
        order_index: orderIndex,
        status: "draft",
      })
      .select(SET_SELECT)
      .single();
    if (error || !data) return { data: null, error: error?.message ?? "Không tạo được bài đọc." };

    const created = fromRow(data as ExerciseSetRow);
    setSets((prev) => [...prev, created]);
    return { data: created, error: null };
  };

  const updateGeneralInstruction = async (
    id: string,
    text: string,
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase
      .from("exercise_sets")
      .update({ general_instruction: text.trim() || null })
      .eq("id", id);
    if (!error) refetch();
    return { error: error?.message ?? null };
  };

  const updateAudioClipId = async (
    id: string,
    audioClipId: string | null,
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase
      .from("exercise_sets")
      .update({ audio_clip_id: audioClipId })
      .eq("id", id);
    if (!error) {
      setSets((prev) =>
        prev.map((s) => (s.id === id ? { ...s, audioClipId } : s)),
      );
    }
    return { error: error?.message ?? null };
  };

  return {
    sets,
    loading,
    refetch,
    toggleSetStatus,
    createSet,
    createReadingSet,
    updateGeneralInstruction,
    updateAudioClipId,
  };
}
