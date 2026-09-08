# Exercise Set Title Numbering Per Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đánh số mặc định `Bài tập N` theo từng `(lesson, category)` khi tạo set, và renumber dữ liệu đã lưu sai (vd. Nghe hiện 22–24 → 1–3).

**Architecture:** Tách hàm thuần `countSetsForCategory` trong `exerciseSetTitle.ts` (test được, không import supabase). `createSet` / `createReadingSet` dùng chung hàm đó. Migration SQL one-shot rewrite `order_index` + `title` theo `PARTITION BY lesson_id, category`.

**Tech Stack:** TypeScript, React hook `useExerciseSets`, Supabase SQL migrations, `node:test` via `npx tsx --test`.

## Global Constraints

- Code English; UI strings Vietnamese (`Bài tập N`).
- No `any`; named exports only.
- Do not hand-edit `src/lib/database.types.ts`.
- No new npm packages.
- Do not change learner UI rendering — titles come from DB.
- Do not change question-number labels inside a set (out of scope; see listening-question-numbering spec).
- Run `npm run lint` after TypeScript edits.
- Spec: `docs/superpowers/specs/2026-09-08-exercise-set-title-per-category-design.md`.

## File map

| File | Role |
|---|---|
| `src/lib/exerciseSetTitle.ts` | Pure helpers: title + count for create |
| `src/lib/exerciseSetTitle.test.ts` | Unit tests for count + existing title helpers |
| `src/lib/hooks/useExerciseSets.ts` | Wire `createSet` / `createReadingSet` to category-scoped count |
| `supabase/migrations/20260908120000_renumber_exercise_set_titles_per_category.sql` | One-time data fix |

---

### Task 1: Pure helper `countSetsForCategory` + tests

**Files:**
- Modify: `src/lib/exerciseSetTitle.ts`
- Modify: `src/lib/exerciseSetTitle.test.ts`

**Interfaces:**
- Produces: `countSetsForCategory(sets: { lessonId: string; category: string }[], lessonId: string, category: string): number`
- Consumes: none (standalone pure function)

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/exerciseSetTitle.test.ts`:

```ts
import { countSetsForCategory } from "./exerciseSetTitle";

test("countSetsForCategory counts only matching lesson + category", () => {
  const sets = [
    { lessonId: "l1", category: "nguphap" },
    { lessonId: "l1", category: "nguphap" },
    { lessonId: "l1", category: "nghe" },
    { lessonId: "l2", category: "nghe" },
  ];
  assert.equal(countSetsForCategory(sets, "l1", "nghe"), 1);
  assert.equal(countSetsForCategory(sets, "l1", "nguphap"), 2);
  assert.equal(countSetsForCategory(sets, "l1", "doc"), 0);
  assert.equal(countSetsForCategory(sets, "l2", "nghe"), 1);
});

