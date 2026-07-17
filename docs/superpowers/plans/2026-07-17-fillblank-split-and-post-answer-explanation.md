# Fill-blank Field Split + Post-Answer Explanation Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the `fill-blank` question type's authoring into two DB-backed fields (`question_text` = plain prompt, `answer_text` = the `{{...}}` blank sentence) with full backward compatibility for existing un-migrated questions, and add a per-question "Giải thích" block that appears on the quiz-taking screen (all question types) right after the learner has answered.

**Architecture:** Data flows DB (`quiz_questions` table → `quiz_questions_public` view) → Edge Function (`quiz-submit`, reads base table directly) → React app (`useQuizQuestions` hook → `QuizPage.tsx` / `AdminQuizSection.tsx`). Both consumers of `{{...}}` blanks (the SQL view's security stripping and the Edge Function's scoring) apply the same fallback rule: prefer `answer_text`, fall back to `question_text` when `answer_text` is empty/NULL. The React layer mirrors that same fallback when deciding what to render.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + Deno Edge Functions), Tailwind CSS v4. No test runner exists in this repo (no vitest/jest, no local Supabase CLI or Deno binary available in this environment) — verification is `npm run lint` (tsc --noEmit) plus direct SQL checks via the Supabase MCP tools and manual browser checks, matching how every prior spec in `docs/superpowers/specs/` was verified.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-fillblank-split-fields-and-post-answer-explanation.md` — read it before starting if you need the "why", not just the "what".
- No new npm packages without asking the user first (project CLAUDE.md rule).
- Never hand-edit `src/lib/database.types.ts` — always regenerate it (here: via the Supabase MCP `generate_typescript_types` tool, since there's no local Supabase CLI in this environment).
- No `window.alert()`/`window.confirm()` — use `showToast()` (already used throughout `AdminQuizSection.tsx`).
- `correctAnswer`/real answer content must never reach the client outside the Edge Function — preserve the existing `quiz_questions_public` view's unconditional (type-independent) `{{...}}` stripping behavior for both `question_text` and `answer_text`.
- **Task 1 (migration) and Task 3 (edge function deploy) touch shared/live infrastructure (the real Supabase project). Stop and get explicit user confirmation immediately before calling `apply_migration` or `deploy_edge_function` — do not run them automatically just because the plan says so.**

---

## Task 1: Database migration — `answer_text` column + updated public view

**Files:**
- Create: `supabase/migrations/20260717000018_fillblank_answer_text.sql`
- Modify: `src/lib/database.types.ts` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `quiz_questions.answer_text` (`TEXT`, nullable) on the base table; `quiz_questions_public.answer_text` (`TEXT`, nullable, `{{...}}`-stripped to `{{blank}}`) on the view. Task 2 and Task 3 read these by exact name `answer_text`.

- [ ] **Step 1: Inspect current schema before changing it**

First resolve which Supabase project this repo is linked to (its `project_id`) via the Supabase MCP `mcp__6c5f47ff-759a-40a7-ae05-33e169423511__list_projects` tool (match by name/URL against `VITE_SUPABASE_URL` in `.env.local`) — every other Supabase MCP call below needs this `project_id`.

Then confirm the current `quiz_questions` columns and the current `quiz_questions_public` view definition match what this plan assumes (they should match `supabase/migrations/20260717000016_multiblank_fillblank_view.sql`, which is the last migration touching this view):

```
mcp__6c5f47ff-759a-40a7-ae05-33e169423511__list_tables
  project_id: <resolved project_id>
  schemas: ["public"]
```

Confirm `quiz_questions` has no `answer_text` column yet, and `quiz_questions_public` has columns: `id, lesson_id, type, category, question_text, audio_text, options, matching_pairs, audio_clip_id, reading_passage_id, explanation, order_index`. If anything differs from this, stop and re-read the migrations directory before continuing — the SQL below assumes this exact starting point.

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/20260717000018_fillblank_answer_text.sql`:

