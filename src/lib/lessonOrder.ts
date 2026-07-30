import { Lesson, Level, LessonPosition, Module } from "./appTypes";

export type RoadmapItem =
  | { kind: "lesson"; lesson: Lesson }
  | { kind: "draft"; id: string };

/**
 * Builds the roadmap's display order once, for every consumer.
 *
 * `items` keeps drafts so the roadmap can render an "Đang chỉnh sửa" card in
 * the right slot. `orderedLessons` drops them, and is the only list that may
 * feed computeLessonStatuses: a draft can never appear in completedLessons,
 * so leaving it in the chain would lock every lesson behind it forever.
 */
export function buildRoadmapItems(
  modules: Module[],
  positions: LessonPosition[],
  unlockedLevels: Level[],
): { items: RoadmapItem[]; orderedLessons: Lesson[] } {
  const unlockedModules = modules.filter((m) => unlockedLevels.includes(m.level));
  const unlockedModuleIds = new Set(unlockedModules.map((m) => m.id));
  const draftPositions = positions.filter(
    (p) => p.status === "draft" && unlockedModuleIds.has(p.moduleId),
  );

  const items: RoadmapItem[] = [];
  unlockedModules.forEach((m) => {
    const combined: { orderIndex: number; item: RoadmapItem }[] = [
      ...m.lessons.map((l) => ({
        orderIndex: l.orderIndex ?? 0,
        item: { kind: "lesson" as const, lesson: l },
      })),
      ...draftPositions
        .filter((p) => p.moduleId === m.id)
        .map((p) => ({ orderIndex: p.orderIndex, item: { kind: "draft" as const, id: p.id } })),
    ];
    combined.sort((a, b) => a.orderIndex - b.orderIndex);
    combined.forEach((c) => items.push(c.item));
  });

  const orderedLessons = items
    .filter((i): i is { kind: "lesson"; lesson: Lesson } => i.kind === "lesson")
    .map((i) => i.lesson);

  return { items, orderedLessons };
}
