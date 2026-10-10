import { Lesson, Level, LessonPosition, Module } from "./appTypes";

export type RoadmapItem =
  | { kind: "lesson"; lesson: Lesson }
  | { kind: "draft"; id: string };

/**
 * Builds the roadmap's display order once, for every consumer.
 *
 * Draft `lesson_positions` are omitted: a draft must not show on the learner
 * roadmap, including the "Đang chỉnh sửa" placeholder. `orderedLessons` is the
 * only list that may feed computeLessonStatuses.
 * `positions` stays in the signature so callers that still load them compile.
 */
export function buildRoadmapItems(
  modules: Module[],
  _positions: LessonPosition[],
  unlockedLevels: Level[],
): { items: RoadmapItem[]; orderedLessons: Lesson[] } {
  const unlockedModules = modules.filter((m) => unlockedLevels.includes(m.level));

  const items: RoadmapItem[] = [];
  unlockedModules.forEach((m) => {
    const combined: { orderIndex: number; item: RoadmapItem }[] = [
      ...m.lessons.map((l) => ({
        orderIndex: l.orderIndex ?? 0,
        item: { kind: "lesson" as const, lesson: l },
      })),
    ];
    combined.sort((a, b) => a.orderIndex - b.orderIndex);
    combined.forEach((c) => items.push(c.item));
  });

  const orderedLessons = items
    .filter((i): i is { kind: "lesson"; lesson: Lesson } => i.kind === "lesson")
    .map((i) => i.lesson);

  return { items, orderedLessons };
}