test("nextDefaultSetTitle uses category count not cross-category total", () => {
  const sets = [
    { lessonId: "l1", category: "nguphap" },
    { lessonId: "l1", category: "nguphap" },
    { lessonId: "l1", category: "nghe" },
  ];
  const ngheCount = countSetsForCategory(sets, "l1", "nghe");
  assert.equal(nextDefaultSetTitle(ngheCount), "Bài tập 2");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/exerciseSetTitle.test.ts`  
Expected: FAIL — `countSetsForCategory` is not exported / not a function

- [ ] **Step 3: Implement minimal helper**

Add to `src/lib/exerciseSetTitle.ts`:

```ts
export function countSetsForCategory(
  sets: { lessonId: string; category: string }[],
  lessonId: string,
  category: string,
): number {
  return sets.filter((s) => s.lessonId === lessonId && s.category === category).length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx tsx --test src/lib/exerciseSetTitle.test.ts`  
Expected: PASS (all tests in file)

- [ ] **Step 5: Commit**

```bash
git add src/lib/exerciseSetTitle.ts src/lib/exerciseSetTitle.test.ts
git commit -m "$(cat <<'EOF'
feat(exercises): count set titles per lesson category

EOF
)"
```

---

### Task 2: Wire `createSet` / `createReadingSet` to category count

**Files:**
- Modify: `src/lib/hooks/useExerciseSets.ts`

**Interfaces:**
- Consumes: `countSetsForCategory`, `nextDefaultSetTitle` from `../exerciseSetTitle`
- Produces: unchanged public API of `useExerciseSets` (`createSet`, `createReadingSet` signatures stay the same)

- [ ] **Step 1: Update imports**

In `src/lib/hooks/useExerciseSets.ts`, change:

```ts
import { nextDefaultSetTitle, planSetRenumber } from "../exerciseSetTitle";
```

to:

```ts
import { countSetsForCategory, nextDefaultSetTitle, planSetRenumber } from "../exerciseSetTitle";
```

- [ ] **Step 2: Fix `createSet` count**

Replace:

```ts
const existingCountForLesson = sets.filter((s) => s.lessonId === forLessonId).length;
```

with:

```ts
const existingCountForLesson = countSetsForCategory(sets, forLessonId, category);
```

inside `createSet` only.

- [ ] **Step 3: Align `createReadingSet` to same helper**

Replace:

```ts
const existingCountForLesson = sets.filter((s) => s.lessonId === forLessonId && s.category === "doc").length;
```

with:

```ts
const existingCountForLesson = countSetsForCategory(sets, forLessonId, "doc");
```

- [ ] **Step 4: Lint**

Run: `npm run lint`  
Expected: exit 0

- [ ] **Step 5: Re-run unit tests**

Run: `npx tsx --test src/lib/exerciseSetTitle.test.ts`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/hooks/useExerciseSets.ts
git commit -m "$(cat <<'EOF'
fix(exercises): name new sets from per-category count

EOF
)"
```

---

### Task 3: SQL migration — renumber existing titles

**Files:**
- Create: `supabase/migrations/20260908120000_renumber_exercise_set_titles_per_category.sql`

**Interfaces:**
- Consumes: `exercise_sets(id, lesson_id, category, order_index, title)`
- Produces: for each `(lesson_id, category)`, contiguous `order_index` 0..n-1 and `title = 'Bài tập ' || (order_index + 1)`
- Tie-break: `ORDER BY order_index ASC, id ASC` (stable when duplicates)

- [ ] **Step 1: Add migration file**

Create `supabase/migrations/20260908120000_renumber_exercise_set_titles_per_category.sql`:

```sql
-- One-time fix: exercise set default titles were numbered across all
-- categories in a lesson (createSet counted every set). Renumber per
-- (lesson_id, category) so Nghe/Đọc/Ngữ pháp each start at Bài tập 1.
-- Overwrites custom titles — product uses default "Bài tập N" as display index.

WITH ranked AS (
  SELECT
    id,
    (row_number() OVER (
      PARTITION BY lesson_id, category
      ORDER BY order_index ASC, id ASC
    ) - 1) AS new_order_index
  FROM exercise_sets
)
UPDATE exercise_sets e
SET
  order_index = r.new_order_index,
  title = 'Bài tập ' || (r.new_order_index + 1)
FROM ranked r
WHERE e.id = r.id
  AND (
    e.order_index IS DISTINCT FROM r.new_order_index
    OR e.title IS DISTINCT FROM ('Bài tập ' || (r.new_order_index + 1))
  );
```

- [ ] **Step 2: Sanity-check SQL locally (optional but preferred)**

If local Supabase is available:

```bash
npx supabase db reset
# or apply only this migration against linked project after review
```

If no local DB: skip runtime apply here; still commit the file for deploy pipeline / manual apply.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260908120000_renumber_exercise_set_titles_per_category.sql
git commit -m "$(cat <<'EOF'
fix(db): renumber exercise_sets titles per category

EOF
)"
```

---

### Task 4: Manual verification checklist

**Files:** none (verification only)

- [ ] **Step 1: After migration is applied to the target DB**, open admin → **Bài tập nghe** → expand a lesson that previously showed high numbers (e.g. “Làm quen với tiếng Đức”).

Expected: sets labeled **Bài tập 1**, **Bài tập 2**, **Bài tập 3** (not 22+).

- [ ] **Step 2: Click “+ Thêm bài tập”** and create a new listening set for that lesson.

Expected: new set titled **Bài tập 4** (or next within nghe only), even if the same lesson has many ngữ pháp sets.

- [ ] **Step 3: Spot-check Đọc and Ngữ pháp** for the same lesson.

Expected: each category still starts at **Bài tập 1** independently.

- [ ] **Step 4: No code commit** unless a bug is found; if found, fix in a follow-up commit on the same branch.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| `createSet` counts by lesson + category | Task 2 |
| Align with reading behavior | Task 2 (`createReadingSet` uses same helper) |
| Unit test for category count | Task 1 |
| One-time renumber existing rows | Task 3 |
| Manual admin verification | Task 4 |
| Out of scope: question labels / schema / UI label rename | Not in plan |

No placeholders. Signatures consistent: `countSetsForCategory(sets, lessonId, category): number`.
