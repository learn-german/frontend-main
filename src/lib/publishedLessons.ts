/** Learner roadmap/modules must only use published lessons — drafts are
 *  placeholders via lesson_positions ("Đang chỉnh sửa"), not full cards.
 *  Admin/tutor RLS still returns drafts nested under modules; filter here. */
export function isPublishedLessonStatus(status: string | null | undefined): boolean {
  return status === "published";
}

export function filterPublishedLessons<T extends { status?: string | null }>(
  lessons: readonly T[],
): T[] {
  return lessons.filter((lesson) => isPublishedLessonStatus(lesson.status));
}
