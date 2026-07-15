# Vocab Tab Reorder + Exercise Category Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the "Từ vựng" tab to the front of the learner-facing tab bar, and add a `category` dimension (`'nguphap' | 'nghe' | 'doc'`) to the existing quiz mechanism (`quiz_questions`, `lesson_progress`, `quiz-submit`, `lesson-complete`, admin CRUD) so future Listening/Reading/Grammar exercise features can reuse the same infrastructure without their scores overwriting each other.

**Architecture:** The existing quiz system (4 question types, generic client renderer, generic Edge Function scorer, admin CRUD) is reused as-is — only a `category` column is threaded through every layer that currently assumes "one quiz per lesson." `lesson_progress`'s primary key grows from `(user_id, lesson_id)` to `(user_id, lesson_id, category)` so each exercise category gets its own score row. The "mark lesson complete" flow and Roadmap's unlock logic are pinned to `category = 'nguphap'` so future optional Nghe/Đọc exercises never affect lesson-completion/progression semantics.

**Tech Stack:** React 19, TypeScript 5.8, Supabase (Postgres + Edge Functions/Deno), Tailwind CSS v4.

## Global Constraints

- Không thêm `type` mới cho `quiz_questions` — Richtig/Falsch và viết-lại-câu (tính năng tương lai, ngoài phạm vi plan này) sẽ tái dùng `multiple-choice`/`fill-blank` đã có.
- Category chỉ có 3 giá trị: `'nguphap' | 'nghe' | 'doc'`.
- "Đánh dấu đã học" / hoàn thành bài học (Roadmap) luôn gắn với `category = 'nguphap'` — không được để Nghe/Đọc ảnh hưởng tới tiến trình mở khóa.
- Không đổi UI học viên cho tab Nghe/Đọc/tên tab Quiz trong plan này (thuộc dự án sau) — chỉ chuẩn bị hạ tầng.
- Không sửa `src/lib/database.types.ts` bằng tay (file này không tồn tại trong repo).
- Node: `source ~/.nvm/nvm.sh && nvm use 20` trước khi chạy `npm run dev`/`npm run lint`.
- Dự án không có test runner — verification là `npm run lint` (tsc --noEmit) + kiểm tra trực tiếp trên Supabase (BEGIN/ROLLBACK) cho phần DB/Edge Function.

---

### Task 1: Đưa tab Từ vựng lên đầu (Dự án 1)

**Files:**
- Modify: `src/pages/LessonDetailPage.tsx:64-69`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks (fully independent of Tasks 2-8).

- [ ] **Step 1: Reorder `BOTTOM_TABS`**

Find:

```tsx
  const BOTTOM_TABS: { id: BottomTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: "quiz", label: "Quiz", Icon: HelpCircle },
    { id: "nghe", label: "Nghe", Icon: Headphones },
    { id: "doc", label: "Đọc", Icon: FileText },
    { id: "tuvung", label: "Từ vựng", Icon: BookOpen },
  ];
```

Replace with:

```tsx
  const BOTTOM_TABS: { id: BottomTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: "tuvung", label: "Từ vựng", Icon: BookOpen },
    { id: "quiz", label: "Quiz", Icon: HelpCircle },
    { id: "nghe", label: "Nghe", Icon: Headphones },
    { id: "doc", label: "Đọc", Icon: FileText },
  ];
```

Do NOT change `useState<BottomTab>("quiz")` (line 41) — the default active tab when the page loads stays "quiz", only the tab bar's visual order changes.

- [ ] **Step 2: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Manual browser verification**

Mount `LessonDetailPage` with mock props (same throwaway-harness pattern used earlier this session: `dbgtest.html`/`dbgtest.tsx` at repo root importing `../src/index.css`, deleted after use). Confirm the bottom tab bar now reads Từ vựng / Quiz / Nghe / Đọc (in that order), and that Quiz is still the tab shown by default on load.

- [ ] **Step 4: Commit**

