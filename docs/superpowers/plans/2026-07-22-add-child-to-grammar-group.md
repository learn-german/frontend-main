# Add Child to Grammar Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins append one or more child exercises to an existing grammar exercise parent group.

**Architecture:** Reuse the existing admin modal with an explicit mode and append context. Resolve legacy null group IDs before insert, retain the current validation and entry UI, and keep new children last by assigning order values after the lesson maximum.

**Tech Stack:** React 19, TypeScript 5.8, Supabase JS, existing Node assertion script via `tsx`.

## Global Constraints

- This branch is stacked on `codex/hierarchical-grammar-groups` and does not duplicate PR #60 changes.
- Do not add packages, database migrations, learner changes, or scoring changes.
- Support unlimited child entries in one save.
- Keep the modal open with entered data after a failure.

---

### Task 1: Append group ID decision

**Files:**
- Modify: `src/lib/grammarExerciseGroups.ts`
- Modify: `src/lib/grammarExerciseGroups.test.ts`

**Interfaces:**
- Produces: `resolveAppendGroupId(groupId: string | null | undefined, createId: () => string): { groupId: string; assignedLegacyId: boolean }`.

- [ ] **Step 1: Add the failing assertions**

```ts
import { resolveAppendGroupId } from "./grammarExerciseGroups";
let calls = 0;
assert.deepEqual(resolveAppendGroupId("existing", () => { calls += 1; return "new"; }), {
  groupId: "existing",
  assignedLegacyId: false,
});
assert.equal(calls, 0);
assert.deepEqual(resolveAppendGroupId(null, () => { calls += 1; return "new"; }), {
  groupId: "new",
  assignedLegacyId: true,
});
assert.equal(calls, 1);
```

- [ ] **Step 2: Verify RED**

Run: `npx tsx src/lib/grammarExerciseGroups.test.ts`

Expected: FAIL because the export is absent.

- [ ] **Step 3: Implement the helper**

```ts
export function resolveAppendGroupId(
  groupId: string | null | undefined,
  createId: () => string,
): { groupId: string; assignedLegacyId: boolean } {
  return groupId
    ? { groupId, assignedLegacyId: false }
    : { groupId: createId(), assignedLegacyId: true };
}
```

- [ ] **Step 4: Verify GREEN and commit**

Run: `npx tsx src/lib/grammarExerciseGroups.test.ts`

Run: `npm run lint`

Expected: both exit 0.

Commit: `feat: resolve append group IDs`

### Task 2: Admin append-child flow

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx`

**Interfaces:**
- Consumes: `resolveAppendGroupId` from Task 1.
- Produces: parent header action `onAddChildren(group, groupIndex)` and modal modes `create-group | append-children | edit`.

- [ ] **Step 1: Add explicit modal context**

Add:

```ts
type ModalMode = "create-group" | "append-children" | "edit";
interface AppendContext {
  groupId: string | null;
  legacyExerciseIds: string[];
  groupNumber: number;
}
```

`openCreate` sets `create-group`; `openEdit` sets `edit`; new `openAppendChildren` sets `append-children`, initializes a blank entry with the group type, stores the lesson maximum plus one, and records all legacy exercise IDs.

- [ ] **Step 2: Add the header action**

Pass `onAddChildren` through `ExerciseGroupList` and `SortableExerciseGroupRow`. Render:

```tsx
<button
  type="button"
  disabled={disabled}
  onClick={(event) => { event.stopPropagation(); onAddChildren(exerciseGroup, groupIndex); }}
>
  <Plus className="h-3.5 w-3.5" /> Thêm câu con
</button>
```

The action stays outside the accordion toggle button and drag listeners.

- [ ] **Step 3: Adapt modal copy and locked type**

Use `modalMode` for title, select disabled state, add-entry visibility and primary button copy. In append mode show `Thêm câu con vào Câu {groupNumber}`, disable the type select, preserve the existing unlimited `Thêm câu cùng loại` control, and show `Thêm N câu con` on submit.

- [ ] **Step 4: Implement normal and legacy inserts**

For append mode:

1. Call `resolveAppendGroupId(appendContext.groupId, crypto.randomUUID)`.
2. If `assignedLegacyId`, update all `legacyExerciseIds` to the new group ID and abort on error.
3. Insert all payloads with the resolved group ID and `order_index: createStartOrder + index`.
4. If insert fails after legacy assignment, update legacy IDs back to null before showing the error.
5. On success toast `Đã thêm N câu con.`, close and refetch.

Existing create and edit branches keep their current behavior.

- [ ] **Step 5: Complete verification**

Run: `npx tsx src/lib/grammarExerciseGroups.test.ts`

Run: `npm run lint`

Run: `npm run build`

Expected: all exit 0.

Inspect: `git diff --check`, `git status --short`, and `git diff codex/hierarchical-grammar-groups...HEAD --stat`.

Commit: `feat: append children to grammar exercise groups`