```sql
-- Split fill-blank authoring into two fields going forward: question_text
-- becomes a plain prompt (no {{...}}), answer_text holds the {{...}}
-- blank sentence. Existing fill-blank rows are NOT backfilled — they keep
-- {{...}} in question_text and answer_text stays NULL. Both the view
-- below and the quiz-submit Edge Function apply the same fallback rule
-- (prefer answer_text, fall back to question_text when answer_text is
-- empty/NULL) so pre-existing questions keep working unmigrated.
ALTER TABLE quiz_questions ADD COLUMN answer_text TEXT;

-- Recreate the public view to also expose answer_text, stripped with the
-- same unconditional (type-independent) {{...}} -> {{blank}} regex as
-- question_text already uses. regexp_replace(NULL, ...) returns NULL in
-- Postgres, so rows with no answer_text keep passing through as NULL
-- (not ''), letting the client tell "no answer_text" apart from "empty
-- answer_text".
DROP VIEW IF EXISTS quiz_questions_public;

CREATE VIEW quiz_questions_public AS
  SELECT
    id,
    lesson_id,
    type,
    category,
    regexp_replace(question_text, '\{\{[^}]*\}\}', '{{blank}}', 'g') AS question_text,
    regexp_replace(answer_text, '\{\{[^}]*\}\}', '{{blank}}', 'g') AS answer_text,
    audio_text,
    options,
    matching_pairs,
    audio_clip_id,
    reading_passage_id,
    explanation,
    order_index
  FROM quiz_questions;

GRANT SELECT ON quiz_questions_public TO authenticated;
```

- [ ] **Step 3: STOP — confirm with the user, then apply the migration**

This calls `apply_migration` against the real, shared Supabase project. Ask the user to confirm before running it. Once confirmed:

```
mcp__6c5f47ff-759a-40a7-ae05-33e169423511__apply_migration
  project_id: <resolved project_id>
  name: "fillblank_answer_text"
  query: <the SQL from Step 2>
```

- [ ] **Step 4: Verify the view via SQL**

Run through `mcp__6c5f47ff-759a-40a7-ae05-33e169423511__execute_sql` (with the same `project_id` resolved in Step 1):

```sql
-- 1. Column exists, nullable, no default:
select column_name, is_nullable, column_default
from information_schema.columns
where table_name = 'quiz_questions' and column_name = 'answer_text';
-- expect: answer_text | YES | (null)

-- 2. NULL passes through the view as NULL, not '':
select id, answer_text
from quiz_questions_public
where type = 'fill-blank'
limit 3;
-- expect: answer_text is NULL for existing rows (none have been set yet)

-- 3. Stripping applies to answer_text same as question_text:
insert into quiz_questions (id, lesson_id, type, category, question_text, answer_text, correct_answer, explanation, order_index)
values ('00000000-0000-0000-0000-000000000001', (select id from lessons limit 1), 'fill-blank', 'nguphap', 'Test prompt', 'Ich {{bin}} hier.', '', '', 999);

select question_text, answer_text from quiz_questions_public
where id = '00000000-0000-0000-0000-000000000001';
-- expect: question_text = 'Test prompt', answer_text = 'Ich {{blank}} hier.'
-- (never the literal 'bin')

delete from quiz_questions where id = '00000000-0000-0000-0000-000000000001';
```

- [ ] **Step 5: Regenerate `src/lib/database.types.ts`**

```
mcp__6c5f47ff-759a-40a7-ae05-33e169423511__generate_typescript_types
  project_id: <resolved project_id>
```

Write the returned TypeScript directly to `src/lib/database.types.ts` (overwrite the whole file — this mirrors what `npm run gen:types` does locally). Confirm the generated `quiz_questions` and `quiz_questions_public` types now include `answer_text: string | null`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260717000018_fillblank_answer_text.sql src/lib/database.types.ts
git commit -m "feat: add answer_text column to quiz_questions for fill-blank split"
```

---

## Task 2: App-side types + data fetching for `answer_text`

**Files:**
- Modify: `src/lib/appTypes.ts:32-44`
- Modify: `src/lib/hooks/useQuizQuestions.ts`

**Interfaces:**
- Consumes: `quiz_questions_public.answer_text` (from Task 1).
- Produces: `QuizQuestion.answerText?: string` — Task 5 and Task 6 read this exact field name off objects returned by `useQuizQuestions`.

- [ ] **Step 1: Add `answerText` to the `QuizQuestion` type**

In `src/lib/appTypes.ts`, current interface:

```ts
export interface QuizQuestion {
  id: string;
  type: "multiple-choice" | "fill-blank" | "matching" | "listening";
  category?: "nguphap" | "nghe" | "doc";
  questionText: string;
  audioText?: string;
  audioClipId?: string;
  readingPassageId?: string;
  options?: string[];
  matchingPairs?: { de: string; vi: string }[];
  explanation: string;
  correctAnswer?: string;
}
```

Change to:

```ts
export interface QuizQuestion {
  id: string;
  type: "multiple-choice" | "fill-blank" | "matching" | "listening";
  category?: "nguphap" | "nghe" | "doc";
  questionText: string;
  answerText?: string;
  audioText?: string;
  audioClipId?: string;
  readingPassageId?: string;
  options?: string[];
  matchingPairs?: { de: string; vi: string }[];
  explanation: string;
  correctAnswer?: string;
}
```

- [ ] **Step 2: Fetch and map `answer_text` in the hook**

In `src/lib/hooks/useQuizQuestions.ts`, the `.select(...)` call currently reads:

```ts
      .select("id, type, category, question_text, audio_text, audio_clip_id, reading_passage_id, options, matching_pairs, explanation, order_index")
