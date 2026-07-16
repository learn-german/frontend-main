export type QuizCategory = "nguphap" | "nghe" | "doc";

export const PASS_THRESHOLD = 80;

export interface LessonProgressRow {
  lesson_id: string;
  category: string;
  quiz_score: number | null;
  completed_at?: string;
}

export interface LessonContentFlags {
  id: string;
  audioR2Key?: string;
  listeningUrl?: string;
  readingText?: string;
}

/**
 * Which quiz categories actually apply to a lesson. Ngữ pháp always applies;
 * Nghe/Đọc only apply if the lesson has audio / a reading passage (mirrors
 * the content-gated "Bắt đầu bài tập" buttons on LessonDetailPage).
 */
export function applicableCategories(lesson: LessonContentFlags): QuizCategory[] {
  const categories: QuizCategory[] = ["nguphap"];
  if (lesson.audioR2Key || lesson.listeningUrl) categories.push("nghe");
  if (lesson.readingText) categories.push("doc");
  return categories;
}

export function isLessonComplete(
  lesson: LessonContentFlags,
  scoresByCategory: Partial<Record<QuizCategory, number>>,
): boolean {
  return applicableCategories(lesson).every(
    (cat) => (scoresByCategory[cat] ?? 0) >= PASS_THRESHOLD,
  );
}

/** Groups raw lesson_progress rows into { lessonId: { category: score } }. */
export function buildScoresByLesson(
  progressRows: LessonProgressRow[],
): Record<string, Partial<Record<QuizCategory, number>>> {
  const map: Record<string, Partial<Record<QuizCategory, number>>> = {};
  for (const row of progressRows) {
    if (row.quiz_score === null || row.quiz_score === undefined) continue;
    const cat = row.category as QuizCategory;
    const existing = map[row.lesson_id] ?? {};
    existing[cat] = row.quiz_score;
    map[row.lesson_id] = existing;
  }
  return map;
}

export function computeCompletedLessons(
  lessons: LessonContentFlags[],
  progressRows: LessonProgressRow[],
): string[] {
  const scoresByLesson = buildScoresByLesson(progressRows);
  return lessons
    .filter((lesson) => isLessonComplete(lesson, scoresByLesson[lesson.id] ?? {}))
    .map((lesson) => lesson.id);
}

export type LessonStatus = "completed" | "current" | "locked";

/**
 * Sequential status (mirrors RoadmapPage's getLessonStatus): a lesson is
 * "current" if it's the first lesson, or the immediately preceding lesson
 * (in the given order) is completed. Everything else not-yet-completed is
 * "locked". Caller must pass lessons already in the correct display order.
 */
export function computeLessonStatuses<T extends { id: string }>(
  orderedLessons: T[],
  completedIds: string[],
): Record<string, LessonStatus> {
  const completedSet = new Set(completedIds);
  const statuses: Record<string, LessonStatus> = {};
  orderedLessons.forEach((lesson, idx) => {
    if (completedSet.has(lesson.id)) {
      statuses[lesson.id] = "completed";
    } else if (idx === 0 || completedSet.has(orderedLessons[idx - 1].id)) {
      statuses[lesson.id] = "current";
    } else {
      statuses[lesson.id] = "locked";
    }
  });
  return statuses;
}

/** The highest-order lesson (in the given order) that is completed, if any. */
export function furthestCompletedLesson<T extends { id: string }>(
  orderedLessons: T[],
  completedIds: string[],
): T | undefined {
  const completedSet = new Set(completedIds);
  let result: T | undefined;
  for (const lesson of orderedLessons) {
    if (completedSet.has(lesson.id)) result = lesson;
  }
  return result;
}
