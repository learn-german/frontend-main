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
      .select("id, lesson_id, category, title, order_index, status")
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
      .select("id, lesson_id, category, title, order_index, status")
      .single();
    if (error || !data) return { data: null, error: error?.message ?? "Không tạo được bài tập." };
    const created = fromRow(data as ExerciseSetRow);
    setSets((prev) => [...prev, created]);
    return { data: created, error: null };
  };

  // Bài đọc (category="doc") tạo kèm sẵn 1 văn bản đầu tiên (UX mượt, không để
  // set rỗng ngay sau khi tạo) — nhưng khác trước, giờ set tạo TRƯỚC rồi mới
  // insert reading_passages với set_id trỏ về, vì 1 set có thể chứa NHIỀU văn
  // bản (reading_passages.set_id là N:1, không còn exercise_sets.passage_id
  // 1:1 nữa). Lỗi ở bước tạo passage -> rollback set vừa tạo.
  const createReadingSet = async (
    forLessonId: string,
    orderIndex: number,
  ): Promise<{ data: ExerciseSet | null; error: string | null }> => {
    const existingCountForLesson = sets.filter((s) => s.lessonId === forLessonId).length;
    const { data, error } = await supabase
      .from("exercise_sets")
      .insert({
        lesson_id: forLessonId,
        category: "doc",
        title: nextDefaultSetTitle(existingCountForLesson),
        order_index: orderIndex,
        status: "draft",
      })
      .select("id, lesson_id, category, title, order_index, status")
      .single();
    if (error || !data) return { data: null, error: error?.message ?? "Không tạo được bài đọc." };

    const { error: passageError } = await supabase
      .from("reading_passages")
      .insert({ lesson_id: forLessonId, set_id: data.id, text_de: "", order_index: 0 });
    if (passageError) {
      await supabase.from("exercise_sets").delete().eq("id", data.id);
      return { data: null, error: passageError.message };
    }

    const created = fromRow(data as ExerciseSetRow);
    setSets((prev) => [...prev, created]);
    return { data: created, error: null };
  };

  return { sets, loading, refetch, toggleSetStatus, createSet, createReadingSet };
}