```

Change to:

```ts
      .select("id, type, category, question_text, answer_text, audio_text, audio_clip_id, reading_passage_id, options, matching_pairs, explanation, order_index")
```

And the mapping inside `.then(...)` currently reads:

```ts
            (data ?? []).map((q) => ({
              id: q.id as string,
              type: q.type as QuizQuestion["type"],
              category: q.category as QuizQuestion["category"],
              questionText: q.question_text as string,
              audioText: (q.audio_text as string | null) ?? undefined,
```

Add the `answerText` line right after `questionText`:

```ts
            (data ?? []).map((q) => ({
              id: q.id as string,
              type: q.type as QuizQuestion["type"],
              category: q.category as QuizQuestion["category"],
              questionText: q.question_text as string,
              answerText: (q.answer_text as string | null) ?? undefined,
              audioText: (q.audio_text as string | null) ?? undefined,
```

- [ ] **Step 3: Type-check**

```bash
npm run lint
```

Expected: no NEW errors mentioning `appTypes.ts` or `useQuizQuestions.ts` (this repo already has a handful of pre-existing unrelated errors — e.g. `useUserStats.ts:76`, `AdminUsersSection.tsx:219` — confirm your diff didn't add to that list, don't try to fix the pre-existing ones).

- [ ] **Step 4: Commit**

```bash
git add src/lib/appTypes.ts src/lib/hooks/useQuizQuestions.ts
git commit -m "feat: fetch and expose answer_text on QuizQuestion"
```

---

## Task 3: Edge Function scoring fallback

**Files:**
- Modify: `supabase/functions/quiz-submit/scoring.ts`
- Modify: `supabase/functions/quiz-submit/index.ts`

**Interfaces:**
- Consumes: `quiz_questions.answer_text` (base table, from Task 1).
- Produces: `computeQuizScore(questions, answers)` keeps its exact existing signature and return shape (`{ correct, total, score }`) — only `ScorableQuestion` gains a field. No caller outside this Edge Function needs to change.

- [ ] **Step 1: Add `answer_text` to `ScorableQuestion` and apply the fallback**

In `supabase/functions/quiz-submit/scoring.ts`, current interface and score loop:

```ts
export interface ScorableQuestion {
  id: string;
  type: string;
  question_text: string;
  correct_answer: string;
}
```

```ts
  for (const q of questions) {
    const blanks = q.type === "fill-blank" ? extractBlanks(q.question_text) : null;
```

Change to:

```ts
export interface ScorableQuestion {
  id: string;
  type: string;
  question_text: string;
  answer_text: string | null;
  correct_answer: string;
}
```

```ts
  for (const q of questions) {
    // New-format fill-blank questions carry {{...}} in answer_text; old
    // (un-migrated) ones still have it in question_text. Prefer
    // answer_text, fall back to question_text — mirrors the same rule
    // applied in quiz_questions_public's SQL definition.
    const blankSource = q.answer_text?.trim() ? q.answer_text : q.question_text;
    const blanks = q.type === "fill-blank" ? extractBlanks(blankSource) : null;
```

Leave everything else in `computeQuizScore` (the `blanks && blanks.length > 0` branch, the legacy single-answer branch, matching normalization) exactly as-is — only the source text passed into `extractBlanks` changes.

- [ ] **Step 2: Select `answer_text` in the Edge Function's query**

In `supabase/functions/quiz-submit/index.ts`, current query:

```ts
    const { data: questions, error: qErr } = await supabase
      .from("quiz_questions")
      .select("id, type, question_text, correct_answer")
      .eq("lesson_id", lesson_id)
      .eq("category", category);
```

Change to:

```ts
    const { data: questions, error: qErr } = await supabase
      .from("quiz_questions")
      .select("id, type, question_text, answer_text, correct_answer")
      .eq("lesson_id", lesson_id)
      .eq("category", category);
```

- [ ] **Step 3: STOP — confirm with the user, then deploy**

This deploys to the real, shared Supabase project's Edge Functions. Ask the user to confirm before running it. Once confirmed:

```
mcp__6c5f47ff-759a-40a7-ae05-33e169423511__deploy_edge_function
  project_id: <resolved project_id>
  name: "quiz-submit"
  files: [ index.ts content, scoring.ts content ]
```

- [ ] **Step 4: Manually verify scoring for both old and new fill-blank formats**

Using the Supabase MCP `execute_sql` tool, find (or temporarily create, matching Task 1 Step 4's pattern) one existing fill-blank question with `{{...}}` still in `question_text` and `answer_text = NULL`, and one with `answer_text` populated and `question_text` as a plain prompt. Call the deployed `quiz-submit` function (via the app's own quiz flow, or `supabase.functions.invoke` from a scratch script) with a correct and an incorrect answer for each, and confirm:
- The old-format question scores correctly using `question_text`'s `{{...}}`.
- The new-format question scores correctly using `answer_text`'s `{{...}}`, ignoring any plain-text `question_text`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/quiz-submit/scoring.ts supabase/functions/quiz-submit/index.ts
git commit -m "feat: quiz-submit scoring falls back to answer_text for fill-blank"
```

---

## Task 4: Admin form — split Câu hỏi / Câu trả lời for fill-blank

**Files:**
- Modify: `src/pages/admin/AdminQuizSection.tsx`

**Interfaces:**
- Consumes: nothing new from other tasks (writes directly to the `quiz_questions` base table via Supabase client, same as today).
- Produces: rows where `answer_text` is populated for newly-created/edited fill-blank questions — Task 5/6 (`QuizPage.tsx`) is what actually reads and renders `answerText` for learners, but this task is independently testable by inspecting the saved row (e.g. via `execute_sql`) without needing Task 5/6 done first.

- [ ] **Step 1: Add `answer_text` to the local `QuizQuestion`/`EditForm` shape and defaults**

Current (`src/pages/admin/AdminQuizSection.tsx:9-23`):

```ts
interface QuizQuestion {
  id: string;
  lesson_id: string;
  type: "multiple-choice" | "fill-blank" | "matching" | "listening";
  category: "nguphap" | "nghe" | "doc";
  question_text: string;
  audio_text: string | null;
  audio_clip_id: string | null;
  reading_passage_id: string | null;
  options: string[] | null;
  matching_pairs: { de: string; vi: string }[] | null;
  correct_answer: string;
  explanation: string;
  order_index: number;
}
```

Add `answer_text` right after `question_text`:

```ts
interface QuizQuestion {
  id: string;
  lesson_id: string;
  type: "multiple-choice" | "fill-blank" | "matching" | "listening";
  category: "nguphap" | "nghe" | "doc";
  question_text: string;
  answer_text: string | null;
  audio_text: string | null;
  audio_clip_id: string | null;
  reading_passage_id: string | null;
  options: string[] | null;
  matching_pairs: { de: string; vi: string }[] | null;
  correct_answer: string;
  explanation: string;
  order_index: number;
}
```

`EditForm` is `Omit<QuizQuestion, "id" | "lesson_id">` (line 48) so it picks up `answer_text` automatically — no change needed there.

Current `EMPTY_FORM` (line 50-62):

```ts
const EMPTY_FORM: EditForm = {
  type: "multiple-choice",
  category: "nguphap",
  question_text: "",
  audio_text: null,
  audio_clip_id: null,
  reading_passage_id: null,
  options: ["", "", "", ""],
  matching_pairs: [{ de: "", vi: "" }],
  correct_answer: "",
  explanation: "",
  order_index: 0,
};
```

Add `answer_text: null`:

```ts
const EMPTY_FORM: EditForm = {
  type: "multiple-choice",
  category: "nguphap",
  question_text: "",
  answer_text: null,
  audio_text: null,
  audio_clip_id: null,
  reading_passage_id: null,
  options: ["", "", "", ""],
  matching_pairs: [{ de: "", vi: "" }],
  correct_answer: "",
  explanation: "",
  order_index: 0,
};
```

- [ ] **Step 2: Switch `isMultiBlank` to check `answer_text`**

Current (line 266):

```ts
  const isMultiBlank = form.type === "fill-blank" && hasBlankMarkers(form.question_text);
```

Change to:

```ts
  const isMultiBlank = form.type === "fill-blank" && hasBlankMarkers(form.answer_text ?? "");
```

- [ ] **Step 3: Load `answer_text` when opening the edit modal**

Current `openEdit` (line 322-339):

```ts
  const openEdit = (q: QuizQuestion) => {
    setEditId(q.id);
    setEditLessonId(q.lesson_id);
    setForm({
      type: q.type,
      category: q.category,
      question_text: q.question_text,
      audio_text: q.audio_text,
      audio_clip_id: q.audio_clip_id,
      reading_passage_id: q.reading_passage_id,
      options: q.options ?? ["", "", "", ""],
      matching_pairs: q.matching_pairs ?? [{ de: "", vi: "" }],
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      order_index: q.order_index,
    });
    setModalOpen(true);
  };
```

Add `answer_text: q.answer_text,` after `question_text`:

```ts
  const openEdit = (q: QuizQuestion) => {
    setEditId(q.id);
    setEditLessonId(q.lesson_id);
    setForm({
      type: q.type,
      category: q.category,
      question_text: q.question_text,
      answer_text: q.answer_text,
      audio_text: q.audio_text,
      audio_clip_id: q.audio_clip_id,
      reading_passage_id: q.reading_passage_id,
      options: q.options ?? ["", "", "", ""],
      matching_pairs: q.matching_pairs ?? [{ de: "", vi: "" }],
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      order_index: q.order_index,
    });
    setModalOpen(true);
  };
```

- [ ] **Step 4: Update validation and save payload**

Current validation in `handleSave` (line 341-349):

```ts
  const handleSave = async () => {
    if (!form.question_text.trim()) {
      showToast("Câu hỏi không được để trống.", "warning");
      return;
    }
    if (!isMultiBlank && !form.correct_answer.trim()) {
      showToast("Đáp án đúng không được để trống.", "warning");
      return;
    }
```

Change to (question_text is no longer required for `fill-blank`; `answer_text` becomes required for `fill-blank` instead):

```ts
  const handleSave = async () => {
    if (form.type !== "fill-blank" && !form.question_text.trim()) {
      showToast("Câu hỏi không được để trống.", "warning");
      return;
    }
    if (form.type === "fill-blank" && !(form.answer_text ?? "").trim()) {
      showToast("Câu trả lời không được để trống.", "warning");
      return;
    }
    if (!isMultiBlank && !form.correct_answer.trim()) {
      showToast("Đáp án đúng không được để trống.", "warning");
      return;
    }
```

Current payload (line 353-365):

```ts
    const payload = {
      type: form.type,
      category: form.category,
      question_text: form.question_text,
      audio_text: form.audio_text || null,
      audio_clip_id: form.category === "nghe" ? form.audio_clip_id : null,
      reading_passage_id: form.category === "doc" ? form.reading_passage_id : null,
      options: (form.type === "multiple-choice" || form.type === "listening") ? form.options?.filter(Boolean) ?? null : null,
      matching_pairs: form.type === "matching" ? form.matching_pairs?.filter((p) => p.de || p.vi) ?? null : null,
      correct_answer: isMultiBlank ? "" : form.correct_answer,
      explanation: form.explanation,
      order_index: form.order_index,
    };
```

Add `answer_text`:

```ts
    const payload = {
      type: form.type,
      category: form.category,
      question_text: form.question_text,
      answer_text: form.type === "fill-blank" ? form.answer_text : null,
      audio_text: form.audio_text || null,
      audio_clip_id: form.category === "nghe" ? form.audio_clip_id : null,
      reading_passage_id: form.category === "doc" ? form.reading_passage_id : null,
      options: (form.type === "multiple-choice" || form.type === "listening") ? form.options?.filter(Boolean) ?? null : null,
      matching_pairs: form.type === "matching" ? form.matching_pairs?.filter((p) => p.de || p.vi) ?? null : null,
      correct_answer: isMultiBlank ? "" : form.correct_answer,
      explanation: form.explanation,
      order_index: form.order_index,
    };
```

- [ ] **Step 5: Split the "Câu hỏi" textarea into two blocks in the modal**

Current (line 714-729):

```tsx
            {/* Question text */}
            <div>
              <label className={labelCls}>Câu hỏi *</label>
              <textarea
                rows={form.type === "fill-blank" ? 4 : 2}
                value={form.question_text}
                onChange={(e) => setForm((prev) => ({ ...prev, question_text: e.target.value }))}
                className={inputCls + " resize-none"}
                placeholder="Nhập nội dung câu hỏi..."
              />
              {form.type === "fill-blank" && (
                <p className="text-[10px] text-slate-400 font-sans mt-1.5 leading-relaxed">
                  Đánh dấu chỗ trống bằng <code className="bg-slate-100 px-1 rounded">{"{{đáp_án}}"}</code>, nhiều biến thể đúng cách nhau bởi <code className="bg-slate-100 px-1 rounded">|</code> — ví dụ <code className="bg-slate-100 px-1 rounded">{"{{bin|Bin}}"}</code>. Có thể dùng nhiều chỗ trống trong 1 câu hoặc cả đoạn văn dài.
                </p>
              )}
            </div>
```

Replace with two blocks — the question textarea loses its fill-blank-specific hint and becomes optional for `fill-blank` (label drops the `*`), and a new answer textarea appears only for `fill-blank`:

```tsx
            {/* Question text */}
            <div>
              <label className={labelCls}>Câu hỏi{form.type === "fill-blank" ? "" : " *"}</label>
              <textarea
                rows={2}
                value={form.question_text}
                onChange={(e) => setForm((prev) => ({ ...prev, question_text: e.target.value }))}
                className={inputCls + " resize-none"}
                placeholder={
                  form.type === "fill-blank"
                    ? "Hướng dẫn/câu dẫn (tùy chọn) — ví dụ: 'Chia động từ trong ngoặc'..."
                    : "Nhập nội dung câu hỏi..."
                }
              />
            </div>

            {/* Answer text (fill-blank only) */}
            {form.type === "fill-blank" && (
              <div>
                <label className={labelCls}>Câu trả lời *</label>
                <textarea
                  rows={4}
                  value={form.answer_text ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, answer_text: e.target.value }))}
                  className={inputCls + " resize-none"}
                  placeholder="Nhập câu/đoạn chứa chỗ trống, ví dụ: Ich {{bin|Bin}} Student."
                />
                <p className="text-[10px] text-slate-400 font-sans mt-1.5 leading-relaxed">
                  Đánh dấu chỗ trống bằng <code className="bg-slate-100 px-1 rounded">{"{{đáp_án}}"}</code>, nhiều biến thể đúng cách nhau bởi <code className="bg-slate-100 px-1 rounded">|</code> — ví dụ <code className="bg-slate-100 px-1 rounded">{"{{bin|Bin}}"}</code>. Có thể dùng nhiều chỗ trống trong 1 câu hoặc cả đoạn văn dài.
                </p>
              </div>
            )}
```

- [ ] **Step 6: Type-check**

```bash
npm run lint
```

Expected: no new errors in `AdminQuizSection.tsx` beyond the pre-existing unrelated ones noted in Task 2 Step 3.

- [ ] **Step 7: Manual verification in the browser**

Start the dev server (`npm run dev`, or via the project's preview tooling) and in the admin quiz section:
1. Create a new `fill-blank` question with "Câu hỏi" = `Chia động từ đúng` and "Câu trả lời" = `Ich {{bin|Bin}} Student.` — save, then reopen it for editing and confirm both fields reload correctly.
2. Try saving a `fill-blank` question with "Câu trả lời" left empty — confirm the `"Câu trả lời không được để trống."` toast appears and the save is blocked.
3. Confirm a `multiple-choice` question still requires "Câu hỏi" (the `*` label and the original empty-question toast still apply to non-fill-blank types).

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/AdminQuizSection.tsx
git commit -m "feat: split fill-blank admin form into question and answer fields"
```

---

## Task 5: Learner UI — render fill-blank from `answerText` with fallback

**Files:**
- Modify: `src/pages/QuizPage.tsx:88-97` (segment computation)
- Modify: `src/pages/QuizPage.tsx:416-420` (heading visibility)

**Interfaces:**
- Consumes: `QuizQuestion.answerText` (from Task 2).
- Produces: `fillBlankSegments: string[]` and `fillBlankCount: number` keep their exact existing names and shapes — Task 6 does not depend on this task's internals, only reads `activeQuestion` fields directly, so ordering between Task 5 and Task 6 is for file-conflict-avoidance, not a hard dependency.

- [ ] **Step 1: Compute segments from `answerText` with `questionText` fallback**

Current (`src/pages/QuizPage.tsx:88-97`):

```ts
  // Multi-blank fill-blank questions have their question_text pre-stripped
  // to the literal token "{{blank}}" by the quiz_questions_public view
  // (never the real answer). Splitting on it yields the text segments to
  // interleave with inline inputs; segments.length - 1 is the blank count.
  // Legacy single-answer fill-blank questions contain no "{{blank}}" token
  // at all, so fillBlankSegments is a 1-element array and fillBlankCount is 0.
  const fillBlankSegments = activeQuestion?.type === "fill-blank"
    ? activeQuestion.questionText.split("{{blank}}")
    : [];
  const fillBlankCount = Math.max(fillBlankSegments.length - 1, 0);
```

Change to:

```ts
  // Multi-blank fill-blank questions have their {{...}} pre-stripped to the
  // literal token "{{blank}}" by the quiz_questions_public view (never the
  // real answer). New-format questions carry the blank sentence in
  // answerText; old (un-migrated) ones still have it in questionText —
  // prefer answerText, fall back to questionText, mirroring the same rule
  // used by quiz-submit's scoring and the SQL view itself. Splitting on
  // "{{blank}}" yields the text segments to interleave with inline inputs;
  // segments.length - 1 is the blank count. Questions with no "{{blank}}"
  // token at all (legacy single-answer fill-blank) yield a 1-element array
  // and fillBlankCount 0.
  const isSplitFillBlank = activeQuestion?.type === "fill-blank" && !!activeQuestion.answerText;
  const fillBlankSource = activeQuestion?.type === "fill-blank"
    ? (activeQuestion.answerText || activeQuestion.questionText)
    : "";
  const fillBlankSegments = activeQuestion?.type === "fill-blank"
    ? fillBlankSource.split("{{blank}}")
    : [];
  const fillBlankCount = Math.max(fillBlankSegments.length - 1, 0);
```

- [ ] **Step 2: Always show the heading for split (new-format) questions, keep hiding it for the legacy fallback**

Current (`src/pages/QuizPage.tsx:416-420`):

```tsx
          {!(activeQuestion.type === "fill-blank" && fillBlankCount > 0) && (
            <h2 className="text-base sm:text-lg font-display font-extrabold text-slate-900 leading-snug whitespace-pre-wrap">
              {activeQuestion.questionText}
            </h2>
          )}
```

Change to (only suppress the heading when we're in the legacy fallback path — i.e. multi-blank content came from `questionText` itself, so showing it again would duplicate the blank sentence rendered below):

```tsx
          {!(activeQuestion.type === "fill-blank" && !isSplitFillBlank && fillBlankCount > 0) && (
            <h2 className="text-base sm:text-lg font-display font-extrabold text-slate-900 leading-snug whitespace-pre-wrap">
              {activeQuestion.questionText}
            </h2>
          )}
```

- [ ] **Step 3: Type-check**

```bash
npm run lint
```

Expected: no new errors in `QuizPage.tsx` beyond the one pre-existing unrelated error already present at `QuizPage.tsx:41` (confirmed pre-existing via `git stash` earlier in this session — do not attempt to fix it as part of this task).

- [ ] **Step 4: Manual verification in the browser**

Using the fill-blank question created in Task 4 Step 7 (split format: "Câu hỏi" = `Chia động từ đúng`, "Câu trả lời" = `Ich {{bin|Bin}} Student.`):
1. Open that lesson's quiz as a learner and navigate to the question. Confirm the heading `Chia động từ đúng` is visible above the sentence, and the sentence `Ich [input] Student.` renders below with one inline input.
2. Find (or note for later) an existing **old-format** multi-blank fill-blank question (created before this feature, `{{...}}` still in `question_text`, `answer_text` NULL) and confirm it still renders exactly as before — no separate heading, blank sentence rendered directly with inline inputs.

- [ ] **Step 5: Commit**

```bash
git add src/pages/QuizPage.tsx
git commit -m "feat: render fill-blank from answerText with questionText fallback"
```

---

## Task 6: Learner UI — post-answer explanation block (all question types)

**Files:**
- Modify: `src/pages/QuizPage.tsx`

**Interfaces:**
- Consumes: `QuizQuestion.explanation` (already fetched today, no new dependency), and the existing per-type answer state (`selectedOption`, `fillBlankValue`, `fillBlankValues`, `matchedPairs`) already declared in this component.
- Produces: nothing consumed by other tasks — this is the last task before end-to-end verification.

- [ ] **Step 1: Add a `hasAnsweredCurrent()` check**

This is deliberately a **new, separate** check from the existing `canProceed`/`getCurrentAnswerString()` logic used for the Next/Submit button — that logic has a pre-existing quirk where multi-blank fill-blank with 2+ blanks can read as "answered" even with some blanks still empty (joining `["", ""]` with `"|"` yields `"|"`, not `""`). The explanation block needs a stricter "every required input is actually filled" check, so it does not touch or fix that pre-existing button-enablement logic.

Add this function right after `getCurrentAnswerString` (`src/pages/QuizPage.tsx`, immediately after its closing brace around line 172):

```ts
  const hasAnsweredCurrent = (): boolean => {
    if (!activeQuestion) return false;
    if (activeQuestion.type === "multiple-choice" || activeQuestion.type === "listening") {
      return selectedOption !== "";
    }
    if (activeQuestion.type === "fill-blank") {
      if (fillBlankCount > 0) {
        return fillBlankValues.length === fillBlankCount && fillBlankValues.every((v) => v.trim() !== "");
      }
      return fillBlankValue.trim() !== "";
    }
    if (activeQuestion.type === "matching") {
      const totalPairs = activeQuestion.matchingPairs?.length ?? 0;
      return totalPairs > 0 && Object.keys(matchedPairs).length >= totalPairs;
    }
    return false;
  };
```

- [ ] **Step 2: Render the explanation block inside the question card**

The question card is the `<div id={`quiz-question-box-${activeQuestion.id}`} ...>` block starting at `src/pages/QuizPage.tsx:405`. It currently closes right after the MATCHING section, at line 614-615:

```tsx
            <div className="pt-3 flex justify-end text-xs font-display font-bold text-slate-400">
              Đã khớp: {Object.keys(matchedPairs).length} / {activeQuestion.matchingPairs?.length}
            </div>
          </div>
        )}
      </div>
```

Insert the new block right before that final `</div>` (the one closing the question card, i.e. right after the MATCHING `{...}` block's closing `)}` and before the card's own closing `</div>`):

```tsx
            <div className="pt-3 flex justify-end text-xs font-display font-bold text-slate-400">
              Đã khớp: {Object.keys(matchedPairs).length} / {activeQuestion.matchingPairs?.length}
            </div>
          </div>
        )}

        {/* Post-answer explanation — shown once the learner has fully answered the current question, any type */}
        {hasAnsweredCurrent() && activeQuestion.explanation && (
          <div className="p-4 bg-blue-50/60 border border-blue-100 rounded-2xl space-y-1.5">
            <span className="text-[10px] font-display font-bold text-blue-600 uppercase tracking-wider">
              💡 Giải thích
            </span>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {activeQuestion.explanation}
            </p>
          </div>
        )}
      </div>
```

- [ ] **Step 3: Type-check**

```bash
npm run lint
```

Expected: no new errors beyond the pre-existing `QuizPage.tsx:41` one.

- [ ] **Step 4: Manual verification in the browser, one per question type**

For each of `multiple-choice`, `fill-blank` (either format), `matching`, and `listening`, using questions whose `explanation` field is non-empty (check via the admin quiz list, or set one temporarily):
1. Navigate to the question — confirm the explanation block is **not** visible yet.
2. Answer it fully (select an option / fill all blanks / match all pairs) — confirm the "💡 Giải thích" block appears with the right text.
3. Navigate to the next question — confirm the block disappears (resets) until that next question is itself answered.
4. For a question whose `explanation` is empty string — confirm no block ever appears, even after answering.

- [ ] **Step 5: Commit**

```bash
git add src/pages/QuizPage.tsx
git commit -m "feat: show per-question explanation block after answering"
```

---

## Task 7: End-to-end verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: nothing — this is the final check before considering the feature done.

- [ ] **Step 1: Full type-check**

```bash
npm run lint
```

Expected: exactly the same set of pre-existing errors as before this feature started (`MarkdownBlock.tsx`, `useUserStats.ts:76`, `main.tsx`, `AdminContentSection.tsx`, `AdminUsersSection.tsx:219`, `QuizPage.tsx:41`) and nothing new.

- [ ] **Step 2: Full manual walkthrough**

1. Admin: create one brand-new `fill-blank` question with split Câu hỏi/Câu trả lời fields (per Task 4 Step 7), and confirm an **existing** old-format fill-blank question still opens/edits/saves correctly (its `answer_text` stays NULL unless the admin explicitly fills it in — saving without touching "Câu trả lời" should not silently null out a working question... actually note: opening an OLD-format question means `q.answer_text` is NULL, so the form's "Câu trả lời" field starts empty; if the admin saves without filling it, Step 4 of Task 4 blocks the save with "Câu trả lời không được để trống." — confirm this happens, and confirm the admin can still save that same old question unchanged by leaving the modal via Hủy instead, without triggering any change).
2. Learner: take the quiz containing both fill-blank questions from Task 5 Step 4 and confirm both render and score correctly, and confirm the explanation block (Task 6) appears correctly across all four question types in that lesson's quiz.
3. Submit the quiz and confirm the final results screen's "Giải thích từng câu hỏi" section is unaffected (still lists every question's explanation as before).

- [ ] **Step 3: Report results to the user**

Summarize what was verified and flag anything unexpected (in particular: any old-format fill-blank question found during Step 2 whose admin edit flow is now blocked by the new "Câu trả lời" requirement — this is expected per the fallback design, but the user should be aware editing old questions now requires filling in the new field).
