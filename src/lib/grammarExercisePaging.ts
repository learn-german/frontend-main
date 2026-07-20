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

/**
 * Đánh số thứ tự cho từng câu, bắt đầu lại từ 1 mỗi khi sang loại bài tập
 * khác. Giả định `pages` đã được nhóm theo loại (mỗi trang chỉ chứa 1 loại,
 * các trang cùng loại đứng liên tiếp nhau) — đúng như output của
 * `groupExercisesIntoPages`.
 */
export function numberExercisesWithinType(pages: GrammarExercise[][]): Map<string, number> {
  const numbers = new Map<string, number>();
  let previousType: GrammarExercise["type"] | null = null;
  let counter = 0;
  for (const page of pages) {
    for (const exercise of page) {
      if (exercise.type !== previousType) {
        counter = 0;
        previousType = exercise.type;
      }
      counter += 1;
      numbers.set(exercise.id, counter);
    }
  }
  return numbers;
}
