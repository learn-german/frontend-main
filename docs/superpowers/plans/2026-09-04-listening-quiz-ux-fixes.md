# Listening Quiz UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix listening quiz UX — auto-growing fill-blank inputs, wrap long MC options, variable MC option count (2–6), delete empty sets on last-question delete with renumber, and bulk-delete sets in the lesson list.

**Architecture:** Frontend-only changes. Shared learner components (`ExerciseAnswerInput`, `MultipleChoiceOptions`) get small CSS/behavior fixes. Pure helpers for blank width + set renumber live in `src/lib/`. Admin listening section gains variable MC options UI, set-empty cascade delete, and lesson-level bulk set delete — reusing `grammarMultipleChoice` add/remove and existing toast/modal patterns.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS v4, Supabase JS client, node:test + tsx.

## Global Constraints

- Code (variables, functions, types, technical comments): **English**
- UI text (labels, messages, placeholders): **Tiếng Việt**
- No `any` — use specific types or `unknown`
- Named exports only (except `App.tsx`)
- No new npm packages without asking
- Do not hand-edit `src/lib/database.types.ts`
- Scope: tab Nghe + shared components named in this plan; do not change Ngữ pháp/Đọc admin forms except via shared component side effects
- Run `npm run lint` after each task
- Spec: `docs/superpowers/specs/2026-09-04-listening-quiz-ux-fixes-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/blankInputSize.ts` | Create | Pure `blankInputCharWidth` for fill-blank sizing |
| `src/lib/blankInputSize.test.ts` | Create | Unit tests for blank width |
| `src/lib/exerciseSetTitle.ts` | Modify | `defaultSetTitleAt` + `planSetRenumber` |
| `src/lib/exerciseSetTitle.test.ts` | Modify | Tests for new helpers |
| `src/lib/grammarMultipleChoice.ts` | Modify | Add `MAX_MULTIPLE_CHOICE_OPTIONS = 6` |
| `src/components/ExerciseAnswerInput.tsx` | Modify | Auto-grow fill-blank inputs |
| `src/components/MultipleChoiceOptions.tsx` | Modify | Horizontal layout: wrap, no truncate |
| `src/components/MultipleChoiceOptions.test.tsx` | Modify | Assert wrap / no truncate |
| `src/pages/admin/AdminListeningExerciseSection.tsx` | Modify | MC add/remove; empty-set delete; bulk set delete |
| `src/lib/hooks/useExerciseSets.ts` | Modify | `deleteSets` + apply renumber updates |

---

### Task 1: Blank input size helper

**Files:**
- Create: `src/lib/blankInputSize.ts`
- Create: `src/lib/blankInputSize.test.ts`

**Interfaces:**
- Produces: `blankInputCharWidth(value: string): number`; constants `BLANK_INPUT_MIN_CHARS = 6`, `BLANK_INPUT_MAX_CHARS = 40`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  blankInputCharWidth,
  BLANK_INPUT_MIN_CHARS,
  BLANK_INPUT_MAX_CHARS,
} from "./blankInputSize";

test("empty value uses min width", () => {
  assert.equal(blankInputCharWidth(""), BLANK_INPUT_MIN_CHARS);
});

test("grows with content (+1 padding)", () => {
  assert.equal(blankInputCharWidth("hello"), 6); // max(5+1, 6) = 6
  assert.equal(blankInputCharWidth("hello!!"), 8); // 7+1
});

