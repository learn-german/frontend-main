# Admin exercise management: group by Module like Content Management

## Problem

`AdminQuizSection.tsx` (tabs Nghe/Đọc) and `AdminGrammarExerciseSection.tsx` (tab Ngữ pháp)
each render a **flat list of lesson-groups**, with the module name shown only as a text
subtitle (`{group.module_title} · N câu hỏi`). Lesson order comes from
`.order("order_index")` on the `lessons` table alone — this does not guarantee lessons
from the same module stay adjacent in the same order as Content Management, which sorts
two levels deep (`modules.order_index` → `lessons.order_index`, see
`AdminContentSection.tsx:110-118`).

Content Management (`AdminContentSection.tsx`) already organizes lessons as a nested
**Module (collapsible) → Lesson** accordion, with module/lesson order fully controlled
there (drag-and-drop writing `order_index`).

## Goal

Both exercise-management tabs (Ngữ pháp, Nghe, Đọc) must group and order their lesson
lists exactly like Content Management: nested **Module (collapsible) → Lesson
(collapsible, existing behavior unchanged)**, using the same module/lesson order as
Content Management. Exercise management stays **read-only** with respect to
module/lesson order — no drag-and-drop is added there; ordering is decided solely by
Content Management.

## Design

### 1. Shared ordering hook

Add `src/lib/hooks/useModuleOrder.ts`:

```ts
export interface ModuleOrder {
  id: string;
  title_vi: string;
  level: string;
  order_index: number;
  lessonIds: string[]; // in lesson.order_index order
}

export function useModuleOrder(): { modules: ModuleOrder[]; loading: boolean }
```

Fetches `modules(id, title_vi, level, order_index, lessons(id, order_index))` sorted the
same way as `AdminContentSection.fetchModules` (`.order("order_index")` on modules,
`.order("order_index", { referencedTable: "lessons" })`). This is the single source of
truth for module/lesson grouping and order in both exercise-management tabs.

### 2. Render changes in `AdminQuizSection.tsx` and `AdminGrammarExerciseSection.tsx`

- Keep existing per-lesson data fetching (questions/exercises/clips/passages) and the
  existing per-lesson accordion row (chevron, title, count, expand/collapse) unchanged.
- Wrap that per-lesson list in an outer **Module accordion**: for each `ModuleOrder`
  entry (in its given order), render a collapsible header (chevron + `level` +
  lesson count) matching `AdminContentSection`'s module row style; when expanded, render
  the lesson-group rows for that module's `lessonIds`, in that order.
- Remove the now-redundant `module_title` subtitle line from each lesson row (it's
  shown once by the parent Module header instead).
- Two independent `expanded` state maps: one keyed by `module.id` (new), one keyed by
  `lesson.id` (existing, unchanged behavior).
- Modules default to **collapsed**, matching Content Management's current default.

### 3. Search behavior (unchanged semantics)

The existing search box continues to filter by lesson title / module title. A module is
rendered only if at least one of its lessons matches; only matching lessons render
inside it (same filter result as today, just re-grouped visually).

### 4. No DB/schema changes

No new columns, no new tables. `useModuleOrder` reads existing `order_index` columns
already used by Content Management.

## Out of scope

- No changes to student-facing pages (`QuizPage.tsx`, `GrammarExercisePage.tsx`).
- No drag-and-drop reordering added to exercise management — order is decided
  exclusively by Content Management.
- No changes to how questions/exercises are grouped *within* a lesson (existing
  `group_id`/clip/passage grouping logic is untouched).

## Testing

- `npm run lint` (TypeScript check).
- Manual verification in browser: confirm Ngữ pháp/Nghe/Đọc tabs show lessons nested
  under collapsible Module headers in the same order as Quản lý Nội dung, search still
  filters correctly, and existing per-lesson CRUD (add/edit/delete question, upload
  clip/passage) still works unchanged.
