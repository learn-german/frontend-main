import { LessonStatus } from "./completion";

export function lessonsNeededToCatchUp(
  gapPercentagePoint: number | null,
  totalRequiredLessons: number,
): number {
  if (!gapPercentagePoint || gapPercentagePoint <= 0 || totalRequiredLessons <= 0) return 0;
  // Cancel percentage round-trip noise before ceil (e.g. one lesson becoming 1.000000000000001).
  return Math.max(1, Math.ceil((gapPercentagePoint / 100) * totalRequiredLessons - Number.EPSILON * totalRequiredLessons * 4));
}

const PLANNED_LESSON_COUNT = 3;

export function selectPlannedLessons<T extends { id: string }>(
  orderedLessons: T[],
  lessonStatuses: Record<string, LessonStatus>,
  completedLessons: string[],
): T[] {
  const currentIdx = orderedLessons.findIndex((l) => lessonStatuses[l.id] === "current");
  if (currentIdx === -1) {
    return orderedLessons.filter((l) => !completedLessons.includes(l.id)).slice(0, PLANNED_LESSON_COUNT);
  }
  return orderedLessons.slice(currentIdx, currentIdx + PLANNED_LESSON_COUNT);
}