test("clamps at max", () => {
  const long = "x".repeat(100);
  assert.equal(blankInputCharWidth(long), BLANK_INPUT_MAX_CHARS);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/blankInputSize.test.ts`  
Expected: FAIL — cannot find module `./blankInputSize`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/blankInputSize.ts
export const BLANK_INPUT_MIN_CHARS = 6;
export const BLANK_INPUT_MAX_CHARS = 40;

/** Character-based width for fill-in-the-blank inputs (for CSS `ch` units). */
export function blankInputCharWidth(value: string): number {
  const len = value.length;
  const padded = (len === 0 ? 1 : len) + 1;
  return Math.min(Math.max(padded, BLANK_INPUT_MIN_CHARS), BLANK_INPUT_MAX_CHARS);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/blankInputSize.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/blankInputSize.ts src/lib/blankInputSize.test.ts
git commit -m "feat: add blank input auto-width helper"
```

---

### Task 2: Auto-grow fill-in-the-blank inputs

**Files:**
- Modify: `src/components/ExerciseAnswerInput.tsx` (fill_in_the_blank input ~lines 306–318)

**Interfaces:**
- Consumes: `blankInputCharWidth` from `src/lib/blankInputSize.ts`

- [ ] **Step 1: Update the fill_in_the_blank input**

Import `blankInputCharWidth`. On the blank `<input>`:

- Remove `w-28` from `className`
- Add `max-w-full` to `className`
- Add `style={{ width: \`${blankInputCharWidth(blankAnswers[index] ?? "")}ch\` }}`

Keep existing border / focus / result color classes unchanged.

- [ ] **Step 2: Lint**

Run: `npm run lint`  
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/ExerciseAnswerInput.tsx
git commit -m "fix(ux): auto-grow fill-in-the-blank answer inputs"
```

---

### Task 3: Multiple choice horizontal — wrap full text

**Files:**
- Modify: `src/components/MultipleChoiceOptions.tsx`
- Modify: `src/components/MultipleChoiceOptions.test.tsx`

**Interfaces:**
- Produces: horizontal `labelCls` = `"whitespace-pre-wrap"` (no truncate / max-w)

- [ ] **Step 1: Write the failing test assertion**

Replace / extend the horizontal layout test:

```tsx
test("horizontal layout wraps long options without truncate", () => {
  const html = renderToStaticMarkup(
    <MultipleChoiceOptions
      options={["A", "B", "C", "D"]}
      selectedIndex={undefined}
      onSelect={noop}
      exerciseId="e1"
      layout="horizontal"
    />,
  );
  assert.match(html, /flex flex-wrap gap-2/);
  assert.match(html, /inline-flex max-w-full items-center gap-1\.5/);
  assert.match(html, /whitespace-pre-wrap/);
  assert.doesNotMatch(html, /truncate/);
  assert.doesNotMatch(html, /max-w-\[10rem\]/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/MultipleChoiceOptions.test.tsx`  
Expected: FAIL on `whitespace-pre-wrap` / still has `truncate`

- [ ] **Step 3: Fix horizontal labelCls**

In `MultipleChoiceOptions.tsx`, change:

```tsx
const labelCls = layout === "horizontal"
  ? "whitespace-pre-wrap"
  : "whitespace-pre-wrap";
```

(Or simply `const labelCls = "whitespace-pre-wrap"` for both.)

- [ ] **Step 4: Run tests**

Run: `npm test -- src/components/MultipleChoiceOptions.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/MultipleChoiceOptions.tsx src/components/MultipleChoiceOptions.test.tsx
git commit -m "fix(ux): wrap long multiple-choice options in horizontal layout"
```

---

### Task 4: MAX options constant + set title renumber helpers

**Files:**
- Modify: `src/lib/grammarMultipleChoice.ts`
- Modify: `src/lib/exerciseSetTitle.ts`
- Modify: `src/lib/exerciseSetTitle.test.ts`

**Interfaces:**
- Produces: `MAX_MULTIPLE_CHOICE_OPTIONS = 6`
- Produces: `defaultSetTitleAt(index: number): string`
- Produces: `planSetRenumber(sets: { id: string; orderIndex: number }[]): { id: string; order_index: number; title: string }[]`
- `nextDefaultSetTitle(existingCount)` becomes `defaultSetTitleAt(existingCount)`

- [ ] **Step 1: Write failing tests for title helpers**

Append to `src/lib/exerciseSetTitle.test.ts`:

```ts
import { defaultSetTitleAt, nextDefaultSetTitle, planSetRenumber } from "./exerciseSetTitle";

test("defaultSetTitleAt is 1-based display title", () => {
  assert.equal(defaultSetTitleAt(0), "Bài tập 1");
  assert.equal(defaultSetTitleAt(2), "Bài tập 3");
});

test("nextDefaultSetTitle delegates to defaultSetTitleAt", () => {
  assert.equal(nextDefaultSetTitle(0), defaultSetTitleAt(0));
  assert.equal(nextDefaultSetTitle(4), "Bài tập 5");
});

test("planSetRenumber sorts by orderIndex and rewrites titles", () => {
  const plan = planSetRenumber([
    { id: "c", orderIndex: 5 },
    { id: "a", orderIndex: 1 },
    { id: "b", orderIndex: 3 },
  ]);
  assert.deepEqual(plan, [
    { id: "a", order_index: 0, title: "Bài tập 1" },
    { id: "b", order_index: 1, title: "Bài tập 2" },
    { id: "c", order_index: 2, title: "Bài tập 3" },
  ]);
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm test -- src/lib/exerciseSetTitle.test.ts`  
Expected: FAIL — `defaultSetTitleAt` / `planSetRenumber` not exported

- [ ] **Step 3: Implement helpers + MAX constant**

`src/lib/exerciseSetTitle.ts`:

```ts
export function defaultSetTitleAt(index: number): string {
  return `Bài tập ${index + 1}`;
}

export function nextDefaultSetTitle(existingCount: number): string {
  return defaultSetTitleAt(existingCount);
}

export function planSetRenumber(
  sets: { id: string; orderIndex: number }[],
): { id: string; order_index: number; title: string }[] {
  return [...sets]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((set, index) => ({
      id: set.id,
      order_index: index,
      title: defaultSetTitleAt(index),
    }));
}
```

In `src/lib/grammarMultipleChoice.ts`, after `MIN_MULTIPLE_CHOICE_OPTIONS`:

```ts
export const MAX_MULTIPLE_CHOICE_OPTIONS = 6;
```

Optionally guard `addOption`:

```ts
export const addOption = (form: ChoiceForm): ChoiceForm => {
  if (form.options.length >= MAX_MULTIPLE_CHOICE_OPTIONS) return form;
  return { ...form, options: [...form.options, ""] };
};
```

And `removeOption` already returns unchanged if index invalid; UI will not call when `length <= MIN`.

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/exerciseSetTitle.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/exerciseSetTitle.ts src/lib/exerciseSetTitle.test.ts src/lib/grammarMultipleChoice.ts
git commit -m "feat: add set renumber helpers and MC max options"
```

---

### Task 5: Admin listening — variable MC options (2–6)

**Files:**
- Modify: `src/pages/admin/AdminListeningExerciseSection.tsx` (`emptyForm`, `formFromRow`, `ListeningQuestionFields` multiple_choice branch ~lines 76–221)

**Interfaces:**
- Consumes: `addOption`, `removeOption`, `optionLabel`, `MIN_MULTIPLE_CHOICE_OPTIONS`, `MAX_MULTIPLE_CHOICE_OPTIONS` from `grammarMultipleChoice`
- Default new MC form options: `["", ""]`

- [ ] **Step 1: Change defaults**

In `emptyForm`, replace `["", "", "", ""]` with `["", ""]` for `multiple_choice`.

In `formFromRow`, replace fallbacks `["", "", "", ""]` with `["", ""]` (only when DB has no options — existing rows keep their stored length).

- [ ] **Step 2: Update ListeningQuestionFields MC UI**

Import `Plus`, `X` from lucide if not already; import `addOption`, `removeOption`, `MIN_MULTIPLE_CHOICE_OPTIONS`, `MAX_MULTIPLE_CHOICE_OPTIONS`.

Replace the fixed-4 block with:

```tsx
<label className={labelCls}>Phương án (tối thiểu 2)</label>
<div className="space-y-2">
  {form.options.map((opt, index) => (
    <div key={index} className="flex items-center gap-2">
      <input
        type="radio"
        name="mc-correct"
        checked={form.correctOptionIndex === index}
        onChange={() => onChange({ ...form, correctOptionIndex: index })}
        className="h-4 w-4 accent-orange-500"
        aria-label={`Đáp án đúng ${optionLabel(index)}`}
      />
      <span className="w-5 text-xs font-display font-bold text-slate-400">
        {optionLabel(index)}
      </span>
      <input
        type="text"
        value={opt}
        onChange={(e) => {
          const next = { options: form.options, correctIndex: form.correctOptionIndex };
          const updated = /* setOption */ {
            options: form.options.map((o, i) => (i === index ? e.target.value : o)),
            correctIndex: form.correctOptionIndex,
          };
          onChange({ ...form, options: updated.options, correctOptionIndex: updated.correctIndex });
        }}
        className={inputCls + " flex-1"}
        placeholder={`Phương án ${optionLabel(index)}`}
      />
      <button
        type="button"
        disabled={form.options.length <= MIN_MULTIPLE_CHOICE_OPTIONS}
        onClick={() => {
          const next = removeOption(
            { options: form.options, correctIndex: form.correctOptionIndex },
            index,
          );
          onChange({ ...form, options: next.options, correctOptionIndex: next.correctIndex });
        }}
        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:pointer-events-none"
        aria-label={`Xóa phương án ${optionLabel(index)}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  ))}
</div>
{form.options.length < MAX_MULTIPLE_CHOICE_OPTIONS && (
  <button
    type="button"
    onClick={() => {
      const next = addOption({
        options: form.options,
        correctIndex: form.correctOptionIndex,
      });
      onChange({ ...form, options: next.options, correctOptionIndex: next.correctIndex });
    }}
    className="mt-2 flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700"
  >
    <Plus className="h-3.5 w-3.5" /> Thêm phương án
  </button>
)}
```

Prefer importing `setOption` from `grammarMultipleChoice` instead of inline map for the text onChange.

- [ ] **Step 3: Lint**

Run: `npm run lint`  
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/AdminListeningExerciseSection.tsx
git commit -m "feat(admin-listening): variable multiple-choice options 2-6"
```

---

### Task 6: `deleteSets` + renumber in `useExerciseSets`

**Files:**
- Modify: `src/lib/hooks/useExerciseSets.ts`

**Interfaces:**
- Consumes: `planSetRenumber` from `exerciseSetTitle`
- Produces: `deleteSets(ids: string[], lessonId: string, category: string): Promise<{ error: string | null; deletedClipIds: string[] }>`
  - Deletes `exercise_sets` by ids
  - Returns clip ids that were on deleted sets and are no longer referenced by any remaining set (caller may delete `listening_clips`)
  - Renumbers remaining sets in that lesson+category via `planSetRenumber` and persists `order_index` + `title`
  - Calls `refetch()` on success

- [ ] **Step 1: Implement `deleteSets`**

```ts
import { nextDefaultSetTitle, planSetRenumber } from "../exerciseSetTitle";

const deleteSets = async (
  ids: string[],
  lessonId: string,
  category: string,
): Promise<{ error: string | null; deletedClipIds: string[] }> => {
  if (ids.length === 0) return { error: null, deletedClipIds: [] };

  const toDelete = sets.filter((s) => ids.includes(s.id));
  const clipIds = [
    ...new Set(
      toDelete
        .map((s) => s.audioClipId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];

  const { error } = await supabase.from("exercise_sets").delete().in("id", ids);
  if (error) return { error: error.message, deletedClipIds: [] };

  const remaining = sets.filter(
    (s) => s.lessonId === lessonId && s.category === category && !ids.includes(s.id),
  );
  const plan = planSetRenumber(
    remaining.map((s) => ({ id: s.id, orderIndex: s.orderIndex })),
  );
  await Promise.all(
    plan.map((row) =>
      supabase
        .from("exercise_sets")
        .update({ order_index: row.order_index, title: row.title })
        .eq("id", row.id),
    ),
  );

  // Clips still referenced by other sets (any lesson) must not be deleted
  const stillUsed = new Set(
    sets
      .filter((s) => !ids.includes(s.id) && s.audioClipId)
      .map((s) => s.audioClipId as string),
  );
  const deletedClipIds = clipIds.filter((id) => !stillUsed.has(id));

  refetch();
  return { error: null, deletedClipIds };
};
```

Export `deleteSets` from the hook return object.

Note: after delete, local `sets` in closure is stale for `stillUsed` — compute `stillUsed` from `sets.filter(s => !ids.includes(s.id))` before or after delete using pre-delete state (the snippet above uses pre-delete `sets` minus `ids`, which is correct).

- [ ] **Step 2: Lint**

Run: `npm run lint`  
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useExerciseSets.ts
git commit -m "feat: delete exercise sets and renumber titles in lesson"
```

---

### Task 7: Delete set when last question removed

**Files:**
- Modify: `src/pages/admin/AdminListeningExerciseSection.tsx` (`ListeningSetEditor` — `handleDelete`, `handleBulkDelete`; pass `onSetDeleted` / `deleteSets` from parent)

**Interfaces:**
- Consumes: `deleteSets` from `useExerciseSets`
- After question delete(s), if remaining count would be 0 → delete the set, delete orphan clips, toast, navigate back to list

- [ ] **Step 1: Wire props**

On `ListeningSetEditor`, add:

```ts
onDeleteEmptySet: () => Promise<{ error: string | null }>;
```

Parent implementation:

```ts
const handleDeleteEmptySet = async () => {
  if (!selectedSet) return { error: "Không tìm thấy bài tập." };
  const { error, deletedClipIds } = await deleteSets(
    [selectedSet.id],
    selectedSet.lessonId,
    "nghe",
  );
  if (!error && deletedClipIds.length > 0) {
    await supabase.from("listening_clips").delete().in("id", deletedClipIds);
  }
  return { error };
};
```

- [ ] **Step 2: Update `handleDelete`**

```ts
const handleDelete = async () => {
  if (!deleteTarget) return;
  const remainingAfter = setExercises.filter((ex) => ex.id !== deleteTarget.id).length;
  setDeleting(true);
  const { error } = await supabase.from("grammar_exercises").delete().eq("id", deleteTarget.id);
  if (error) {
    setDeleting(false);
    showToast("Xóa thất bại: " + error.message, "warning");
    return;
  }
  setDeleteTarget(null);
  if (remainingAfter === 0) {
    const { error: setError } = await onDeleteEmptySet();
    setDeleting(false);
    if (setError) {
      showToast("Đã xóa câu nhưng không xóa được bài tập: " + setError, "warning");
      return;
    }
    showToast("Đã xóa câu cuối — bài tập cũng được xóa.", "success");
    return; // parent clears selectedSetId inside onDeleteEmptySet or via callback
  }
  setDeleting(false);
  showToast("Đã xóa câu hỏi.", "success");
  await fetchSetData();
  onExercisesChanged();
};
```

Ensure parent clears `selectedSetId` when empty-set delete succeeds (do it inside the parent wrapper that calls `deleteSets`).

- [ ] **Step 3: Update `handleBulkDelete` similarly**

If `setExercises.length - selectedIds.size === 0` after successful question delete → same empty-set path and toast.

- [ ] **Step 4: Lint + commit**

```bash
git add src/pages/admin/AdminListeningExerciseSection.tsx
git commit -m "feat(admin-listening): delete set when last question is removed"
```

---

### Task 8: Bulk delete sets in lesson list

**Files:**
- Modify: `src/pages/admin/AdminListeningExerciseSection.tsx` (list view inside lesson accordion ~lines 1367–1418)

**Interfaces:**
- Consumes: `deleteSets`
- State: `selectedSetIds: Set<string>`, `bulkSetDeleteOpen: boolean`, scoped per expanded lesson (or global — clear when collapsing / changing lesson)

- [ ] **Step 1: Add selection UI**

Above the set list (next to “Thêm bài tập”):

- When `lessonSets.length > 0`, show checkbox “Chọn tất cả” for that lesson’s set ids.
- When `selectedSetIds` intersects this lesson’s sets: show button `Xóa {n} bài` opening confirm modal.

Change each set row from a full-width `<button>` to a `<div>` row:

- Left: checkbox (`stopPropagation` / not nested in navigate control)
- Middle: clickable area → `setSelectedSetId(set.id)`
- Keep status badge click `stopPropagation` as today

- [ ] **Step 2: Confirm modal + handler**

Mirror existing question bulk-delete modal copy:

```tsx
{/* title */} Xóa {selectedSetIds.size} bài tập đã chọn?
```

Handler:

```ts
const handleBulkDeleteSets = async (lessonId: string) => {
  const ids = [...selectedSetIds].filter((id) =>
    ngheSets.some((s) => s.id === id && s.lessonId === lessonId),
  );
  if (ids.length === 0) return;
  setDeletingSets(true);
  const { error, deletedClipIds } = await deleteSets(ids, lessonId, "nghe");
  if (!error && deletedClipIds.length > 0) {
    await supabase.from("listening_clips").delete().in("id", deletedClipIds);
  }
  setDeletingSets(false);
  if (error) {
    showToast("Xóa hàng loạt thất bại: " + error, "warning");
    return;
  }
  showToast(`Đã xóa ${ids.length} bài tập.`, "success");
  setBulkSetDeleteOpen(false);
  setSelectedSetIds(new Set());
  onExercisesChanged?.(); // or local fetchAll / refetch exercises counts
  await fetchAll(); // refresh question counts
};
```

- [ ] **Step 3: Lint**

Run: `npm run lint`  
Expected: no errors

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm test -- src/lib/blankInputSize.test.ts src/lib/exerciseSetTitle.test.ts src/components/MultipleChoiceOptions.test.tsx src/lib/listeningExerciseForm.test.ts
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminListeningExerciseSection.tsx
git commit -m "feat(admin-listening): bulk delete exercise sets in lesson list"
```

---

## Manual test checklist

1. Learner fill-blank: type a long answer — input grows; short answer stays compact; no overflow past card.
2. Learner MC with long options: full text visible (no `...`); short options still sit in a wrapping row.
3. Admin create MC: starts with 2 options; add up to 6; cannot remove below 2; save with 3 options works; reopen keeps 3.
4. Admin delete last question in a set: set disappears; remaining sets retitled `Bài tập 1…N`; editor closes to lesson list.
5. Admin bulk-select empty/`0 câu hỏi` sets → delete → list renumbered.
6. Toast copy in Vietnamese; no `window.alert`.

---

## Spec coverage (self-review)

| Spec section | Task |
|--------------|------|
| §1 Fill-blank auto-grow | Task 1–2 |
| §2 MC wrap / no truncate | Task 3 |
| §3 Variable MC 2–6 | Task 4 (MAX) + Task 5 |
| §4 Delete set on last question | Task 6–7 |
| §5 Renumber titles + order_index | Task 4 + 6 |
| §6 Bulk delete sets | Task 8 |
| No auto-cleanup on load | Honored (no task) |
| Clip orphan cleanup | Task 6–8 |