```bash
git add src/pages/LessonDetailPage.tsx
git commit -m "feat: move Vocabulary tab to the front of the lesson bottom tab bar"
```

---

### Task 2: Migration — `category` on `quiz_questions` + `lesson_progress`

**Files:**
- Create: `supabase/migrations/20260715000011_exercise_category.sql`

**Interfaces:**
- Consumes: existing `quiz_questions` table (`supabase/migrations/20260624000001_initial_schema.sql:67-78`), existing `quiz_questions_public` view (`supabase/migrations/20260624000003_helpers.sql:12-25`, the latest of the view's several redefinitions), existing `lesson_progress` table with `PRIMARY KEY (user_id, lesson_id)` (`supabase/migrations/20260624000001_initial_schema.sql:100-106`).
- Produces: `quiz_questions.category TEXT NOT NULL DEFAULT 'nguphap' CHECK (category IN ('nguphap','nghe','doc'))`; `quiz_questions_public` view including `category`; `lesson_progress.category` with the same type/check, and a new composite primary key `(user_id, lesson_id, category)`. All consumed by Tasks 3-8.

- [ ] **Step 1: Confirm the live primary key constraint name on `lesson_progress`**

Load the Supabase MCP tools if not already loaded (`ToolSearch` with query `"select:mcp__6c5f47ff-759a-40a7-ae05-33e169423511__execute_sql,mcp__6c5f47ff-759a-40a7-ae05-33e169423511__apply_migration,mcp__6c5f47ff-759a-40a7-ae05-33e169423511__list_projects"`), then run via `execute_sql`:

```sql
SELECT conname FROM pg_constraint
WHERE conrelid = 'lesson_progress'::regclass AND contype = 'p';
```

Expected: one row. Postgres's default naming for an unnamed table-level `PRIMARY KEY` is `<table>_pkey`, so this should print `lesson_progress_pkey` — but confirm with this query rather than assuming, since the migration's `DROP CONSTRAINT` must reference the exact real name.

- [ ] **Step 2: Write the migration file**

Use the exact constraint name confirmed in Step 1 (write `lesson_progress_pkey` below only if that's what Step 1 printed; otherwise substitute the real name):

```sql
-- =============================================================================
-- DeutschPath — exercise category (nguphap/nghe/doc) on quiz_questions +
-- lesson_progress, so future Listening/Reading exercises can reuse the
-- existing quiz mechanism without their scores overwriting each other.
-- =============================================================================

-- 1. quiz_questions: tag every question with which exercise category it
--    belongs to. Existing rows (all currently serving the "Quiz" tab)
--    backfill to 'nguphap' via the DEFAULT.
ALTER TABLE quiz_questions
  ADD COLUMN category TEXT NOT NULL DEFAULT 'nguphap'
  CHECK (category IN ('nguphap', 'nghe', 'doc'));

-- 2. quiz_questions_public view: add category (still no correct_answer).
DROP VIEW IF EXISTS quiz_questions_public;

CREATE VIEW quiz_questions_public AS
  SELECT
    id,
    lesson_id,
    type,
    category,
    question_text,
    audio_text,
    options,
    matching_pairs,
    explanation,
    order_index
  FROM quiz_questions;

GRANT SELECT ON quiz_questions_public TO authenticated;

-- 3. lesson_progress: each exercise category gets its own score row instead
--    of all categories sharing one (user_id, lesson_id) row. Existing rows
--    (all currently from the "Quiz"/completion flow) backfill to 'nguphap'
--    via the DEFAULT, then become part of the new composite primary key.
ALTER TABLE lesson_progress
  ADD COLUMN category TEXT NOT NULL DEFAULT 'nguphap'
  CHECK (category IN ('nguphap', 'nghe', 'doc'));

ALTER TABLE lesson_progress DROP CONSTRAINT lesson_progress_pkey;
ALTER TABLE lesson_progress ADD PRIMARY KEY (user_id, lesson_id, category);
```

- [ ] **Step 3: Apply the migration**

Via the `apply_migration` MCP tool (name: `exercise_category`, using the SQL from Step 2).

- [ ] **Step 4: Verify backfill did not change row counts or existing data**

```sql
SELECT category, count(*) FROM quiz_questions GROUP BY category;
SELECT category, count(*) FROM lesson_progress GROUP BY category;
```

Expected: every existing row in both tables shows `category = 'nguphap'`; the counts match each table's total row count from before this migration (no rows lost, none duplicated).

- [ ] **Step 5: Verify the new composite primary key actually allows multiple categories per lesson**

Run inside a transaction that's rolled back so no test data persists — substitute a real `user_id` (from `SELECT id FROM profiles LIMIT 1`) and a real `lesson_id` (from `SELECT id FROM lessons LIMIT 1`) for the placeholders below:

```sql
BEGIN;

INSERT INTO lesson_progress (user_id, lesson_id, category, quiz_score)
VALUES ('<real-user-id>', '<real-lesson-id>', 'nguphap', 90)
ON CONFLICT (user_id, lesson_id, category) DO UPDATE SET quiz_score = 90;

INSERT INTO lesson_progress (user_id, lesson_id, category, quiz_score)
VALUES ('<real-user-id>', '<real-lesson-id>', 'nghe', 70)
ON CONFLICT (user_id, lesson_id, category) DO UPDATE SET quiz_score = 70;

-- Expect 2 rows: one nguphap/90, one nghe/70 — proving the two categories
-- no longer collide on the same (user_id, lesson_id) row.
SELECT category, quiz_score FROM lesson_progress
WHERE user_id = '<real-user-id>' AND lesson_id = '<real-lesson-id>';

ROLLBACK;
```

Expected: 2 rows returned, one per category, with the distinct scores — confirms the old `(user_id, lesson_id)`-only conflict target is gone.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260715000011_exercise_category.sql
git commit -m "feat: add exercise category (nguphap/nghe/doc) to quiz_questions and lesson_progress"
```

---

### Task 3: `lesson-complete` Edge Function — pin to `category = 'nguphap'`

**Files:**
- Modify: `supabase/functions/lesson-complete/index.ts:50-95`

**Interfaces:**
- Consumes: Task 2's `lesson_progress.category` column and new composite primary key.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Filter the idempotency check by category**

Find:

```ts
    // Idempotency check: already completed?
    const { data: existing } = await supabase
      .from("lesson_progress")
      .select("lesson_id")
      .eq("user_id", user.id)
      .eq("lesson_id", lessonId)
      .maybeSingle();
```

Replace with:

```ts
    // Idempotency check: already completed? Pinned to 'nguphap' — this is
    // the "mark lesson complete" flow, unaffected by optional Nghe/Đọc
    // exercise attempts, which live in separate category rows.
    const { data: existing } = await supabase
      .from("lesson_progress")
      .select("lesson_id")
      .eq("user_id", user.id)
      .eq("lesson_id", lessonId)
      .eq("category", "nguphap")
      .maybeSingle();
```

- [ ] **Step 2: Insert with the category set**

Find:

```ts
    // Insert lesson_progress
    await supabase.from("lesson_progress").insert({
      user_id: user.id,
      lesson_id: lessonId,
    });
```

Replace with:

```ts
    // Insert lesson_progress
    await supabase.from("lesson_progress").insert({
      user_id: user.id,
      lesson_id: lessonId,
      category: "nguphap",
    });
```

- [ ] **Step 3: Deploy and verify**

Deploy via the Supabase MCP `deploy_edge_function` tool (name: `lesson-complete`, using the updated file content). Confirm deployment succeeds with no errors (check via `get_edge_function` or deployment logs).

Since invoking this function end-to-end requires a real authenticated user session (not available in this sandbox), verify correctness by re-reading the diff against Task 2's schema: confirm every `lesson_progress` read/write in this file now includes `category`, and that no other query in the file references `lesson_progress` without it.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/lesson-complete/index.ts
git commit -m "fix: pin lesson-complete's lesson_progress row to category='nguphap'"
```

---

### Task 4: `quiz-submit` Edge Function — accept and filter by `category`

**Files:**
- Modify: `supabase/functions/quiz-submit/index.ts`

**Interfaces:**
- Consumes: Task 2's `quiz_questions.category`/`lesson_progress.category` columns.
- Produces: the `quiz-submit` request body now requires a `category` field — consumed by Task 6 (`QuizPage.tsx`'s submit call).

- [ ] **Step 1: Read `category` from the request body**

Find:

```ts
    const body = await req.json();
    const lesson_id: string = body.lesson_id;
    const answers: Record<string, string> = body.answers;

    if (!lesson_id || !answers) {
      return new Response(JSON.stringify({ error: "lesson_id and answers required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
```

Replace with:

```ts
    const body = await req.json();
    const lesson_id: string = body.lesson_id;
    const answers: Record<string, string> = body.answers;
    const category: string = body.category;

    if (!lesson_id || !answers || !category) {
      return new Response(JSON.stringify({ error: "lesson_id, answers, and category required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["nguphap", "nghe", "doc"].includes(category)) {
      return new Response(JSON.stringify({ error: "invalid category" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
```

- [ ] **Step 2: Filter the scored questions by category**

Find:

```ts
    // Read quiz_questions base table (has correct_answer, never exposed to client)
    const { data: questions, error: qErr } = await supabase
      .from("quiz_questions")
      .select("id, type, correct_answer")
      .eq("lesson_id", lesson_id);
```

Replace with:

```ts
    // Read quiz_questions base table (has correct_answer, never exposed to client)
    const { data: questions, error: qErr } = await supabase
      .from("quiz_questions")
      .select("id, type, correct_answer")
      .eq("lesson_id", lesson_id)
      .eq("category", category);
```

- [ ] **Step 3: Filter the idempotency check by category**

Find:

```ts
    // Idempotency: check if already completed
    const { data: existing } = await supabase
      .from("lesson_progress")
      .select("lesson_id")
      .eq("user_id", user.id)
      .eq("lesson_id", lesson_id)
      .maybeSingle();
```

Replace with:

```ts
    // Idempotency: check if already completed (for this category specifically)
    const { data: existing } = await supabase
      .from("lesson_progress")
      .select("lesson_id")
      .eq("user_id", user.id)
      .eq("lesson_id", lesson_id)
      .eq("category", category)
      .maybeSingle();
```

- [ ] **Step 4: Upsert keyed on the new composite conflict target**

Find:

```ts
    // UPSERT lesson_progress (idempotent)
    await supabase.from("lesson_progress").upsert(
      { user_id: user.id, lesson_id, quiz_score: score },
      { onConflict: "user_id,lesson_id" },
    );
```

Replace with:

```ts
    // UPSERT lesson_progress (idempotent, per category)
    await supabase.from("lesson_progress").upsert(
      { user_id: user.id, lesson_id, category, quiz_score: score },
      { onConflict: "user_id,lesson_id,category" },
    );
```

- [ ] **Step 5: Deploy and verify**

Deploy via the Supabase MCP `deploy_edge_function` tool (name: `quiz-submit`). Confirm deployment succeeds with no errors.

As in Task 3, full end-to-end invocation requires a real user session unavailable in this sandbox. Verify by re-reading the diff: confirm `category` flows from the request body into both the question filter and the `lesson_progress` upsert's conflict target, and that the new 400-response validation (missing/invalid category) doesn't break the existing "lesson_id and answers required" check's shape (still returns 400 with a JSON `error` field, matching the client's existing error handling in `QuizPage.tsx:146-148`, which only checks `error || !data`, not the specific message).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/quiz-submit/index.ts
git commit -m "feat: require and filter by category in quiz-submit scoring"
```

---

### Task 5: `useUserStats.ts` — pin learner stats to `category = 'nguphap'`

**Files:**
- Modify: `src/lib/hooks/useUserStats.ts:35-38`

**Interfaces:**
- Consumes: Task 2's `lesson_progress.category` column.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Filter the `lesson_progress` query**

Find:

```ts
      supabase
        .from("lesson_progress")
        .select("lesson_id, quiz_score")
        .eq("user_id", userId),
```

Replace with:

```ts
      supabase
        .from("lesson_progress")
        .select("lesson_id, quiz_score")
        .eq("user_id", userId)
        .eq("category", "nguphap"),
```

This keeps `completedLessons`/`quizScores` (used by Roadmap sequencing and the Quiz tab's displayed score) scoped to exactly the same rows they covered before this feature — one row per `(user_id, lesson_id)` — since `'nguphap'` is the only category that existed before Task 2's migration. Future Nghe/Đọc category rows are invisible to this hook, by design.

- [ ] **Step 2: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useUserStats.ts
git commit -m "fix: scope useUserStats' lesson_progress query to category='nguphap'"
```

---

### Task 6: `appTypes.ts` + `useQuizQuestions.ts` — thread `category` through

**Files:**
- Modify: `src/lib/appTypes.ts:31-40`
- Modify: `src/lib/hooks/useQuizQuestions.ts`

**Interfaces:**
- Consumes: Task 2's `quiz_questions_public` view now including `category`.
- Produces: `QuizQuestion.category: "nguphap" | "nghe" | "doc"` and `useQuizQuestions(lessonId: string, category: "nguphap" | "nghe" | "doc")` — both consumed by Task 7 (`QuizPage.tsx`).

- [ ] **Step 1: Add `category` to `QuizQuestion`**

In `src/lib/appTypes.ts`, find:

```ts
export interface QuizQuestion {
  id: string;
  type: "multiple-choice" | "fill-blank" | "matching" | "listening";
  questionText: string;
  audioText?: string;
  options?: string[];
  matchingPairs?: { de: string; vi: string }[];
  explanation: string;
  correctAnswer?: string;
}
```

Replace with:

```ts
export interface QuizQuestion {
  id: string;
  type: "multiple-choice" | "fill-blank" | "matching" | "listening";
  category: "nguphap" | "nghe" | "doc";
  questionText: string;
  audioText?: string;
  options?: string[];
  matchingPairs?: { de: string; vi: string }[];
  explanation: string;
  correctAnswer?: string;
}
```

- [ ] **Step 2: Add a `category` parameter to `useQuizQuestions`, filter the query, and map the new column**

Replace the full contents of `src/lib/hooks/useQuizQuestions.ts` with:

```ts
import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { QuizQuestion } from "../appTypes";

export function useQuizQuestions(lessonId: string, category: "nguphap" | "nghe" | "doc") {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lessonId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    supabase
      .from("quiz_questions_public")
      .select("id, type, category, question_text, audio_text, options, matching_pairs, explanation, order_index")
      .eq("lesson_id", lessonId)
      .eq("category", category)
      .order("order_index")
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError(fetchError.message);
        } else {
          setQuestions(
            (data ?? []).map((q) => ({
              id: q.id as string,
              type: q.type as QuizQuestion["type"],
              category: q.category as QuizQuestion["category"],
              questionText: q.question_text as string,
              audioText: (q.audio_text as string | null) ?? undefined,
              options: (q.options as string[] | null) ?? undefined,
              matchingPairs: (q.matching_pairs as { de: string; vi: string }[] | null) ?? undefined,
              explanation: (q.explanation as string | null) ?? "",
            })),
          );
        }
        setLoading(false);
      });
  }, [lessonId, category]);

  return { questions, loading, error };
}
```

- [ ] **Step 3: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: this will FAIL at this point — `src/pages/QuizPage.tsx:35` still calls `useQuizQuestions(lesson.id)` with only one argument, which no longer matches the new required 2-argument signature. This is expected; Task 7 fixes the call site. Confirm the error is specifically about `useQuizQuestions`'s call in `QuizPage.tsx` and nothing else, then proceed — do not fix `QuizPage.tsx` in this task.

- [ ] **Step 4: Commit**

```bash
git add src/lib/appTypes.ts src/lib/hooks/useQuizQuestions.ts
git commit -m "feat: add category to QuizQuestion type and useQuizQuestions hook"
```

---

### Task 7: `QuizPage.tsx` — wire `category` prop through to fetch and submit

**Files:**
- Modify: `src/pages/QuizPage.tsx`

**Interfaces:**
- Consumes: Task 6's `useQuizQuestions(lessonId, category)` signature and `QuizQuestion.category`.
- Produces: `QuizPageProps.category?: "nguphap" | "nghe" | "doc"` (optional, defaults to `"nguphap"` — preserves current behavior for the existing Quiz tab, which is the only caller today). Not consumed by any other task in this plan; a future Nghe/Đọc feature would pass `"nghe"`/`"doc"` explicitly.

- [ ] **Step 1: Add an optional `category` prop, defaulting to `"nguphap"`**

Find:

```tsx
interface QuizPageProps {
  lesson: Lesson;
  onQuizFinished: (scorePercentage: number, xpEarned: number) => void;
  onNavigateHome: () => void;
  onNextLesson: () => void;
}
```

Replace with:

```tsx
interface QuizPageProps {
  lesson: Lesson;
  category?: "nguphap" | "nghe" | "doc";
  onQuizFinished: (scorePercentage: number, xpEarned: number) => void;
  onNavigateHome: () => void;
  onNextLesson: () => void;
}
```

Find:

```tsx
export const QuizPage: React.FC<QuizPageProps> = ({
  lesson,
  onQuizFinished,
  onNavigateHome,
  onNextLesson,
}) => {
  const { questions, loading: questionsLoading, error: questionsError } = useQuizQuestions(lesson.id);
```

Replace with:

```tsx
export const QuizPage: React.FC<QuizPageProps> = ({
  lesson,
  category = "nguphap",
  onQuizFinished,
  onNavigateHome,
  onNextLesson,
}) => {
  const { questions, loading: questionsLoading, error: questionsError } = useQuizQuestions(lesson.id, category);
```

- [ ] **Step 2: Send `category` in the submit request body**

Find:

```tsx
    const { data, error } = await supabase.functions.invoke("quiz-submit", {
      body: { lesson_id: lesson.id, answers: finalAnswers },
    });
```

Replace with:

```tsx
    const { data, error } = await supabase.functions.invoke("quiz-submit", {
      body: { lesson_id: lesson.id, answers: finalAnswers, category },
    });
```

- [ ] **Step 3: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors (this resolves the expected failure from Task 6, Step 3).

- [ ] **Step 4: Manual browser verification — confirm no regression to the existing Quiz tab**

Mount `QuizPage` with a mock `lesson` (no `category` prop passed, relying on the default) via a throwaway harness (deleted after use), mocking `useQuizQuestions`/Supabase as needed, or drive it through the real dev server's existing Quiz flow if a working Supabase session is available. Confirm: questions load exactly as before (still implicitly `'nguphap'`, matching all pre-existing quiz content backfilled to that category in Task 2), and the app still compiles/runs with `App.tsx`'s existing `<QuizPage lesson={...} onQuizFinished={...} ... />` call site (which does not pass `category` — confirm this still type-checks and behaves identically to before this plan, since the prop is optional with a matching default).

- [ ] **Step 5: Commit**

```bash
git add src/pages/QuizPage.tsx
git commit -m "feat: wire category prop through QuizPage's fetch and submit"
```

---

### Task 8: `AdminQuizSection.tsx` — category field in admin CRUD

**Files:**
- Modify: `src/pages/admin/AdminQuizSection.tsx`

**Interfaces:**
- Consumes: Task 2's `quiz_questions.category` column.
- Produces: nothing consumed by later tasks (last task in this plan).

- [ ] **Step 1: Add `category` to the local `QuizQuestion` interface and `EditForm`**

Find:

```tsx
interface QuizQuestion {
  id: string;
  lesson_id: string;
  type: "multiple-choice" | "fill-blank" | "matching" | "listening";
  question_text: string;
  audio_text: string | null;
  options: string[] | null;
  matching_pairs: { de: string; vi: string }[] | null;
  correct_answer: string;
  explanation: string;
  order_index: number;
}
```

Replace with:

```tsx
interface QuizQuestion {
  id: string;
  lesson_id: string;
  type: "multiple-choice" | "fill-blank" | "matching" | "listening";
  category: "nguphap" | "nghe" | "doc";
  question_text: string;
  audio_text: string | null;
  options: string[] | null;
  matching_pairs: { de: string; vi: string }[] | null;
  correct_answer: string;
  explanation: string;
  order_index: number;
}
```

Find:

```tsx
const EMPTY_FORM: EditForm = {
  type: "multiple-choice",
  question_text: "",
  audio_text: null,
  options: ["", "", "", ""],
  matching_pairs: [{ de: "", vi: "" }],
  correct_answer: "",
  explanation: "",
  order_index: 0,
};
```

Replace with:

```tsx
const EMPTY_FORM: EditForm = {
  type: "multiple-choice",
  category: "nguphap",
  question_text: "",
  audio_text: null,
  options: ["", "", "", ""],
  matching_pairs: [{ de: "", vi: "" }],
  correct_answer: "",
  explanation: "",
  order_index: 0,
};
```

Add a category label map next to `TYPE_LABELS`. Find:

```tsx
const TYPE_LABELS: Record<string, string> = {
  "multiple-choice": "Trắc nghiệm",
  "fill-blank": "Điền chỗ trống",
  "matching": "Ghép đôi",
  "listening": "Nghe hiểu",
};
```

Replace with:

```tsx
const TYPE_LABELS: Record<string, string> = {
  "multiple-choice": "Trắc nghiệm",
  "fill-blank": "Điền chỗ trống",
  "matching": "Ghép đôi",
  "listening": "Nghe hiểu",
};

const CATEGORY_LABELS: Record<string, string> = {
  "nguphap": "Ngữ pháp",
  "nghe": "Nghe",
  "doc": "Đọc",
};
```

- [ ] **Step 2: Populate `category` when opening the edit modal**

Find:

```tsx
  const openEdit = (q: QuizQuestion) => {
    setEditId(q.id);
    setEditLessonId(q.lesson_id);
    setForm({
      type: q.type,
      question_text: q.question_text,
      audio_text: q.audio_text,
      options: q.options ?? ["", "", "", ""],
      matching_pairs: q.matching_pairs ?? [{ de: "", vi: "" }],
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      order_index: q.order_index,
    });
    setModalOpen(true);
  };
```

Replace with:

```tsx
  const openEdit = (q: QuizQuestion) => {
    setEditId(q.id);
    setEditLessonId(q.lesson_id);
    setForm({
      type: q.type,
      category: q.category,
      question_text: q.question_text,
      audio_text: q.audio_text,
      options: q.options ?? ["", "", "", ""],
      matching_pairs: q.matching_pairs ?? [{ de: "", vi: "" }],
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      order_index: q.order_index,
    });
    setModalOpen(true);
  };
```

- [ ] **Step 3: Include `category` in the save payload**

Find:

```tsx
    const payload = {
      type: form.type,
      question_text: form.question_text,
      audio_text: form.audio_text || null,
      options: (form.type === "multiple-choice" || form.type === "listening") ? form.options?.filter(Boolean) ?? null : null,
      matching_pairs: form.type === "matching" ? form.matching_pairs?.filter((p) => p.de || p.vi) ?? null : null,
      correct_answer: form.correct_answer,
      explanation: form.explanation,
      order_index: form.order_index,
    };
```

Replace with:

```tsx
    const payload = {
      type: form.type,
      category: form.category,
      question_text: form.question_text,
      audio_text: form.audio_text || null,
      options: (form.type === "multiple-choice" || form.type === "listening") ? form.options?.filter(Boolean) ?? null : null,
      matching_pairs: form.type === "matching" ? form.matching_pairs?.filter((p) => p.de || p.vi) ?? null : null,
      correct_answer: form.correct_answer,
      explanation: form.explanation,
      order_index: form.order_index,
    };
```

- [ ] **Step 4: Add a category `<select>` next to the type selector in the modal**

Find:

```tsx
            {/* Type & Order */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Loại câu hỏi</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as EditForm["type"] }))}
                  className={inputCls}
                >
                  {Object.entries(TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Thứ tự (#)</label>
                <input
                  type="number"
                  value={form.order_index}
                  onChange={(e) => setForm((prev) => ({ ...prev, order_index: parseInt(e.target.value) || 0 }))}
                  className={inputCls}
                  min={0}
                />
              </div>
            </div>
```

Replace with:

```tsx
            {/* Category, Type & Order */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Dạng bài tập</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as EditForm["category"] }))}
                  className={inputCls}
                >
                  {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Loại câu hỏi</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as EditForm["type"] }))}
                  className={inputCls}
                >
                  {Object.entries(TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Thứ tự (#)</label>
                <input
                  type="number"
                  value={form.order_index}
                  onChange={(e) => setForm((prev) => ({ ...prev, order_index: parseInt(e.target.value) || 0 }))}
                  className={inputCls}
                  min={0}
                />
              </div>
            </div>
```

- [ ] **Step 5: Show a category badge in the question list table**

Find:

```tsx
                    <tr className="bg-slate-50">
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-8">#</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-28">Loại</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500">Câu hỏi</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-40">Đáp án đúng</th>
                      <th className="px-4 py-2 w-20"></th>
                    </tr>
```

Replace with:

```tsx
                    <tr className="bg-slate-50">
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-8">#</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-24">Dạng</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-28">Loại</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500">Câu hỏi</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-40">Đáp án đúng</th>
                      <th className="px-4 py-2 w-20"></th>
                    </tr>
```

Find:

```tsx
                      <tr key={q.id} className="hover:bg-slate-50/50 group">
                        <td className="px-4 py-2.5 text-slate-400 text-xs">{q.order_index}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${TYPE_COLORS[q.type] ?? "bg-slate-100 text-slate-500"}`}>
                            {TYPE_LABELS[q.type] ?? q.type}
                          </span>
                        </td>
```

Replace with:

```tsx
                      <tr key={q.id} className="hover:bg-slate-50/50 group">
                        <td className="px-4 py-2.5 text-slate-400 text-xs">{q.order_index}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-slate-100 text-slate-500">
                            {CATEGORY_LABELS[q.category] ?? q.category}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${TYPE_COLORS[q.type] ?? "bg-slate-100 text-slate-500"}`}>
                            {TYPE_LABELS[q.type] ?? q.type}
                          </span>
                        </td>
```

And the empty-state row's `colSpan` must grow from 5 to 6 to match the new column count. Find:

```tsx
                    {group.questions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">Chưa có câu hỏi nào.</td>
                      </tr>
                    )}
```

Replace with:

```tsx
                    {group.questions.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-400 text-sm">Chưa có câu hỏi nào.</td>
                      </tr>
                    )}
```

- [ ] **Step 6: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 7: Manual browser verification**

Mount `AdminQuizSection` via a throwaway harness (deleted after use), or drive it through the real dev server if Supabase data is reachable. Confirm: existing questions display a "Ngữ pháp" category badge (matching the migration's backfill), the create/edit modal has a working "Dạng bài tập" selector defaulting to "Ngữ pháp" for new questions, and saving persists the selected category (reload and confirm the badge reflects the saved value).

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/AdminQuizSection.tsx
git commit -m "feat: add exercise category field to admin quiz question CRUD"
```
