import { GrammarExercise } from "./appTypes";

const MAX_QUESTIONS_PER_PAGE = 10;

/**
 * Nhóm các bài tập cùng loại lại với nhau, giữ thứ tự xuất hiện đầu tiên
 * của mỗi loại (dựa trên thứ tự order_index đã được sắp xếp sẵn từ query).
 * Mỗi nhóm được chia tiếp thành các trang tối đa MAX_QUESTIONS_PER_PAGE câu.
 */
export function groupExercisesIntoPages(exercises: GrammarExercise[]): GrammarExercise[][] {
  const byType = new Map<GrammarExercise["type"], GrammarExercise[]>();
  for (const exercise of exercises) {
    const group = byType.get(exercise.type);
    if (group) {
      group.push(exercise);
    } else {
      byType.set(exercise.type, [exercise]);
    }
  }

  const pages: GrammarExercise[][] = [];
  for (const group of byType.values()) {
    for (let i = 0; i < group.length; i += MAX_QUESTIONS_PER_PAGE) {
      pages.push(group.slice(i, i + MAX_QUESTIONS_PER_PAGE));
    }
  }
  return pages;
}
