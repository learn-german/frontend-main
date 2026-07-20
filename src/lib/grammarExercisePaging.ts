import { GrammarExercise } from "./appTypes";

const MAX_QUESTIONS_PER_PAGE = 10;

/**
 * Nhóm các bài tập được tạo cùng 1 lần (cùng `groupId`, tức cùng 1 lần bấm
 * "+ Thêm câu cùng loại" trong admin) lại với nhau, giữ thứ tự xuất hiện
 * đầu tiên của mỗi nhóm (dựa trên thứ tự order_index đã được sắp xếp sẵn
 * từ query). Bài tập không có `groupId` (dữ liệu cũ) được coi là 1 nhóm
 * riêng của chính nó. Mỗi nhóm được chia tiếp thành các trang tối đa
 * MAX_QUESTIONS_PER_PAGE câu.
 */
export function groupExercisesIntoPages(exercises: GrammarExercise[]): GrammarExercise[][] {
  const byGroup = new Map<string, GrammarExercise[]>();
  for (const exercise of exercises) {
    const key = exercise.groupId ?? exercise.id;
    const group = byGroup.get(key);
    if (group) {
      group.push(exercise);
    } else {
      byGroup.set(key, [exercise]);
    }
  }

  const pages: GrammarExercise[][] = [];
  for (const group of byGroup.values()) {
    for (let i = 0; i < group.length; i += MAX_QUESTIONS_PER_PAGE) {
      pages.push(group.slice(i, i + MAX_QUESTIONS_PER_PAGE));
    }
  }
  return pages;
}
