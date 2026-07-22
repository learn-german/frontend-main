# Hierarchical Grammar Exercise Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present grammar exercises as reorderable parent groups with automatically numbered children, bulk deletion in admin, collapsible answering for learners, and the German `Schlüsselgrammatik` tab label.

**Architecture:** Introduce one pure grouping/reordering module consumed by both admin and learner pages. Keep `group_id` and `order_index` as the persisted model: group numbers are derived from array position, while drag-and-drop rewrites contiguous `order_index` values across one lesson. Preserve answer and submit contracts keyed by exercise ID.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Supabase JS, Tailwind CSS 4, existing `@dnd-kit/core` and `@dnd-kit/sortable`, Node assertions executed with existing `tsx`.

## Global Constraints

- Do not add a database table or migration.
- Do not add an npm package.
- Treat each null `group_id` as its own one-child group.
- Split corrupt groups by `group_id + type`.
- Do not limit the number of children in a group.
- Keep `grammar-submit` request and response contracts unchanged.
- Do not modify the existing unrelated `package-lock.json` working-tree change.

---

## File map

- Create `src/lib/grammarExerciseGroups.ts`: pure group, numbering-order, flatten and selection helpers.
- Create `src/lib/grammarExerciseGroups.test.ts`: executable assertions for grouping, legacy data, reorder flattening and group selection state.
- Modify `src/lib/appTypes.ts`: expose `orderIndex` on public grammar exercises.
- Modify `src/lib/hooks/useGrammarExercises.ts`: map selected `order_index` into `orderIndex`.
- Modify `src/pages/admin/AdminGrammarExerciseSection.tsx`: grouped accordion table, selection, bulk deletion, automatic create order and drag-and-drop persistence.
- Modify `src/pages/GrammarExercisePage.tsx`: replace page navigation with learner group accordions and globally gated submit.
- Modify `src/pages/LessonDetailPage.tsx`: rename the tab label.
- Remove `src/lib/grammarExercisePaging.ts` after its consumer migrates.

### Task 1: Pure grouping and reordering model

**Files:**
- Create: `src/lib/grammarExerciseGroups.ts`
- Create: `src/lib/grammarExerciseGroups.test.ts`
- Modify: `src/lib/appTypes.ts`
- Modify: `src/lib/hooks/useGrammarExercises.ts`

**Interfaces:**
- Produces: `groupGrammarExercises<T extends GroupableGrammarExercise>(exercises: readonly T[]): GrammarExerciseGroup<T>[]`
- Produces: `flattenGroupsWithOrder<T>(groups: readonly GrammarExerciseGroup<T>[]): Array<{ exercise: T; orderIndex: number }>`
- Produces: `getGroupSelectionState(ids: readonly string[], selectedIds: ReadonlySet<string>): "none" | "some" | "all"`
- Produces: public `GrammarExercise.orderIndex: number`.

- [ ] **Step 1: Write failing executable tests**

Create assertions covering null group isolation, mixed-type safety, stable ordering, reorder flattening and tri-state selection:

```ts
import assert from "node:assert/strict";
import { flattenGroupsWithOrder, getGroupSelectionState, groupGrammarExercises } from "./grammarExerciseGroups";

const items = [
  { id: "b", type: "translation", groupId: "g1", orderIndex: 4 },
  { id: "a", type: "translation", groupId: "g1", orderIndex: 2 },
  { id: "legacy-1", type: "translation", orderIndex: 8 },
  { id: "legacy-2", type: "translation", orderIndex: 9 },
  { id: "mixed", type: "word_reorder", groupId: "g1", orderIndex: 10 },
] as const;
const groups = groupGrammarExercises(items);
assert.deepEqual(groups.map((group) => group.exercises.map((exercise) => exercise.id)), [
  ["a", "b"], ["legacy-1"], ["legacy-2"], ["mixed"],
]);
assert.deepEqual(flattenGroupsWithOrder([groups[2], groups[0], groups[1], groups[3]]).map(({ exercise, orderIndex }) => [exercise.id, orderIndex]), [
  ["legacy-2", 0], ["a", 1], ["b", 2], ["legacy-1", 3], ["mixed", 4],
]);
assert.equal(getGroupSelectionState(["a", "b"], new Set()), "none");
assert.equal(getGroupSelectionState(["a", "b"], new Set(["a"])), "some");
assert.equal(getGroupSelectionState(["a", "b"], new Set(["a", "b"])), "all");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx tsx src/lib/grammarExerciseGroups.test.ts`

Expected: FAIL because `./grammarExerciseGroups` does not exist.

- [ ] **Step 3: Implement the pure module and public order mapping**

Use an explicit group key that includes type:

