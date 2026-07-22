export interface GroupableGrammarExercise {
  id: string;
  type: string;
  groupId?: string | null;
  orderIndex: number;
}

export interface GrammarExerciseGroup<T extends GroupableGrammarExercise> {
  key: string;
  type: T["type"];
  exercises: T[];
}

export type GroupSelectionState = "none" | "some" | "all";

const getGroupKey = (exercise: GroupableGrammarExercise): string =>
  exercise.groupId
    ? `group:${exercise.groupId}:${exercise.type}`
    : `exercise:${exercise.id}:${exercise.type}`;

export function groupGrammarExercises<T extends GroupableGrammarExercise>(
  exercises: readonly T[],
): GrammarExerciseGroup<T>[] {
  const sorted = [...exercises].sort(
    (left, right) => left.orderIndex - right.orderIndex || left.id.localeCompare(right.id),
  );
  const groups = new Map<string, GrammarExerciseGroup<T>>();

  for (const exercise of sorted) {
    const key = getGroupKey(exercise);
    const group = groups.get(key);
    if (group) {
      group.exercises.push(exercise);
    } else {
      groups.set(key, { key, type: exercise.type, exercises: [exercise] });
    }
  }

  return [...groups.values()];
}

export function flattenGroupsWithOrder<T extends GroupableGrammarExercise>(
  groups: readonly GrammarExerciseGroup<T>[],
): Array<{ exercise: T; orderIndex: number }> {
  return groups.flatMap((group) => group.exercises).map((exercise, orderIndex) => ({ exercise, orderIndex }));
}

export function getGroupSelectionState(
  ids: readonly string[],
  selectedIds: ReadonlySet<string>,
): GroupSelectionState {
  const selectedCount = ids.filter((id) => selectedIds.has(id)).length;
  if (selectedCount === 0) return "none";
  if (selectedCount === ids.length) return "all";
  return "some";
}

export function toggleGroupSelection(
  ids: readonly string[],
  selectedIds: ReadonlySet<string>,
): Set<string> {
  const next = new Set(selectedIds);
  const allSelected = ids.every((id) => next.has(id));

  for (const id of ids) {
    if (allSelected) next.delete(id);
    else next.add(id);
  }

  return next;
}

export function moveGroup<T>(items: readonly T[], active: T, over: T): T[] {
  const fromIndex = items.indexOf(active);
  const toIndex = items.indexOf(over);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return [...items];
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function resolveAppendGroupId(
  groupId: string | null | undefined,
  createId: () => string,
): { groupId: string; assignedLegacyId: boolean } {
  return groupId
    ? { groupId, assignedLegacyId: false }
    : { groupId: createId(), assignedLegacyId: true };
}