```ts
export interface GroupableGrammarExercise {
  id: string;
  type: string;
  groupId?: string | null;
  orderIndex: number;
}

export interface GrammarExerciseGroup<T> {
  key: string;
  type: T extends { type: infer K } ? K : string;
  exercises: T[];
}

const groupKey = (exercise: GroupableGrammarExercise) =>
  exercise.groupId ? `group:${exercise.groupId}:${exercise.type}` : `exercise:${exercise.id}:${exercise.type}`;
```

Sort a copied array by `orderIndex`, then `id`; preserve first group occurrence. Flatten groups in supplied order and assign contiguous zero-based order values. Add `orderIndex: number` to `GrammarExercise`, and map `e.order_index` in `useGrammarExercises`.

- [ ] **Step 4: Run tests, lint and commit**

Run: `npx tsx src/lib/grammarExerciseGroups.test.ts`

Expected: exit 0 with no assertion errors.

Run: `npm run lint`

Expected: exit 0.

Commit: `feat: add grammar exercise grouping model`

### Task 2: Admin grouped accordion, automatic numbering and bulk deletion

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx`

**Interfaces:**
- Consumes: grouping and selection helpers from Task 1.
- Produces: grouped admin presentation and deletion by an exact `string[]` of exercise IDs.

- [ ] **Step 1: Add a failing selection behavior assertion**

Extend the Task 1 test so toggling a parent selection is specified by a new pure helper:

```ts
import { toggleGroupSelection } from "./grammarExerciseGroups";
assert.deepEqual([...toggleGroupSelection(["a", "b"], new Set(["a"]))].sort(), ["a", "b"]);
assert.deepEqual([...toggleGroupSelection(["a", "b"], new Set(["a", "b", "x"]))].sort(), ["x"]);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx tsx src/lib/grammarExerciseGroups.test.ts`

Expected: FAIL because `toggleGroupSelection` is not exported.

- [ ] **Step 3: Implement selection helper and grouped admin UI**

Implement `toggleGroupSelection` without mutating its input. Replace `ExerciseTable` with `ExerciseGroupList` that receives `groups`, `expandedKeys`, `selectedIds` and existing action callbacks. Use a checkbox ref to apply indeterminate state:

```tsx
const checkboxRef = React.useRef<HTMLInputElement>(null);
React.useEffect(() => {
  if (checkboxRef.current) checkboxRef.current.indeterminate = selectionState === "some";
}, [selectionState]);
```

Render the group index as `groupIndex + 1` and child index as `${groupIndex + 1}.${childIndex + 1}`. Keep preview/edit/delete actions on child rows. Parent header toggles expansion; its checkbox stops propagation.

Add `selectedIds` state. When non-empty, render a bulk action bar. Replace single-target deletion internals with:

```ts
const deleteExerciseIds = async (ids: string[]) => {
  const { error } = await supabase.from("grammar_exercises").delete().in("id", ids);
  if (error) throw error;
};
```

Both single and bulk confirmation modals call this helper. Bulk success clears selected IDs; failure retains them.

- [ ] **Step 4: Remove manual ordering from create/edit modal**

Compute `nextOrder` as:

```ts
const nextOrder = group.exercises.reduce((max, exercise) => Math.max(max, exercise.order_index), -1) + 1;
```

Store `createStartOrder` when opening create. Remove the `Thứ tự (#)` input. On insert, override each payload with `order_index: createStartOrder + index`. On edit, preserve the existing order value in its payload.

- [ ] **Step 5: Verify and commit**

Run: `npx tsx src/lib/grammarExerciseGroups.test.ts`

Run: `npm run lint`

Expected: both exit 0.

Commit: `feat: group and bulk delete admin grammar exercises`

### Task 3: Drag-and-drop parent group persistence

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx`

**Interfaces:**
- Consumes: `flattenGroupsWithOrder` from Task 1.
- Produces: lesson-local sortable parent groups persisted through `grammar_exercises.order_index`.

- [ ] **Step 1: Add a failing reorder helper assertion**

Specify a `moveGroup` helper:

```ts
import { moveGroup } from "./grammarExerciseGroups";
assert.deepEqual(moveGroup(["1", "2", "3", "4", "5"], "5", "2"), ["1", "5", "2", "3", "4"]);
assert.deepEqual(moveGroup(["1", "2"], "missing", "1"), ["1", "2"]);
```

- [ ] **Step 2: Run the test and verify RED, then implement**

Run: `npx tsx src/lib/grammarExerciseGroups.test.ts`

Expected: FAIL because `moveGroup` is absent.

Implement a non-mutating helper using indices and splice; invalid/equal IDs return a copied unchanged array. Re-run the test and expect exit 0.

- [ ] **Step 3: Add sortable group headers**

Use existing `DndContext`, `PointerSensor`, `KeyboardSensor`, `closestCenter`, `SortableContext`, `verticalListSortingStrategy`, `useSortable`, and `sortableKeyboardCoordinates`. The sortable ID is the group key. Put `listeners` and `attributes` only on a `GripVertical` handle.

On drag end, find source and destination within the same lesson. Capture the previous exercise array for rollback, reorder the lesson's grouped exercises optimistically, flatten them, and update local `order_index` values.

- [ ] **Step 4: Persist and rollback safely**

Persist each flattened row with explicit ID and order:

```ts
const results = await Promise.all(
  ordered.map(({ exercise, orderIndex }) =>
    supabase.from("grammar_exercises").update({ order_index: orderIndex }).eq("id", exercise.id),
  ),
);
const firstError = results.find((result) => result.error)?.error;
if (firstError) throw firstError;
```

Disable drag handles for the lesson while saving. On error restore the captured local array and show a warning toast; on success fetch the server state. Do not modify another lesson.

- [ ] **Step 5: Verify and commit**

Run: `npx tsx src/lib/grammarExerciseGroups.test.ts`

Run: `npm run lint`

Expected: both exit 0.

Commit: `feat: reorder grammar exercise groups`

### Task 4: Learner collapsible groups and global submit gate

**Files:**
- Modify: `src/pages/GrammarExercisePage.tsx`
- Delete: `src/lib/grammarExercisePaging.ts`

**Interfaces:**
- Consumes: `groupGrammarExercises` and `GrammarExercise.orderIndex` from Task 1.
- Preserves: `grammar-submit` body `{ lesson_id: string, answers: Record<string, string> }`.

- [ ] **Step 1: Replace page grouping with parent groups**

Create `groups = useMemo(() => groupGrammarExercises(exercises), [exercises])` and `expandedGroupKeys: Set<string>`, initially empty. Remove `currentPageIdx`, page navigation, `collectPageAnswers`, and the nine-question split. Keep all answer state keyed by exercise ID.

- [ ] **Step 2: Render learner accordions with automatic numbering**

For every group, render a button header containing chevron, `Câu {groupIndex + 1}`, type label, child count, and completion state. Only render children while its key is expanded. Pass `subIndex={childIndex}` to `ExerciseCard`, but replace letter rendering with a `numberLabel` prop containing `${groupIndex + 1}.${childIndex + 1}`.

Use a responsive grid inside each expanded group; do not slice the child array. Multiple groups may remain expanded.

- [ ] **Step 3: Gate and submit all answers**

Compute:

```ts
const allAnswered = exercises.every((exercise) => getAnswerStringFor(exercise) !== "");
const collectAllAnswers = () => Object.fromEntries(
  exercises.map((exercise) => [exercise.id, getAnswerStringFor(exercise)]),
);
```

Show a single `Nộp bài` button disabled until `allAnswered`. Submit `collectAllAnswers()` with the existing Edge Function call. Retry clears answers and expanded groups. Results iterate `groups`, using `${groupIndex + 1}.${childIndex + 1}` labels.

- [ ] **Step 4: Verify and commit**

Run: `rg "grammarExercisePaging|groupExercisesIntoPages|currentPageIdx" src`

Expected: no matches.

Run: `npm run lint`

Expected: exit 0.

Commit: `feat: show collapsible grammar exercise groups`

### Task 5: German label and final verification

**Files:**
- Modify: `src/pages/LessonDetailPage.tsx`

**Interfaces:**
- Produces: tab label `Schlüsselgrammatik` without changing tab ID or content visibility.

- [ ] **Step 1: Change the exact label**

Replace only the tab label:

```ts
{ id: "nguphapthenchot", label: "Schlüsselgrammatik", Icon: GraduationCap }
```

- [ ] **Step 2: Run complete automated verification**

Run: `npx tsx src/lib/grammarExerciseGroups.test.ts`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0.

Run: `npm run build`

Expected: Vite production build exits 0.

- [ ] **Step 3: Browser verification**

Start the existing Vite app and verify:

1. Admin groups are initially collapsed and show automatic parent numbers.
2. Group and child checkboxes produce correct partial/full selection and bulk delete confirmation.
3. Deleting `1.2` renumbers the old `1.3` to `1.2`; deleting group `2` renumbers old group `3` to `2`.
4. Creating more than ten children succeeds with contiguous stored `order_index` values.
5. Dragging group `5` to position `2` immediately produces `2`/`2.1`, survives refresh, and is reflected on learner view.
6. Learner groups start closed, can be opened independently, retain entered answers after closing, and allow submit only after every child is answered.
7. Lesson tab reads `Schlüsselgrammatik`.

- [ ] **Step 4: Inspect scope and commit**

Run: `git diff --check`

Run: `git status --short`

Confirm only planned source/test changes plus the user's pre-existing `package-lock.json` modification are present. Commit only the planned label/final cleanup files with message `feat: finalize hierarchical grammar exercises`.
