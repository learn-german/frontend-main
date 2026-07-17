# Multi-Blank Fill-in-the-Blank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins author `fill-blank` quiz questions with any number of blanks (including whole paragraphs), by writing `{{đáp_án}}` / `{{đáp_án_1|đáp_án_2}}` markers directly inside the existing `question_text` field — no new DB columns, no new admin fields.

**Architecture:** `question_text` is the single source of truth for both display and scoring. The public-facing Supabase view strips `{{...}}` markers to a literal `{{blank}}` token (unconditionally, regardless of `type`, for defense-in-depth). The learner UI splits on that token to render inline inputs. The `quiz-submit` Edge Function re-parses the *raw* `question_text` (read from the base table, never exposed to clients) to extract the ordered list of accepted answers per blank, and scores each blank as its own partial-credit unit. Existing single-answer `fill-blank` questions (no `{{...}}` in their text) keep working exactly as before — the presence of `{{...}}` is the sole signal that switches a question into multi-blank mode.

**Tech Stack:** React 19, TypeScript, Supabase (Postgres + RLS + Edge Functions/Deno), Vite.

## Global Constraints

- Cú pháp đánh dấu chỗ trống: `{{đáp_án}}` hoặc `{{đáp_án_1|đáp_án_2}}` (nhiều biến thể cách nhau bởi `|`) trực tiếp trong `question_text`. Không thêm cột DB mới, không thêm field admin mới.
- Việc ẩn `{{...}}` → `{{blank}}` trong view `quiz_questions_public` áp dụng **vô điều kiện cho MỌI row, không phụ thuộc cột `type`** — không viết `CASE WHEN type = 'fill-blank'`.
- Câu hỏi `fill-blank` cũ (không chứa `{{...}}`) giữ nguyên hành vi hiện tại 100% — 1 input, so với `correct_answer` cột cũ.
- Chấm điểm: mỗi `{{...}}` = 1 đơn vị điểm riêng (partial credit), so khớp theo vị trí, case-insensitive, đúng 1 trong các biến thể `|`. Câu hỏi khác (kể cả `fill-blank` cũ 1-ô) vẫn = 1 đơn vị như hiện tại.
- Thanh tiến trình "Câu X/Y" khi làm bài không đổi — vẫn đếm theo số câu hỏi, không đếm theo số ô trống.
- Đáp án thật không bao giờ được gửi tới client qua bất kỳ response nào — chỉ dữ liệu đã ẩn (`{{blank}}`) mới rời khỏi server.
- Không đổi cơ chế chấm điểm/ngưỡng 80% cho các loại câu hỏi khác (multiple-choice, matching, listening).
- **Wire contract cho nhiều ô trống:** khi 1 câu hỏi có ≥1 blank, học viên gửi đáp án dưới dạng 1 chuỗi ghép bằng dấu `|` theo đúng thứ tự các ô (ví dụ `"bin|aus"` cho 2 ô) — dùng chung `answers: Record<string, string>` hiện có trong body `quiz-submit`, không đổi shape API.
- Node version: `source ~/.nvm/nvm.sh && nvm use 20` trước mọi `npm run dev`/`lint`/`tsx`.

---

### Task 1: DB — strip `{{...}}` unconditionally in `quiz_questions_public`

**Files:**
- Create: `supabase/migrations/20260717000016_multiblank_fillblank_view.sql`

**Interfaces:**
- Produces: `quiz_questions_public.question_text` now returns `{{blank}}` (literal 12-char token) in place of every `{{...}}` occurrence, for **every row regardless of `type`**. Task 4 (learner UI) splits on the literal string `"{{blank}}"`.
- Consumes: nothing new — this only redefines the existing view from `supabase/migrations/20260716000015_reading_passages.sql:37-51`.

- [ ] **Step 1: Write the migration**

```sql
-- Strip {{...}} answer markers from question_text in the public view,
-- unconditionally for ALL rows regardless of `type` — this is a
-- deliberate security choice: if an admin changes a question's `type`
-- away from 'fill-blank' while {{...}} markers are still present in
-- question_text, the raw answer must still never leak through this view.
DROP VIEW IF EXISTS quiz_questions_public;

CREATE VIEW quiz_questions_public AS
  SELECT
    id,
    lesson_id,
    type,
    category,
    regexp_replace(question_text, '\{\{[^}]*\}\}', '{{blank}}', 'g') AS question_text,
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

- [ ] **Step 2: Apply the migration to the live Supabase project**

Use the Supabase MCP `apply_migration` tool (project id `awdhqlgxnjwymwgxltlw`) with the exact SQL above, name `multiblank_fillblank_view`.

- [ ] **Step 3: Verify via `execute_sql` — multi-blank stripping works**

```sql
INSERT INTO quiz_questions (lesson_id, type, category, question_text, correct_answer, explanation, order_index)
VALUES ('a1-l1', 'fill-blank', 'nguphap', 'Ich {{bin|Bin}} Student. Ich komme {{aus}} Vietnam.', '', 'test', 9999)
RETURNING id;
```

Then, using the returned `id`:

```sql
SELECT question_text FROM quiz_questions_public WHERE id = '<returned-id>';
```

Expected: `Ich {{blank}} Student. Ich komme {{blank}} Vietnam.` — no trace of `bin`, `Bin`, or `aus`.

- [ ] **Step 4: Verify the unconditional (type-independent) stripping**

```sql
UPDATE quiz_questions SET type = 'multiple-choice' WHERE id = '<returned-id>';
SELECT question_text FROM quiz_questions_public WHERE id = '<returned-id>';
```

Expected: still `Ich {{blank}} Student. Ich komme {{blank}} Vietnam.` — confirms the strip does NOT depend on `type`.

- [ ] **Step 5: Clean up the test row**

```sql
DELETE FROM quiz_questions WHERE id = '<returned-id>';
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260717000016_multiblank_fillblank_view.sql
git commit -m "feat: strip {{}} answer markers from quiz_questions_public unconditionally"
```

---

### Task 2: Edge Function — multi-blank partial-credit scoring

**Files:**
- Create: `supabase/functions/quiz-submit/scoring.ts`
- Modify: `supabase/functions/quiz-submit/index.ts`

**Interfaces:**
- Produces: `computeQuizScore(questions: ScorableQuestion[], answers: Record<string, string>): { correct: number; total: number; score: number }`, exported from `scoring.ts`. Multi-blank fill-blank questions contribute one unit per blank to both `correct` and `total`; every other question (including legacy single-answer fill-blank) contributes exactly one unit — same behavior as today.
- Consumes: raw (un-stripped) `question_text` read from the `quiz_questions` base table (Task 1's view is irrelevant here — this function already bypasses the view via service_role, per `supabase/functions/quiz-submit/index.ts:63-69`).
- Wire contract: learner answers for a multi-blank question arrive as `answers[q.id] = "variant1|variant2"`, positional, matching the Global Constraints section.

- [ ] **Step 1: Write `scoring.ts` (pure logic, no Deno-specific imports — must run under both Deno and plain Node/tsx)**

```ts
export interface ScorableQuestion {
  id: string;
  type: string;
  question_text: string;
  correct_answer: string;
}

export interface ScoreResult {
  correct: number;
  total: number;
  score: number;
}

const BLANK_PATTERN = /\{\{([^}]*)\}\}/g;

/**
 * Extracts ordered blank-answer variant lists from raw question_text, e.g.
 * "Ich {{bin|Bin}} Student." -> [["bin", "Bin"]]. Returns null when the
 * text has no {{...}} markers — signals "legacy single-answer question,
 * use correct_answer instead."
 */
export function extractBlanks(questionText: string): string[][] | null {
  const matches = [...questionText.matchAll(BLANK_PATTERN)];
  if (matches.length === 0) return null;
  return matches.map((m) => m[1].split("|").map((v) => v.trim()));
}

function normalizeMatching(s: string): string {
  return s
    .split("|")
    .map((p) => p.trim())
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

/**
 * Multi-blank fill-blank questions (question_text contains {{...}})
 * contribute one scoring unit PER BLANK, matched positionally against the
 * learner's answer split by "|". Every other question type — including
 * legacy single-answer fill-blank — contributes exactly one unit, matched
 * as before.
 */
export function computeQuizScore(
  questions: ScorableQuestion[],
  answers: Record<string, string>,
): ScoreResult {
  let correct = 0;
  let total = 0;

  for (const q of questions) {
    const blanks = q.type === "fill-blank" ? extractBlanks(q.question_text) : null;

    if (blanks && blanks.length > 0) {
      const userParts = (answers[q.id] ?? "").split("|").map((s) => s.trim().toLowerCase());
      total += blanks.length;
      blanks.forEach((variants, i) => {
        const userPart = userParts[i] ?? "";
        if (variants.some((v) => v.toLowerCase() === userPart)) correct++;
      });
      continue;
    }

    const userAnswer = (answers[q.id] ?? "").trim();
    const correctAnswer = (q.correct_answer ?? "").trim();
    total += 1;

    if (q.type === "matching") {
      if (normalizeMatching(userAnswer) === normalizeMatching(correctAnswer)) correct++;
    } else {
      if (userAnswer.toLowerCase() === correctAnswer.toLowerCase()) correct++;
    }
  }

  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { correct, total, score };
}
```

- [ ] **Step 2: Write a throwaway verification script (NOT committed) and run it with `tsx`**

Create `/tmp/verify-scoring.ts` (or your scratchpad dir):

```ts
import { computeQuizScore } from "/absolute/path/to/repo/supabase/functions/quiz-submit/scoring";

const questions = [
  { id: "q1", type: "fill-blank", question_text: "Ich {{bin|Bin}} Student. Ich komme {{aus}} Vietnam.", correct_answer: "" },
  { id: "q2", type: "fill-blank", question_text: "Guten Tag", correct_answer: "Guten Tag" }, // legacy 1-answer
  { id: "q3", type: "multiple-choice", question_text: "Pick A", correct_answer: "A" },
];

// q1: blank 1 wrong ("falsch"), blank 2 correct ("aus") -> 1/2
// q2: legacy exact match -> correct
// q3: wrong choice -> incorrect
const result = computeQuizScore(questions, { q1: "falsch|aus", q2: "Guten Tag", q3: "B" });

const expected = { correct: 2, total: 4, score: 50 };
if (JSON.stringify(result) !== JSON.stringify(expected)) {
  throw new Error(`MISMATCH: got ${JSON.stringify(result)}, expected ${JSON.stringify(expected)}`);
}
console.log("PASS:", result);
```

Run: `npx tsx /tmp/verify-scoring.ts` (use the actual absolute repo path in the import).
Expected output: `PASS: { correct: 2, total: 4, score: 50 }`

Delete `/tmp/verify-scoring.ts` after it passes — it must never be committed.

- [ ] **Step 3: Update `index.ts` to use `computeQuizScore`**

In `supabase/functions/quiz-submit/index.ts`, add the import at the top:

```ts
import { computeQuizScore } from "./scoring.ts";
```

Change the questions select (currently `"id, type, correct_answer"`) to also fetch `question_text`:

```ts
    const { data: questions, error: qErr } = await supabase
      .from("quiz_questions")
      .select("id, type, question_text, correct_answer")
      .eq("lesson_id", lesson_id)
      .eq("category", category);
```

Replace the entire block from the `// Sort matching answer strings...` comment through `const passed = score >= PASS_THRESHOLD;` (i.e. remove the local `normalizeMatching` function, the `correct`/scoring `for` loop, and the `total`/`score` calculation) with:

```ts
    const { correct, total, score } = computeQuizScore(questions, answers);
    const passed = score >= PASS_THRESHOLD;
```

- [ ] **Step 4: Deploy the updated Edge Function**

Use the Supabase MCP `deploy_edge_function` tool for `quiz-submit`, project id `awdhqlgxnjwymwgxltlw`, using the updated `index.ts` and the new `scoring.ts` as an additional file in the function bundle.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/quiz-submit/scoring.ts supabase/functions/quiz-submit/index.ts
git commit -m "feat: score multi-blank fill-blank questions with per-blank partial credit"
```

---

### Task 3: Admin UI — author multi-blank questions via `{{...}}` syntax

**Files:**
- Modify: `src/pages/admin/AdminQuizSection.tsx`

**Interfaces:**
- Consumes: nothing from Tasks 1-2 directly (this task only changes how `question_text`/`correct_answer` are authored and saved).
- Produces: admin can save a `fill-blank` question with `correct_answer: ""` whenever `question_text` contains `{{...}}` — Task 2's `extractBlanks` treats any non-empty `{{...}}`-derived array as authoritative and ignores `correct_answer` in that case, so an empty string is safe and expected for these rows.

- [ ] **Step 1: Add the `hasBlankMarkers` helper (top-level, near `TYPE_COLORS`)**

In `src/pages/admin/AdminQuizSection.tsx`, immediately after the `TYPE_COLORS` constant (currently ending around line 82, right before `const QuestionTable`), add:

```ts
const hasBlankMarkers = (text: string): boolean => /\{\{[^}]*\}\}/.test(text);
```

- [ ] **Step 2: Derive `isMultiBlank` in the component body**

In the `AdminQuizSection` component, immediately after the state declarations block (right after `const [deletingPassage, setDeletingPassage] = useState(false);`, before `const fetchQuestions = async () => {`), add:

```ts
  const isMultiBlank = form.type === "fill-blank" && hasBlankMarkers(form.question_text);
```

- [ ] **Step 3: Update `handleSave` validation and payload**

Find:

```ts
  const handleSave = async () => {
    if (!form.question_text.trim()) {
      showToast("Câu hỏi không được để trống.", "warning");
      return;
    }
    if (!form.correct_answer.trim()) {
      showToast("Đáp án đúng không được để trống.", "warning");
      return;
    }
```

Replace with:

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

Find (inside the same function, the `payload` object):

```ts
      correct_answer: form.correct_answer,
```

Replace with:

```ts
      correct_answer: isMultiBlank ? "" : form.correct_answer,
```

- [ ] **Step 4: Add syntax helper text under the question_text textarea**

Find:

```tsx
            {/* Question text */}
            <div>
              <label className={labelCls}>Câu hỏi *</label>
              <textarea
                rows={2}
                value={form.question_text}
                onChange={(e) => setForm((prev) => ({ ...prev, question_text: e.target.value }))}
                className={inputCls + " resize-none"}
                placeholder="Nhập nội dung câu hỏi..."
              />
            </div>
```

Replace with:

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

- [ ] **Step 5: Hide the "Đáp án đúng" field when multi-blank syntax is present**

Find this exact block (currently around lines 808-831):

```tsx
            {/* Correct answer */}
            <div>
              <label className={labelCls}>Đáp án đúng *</label>
              {(form.type === "multiple-choice" || form.type === "listening") && (form.options ?? []).some(Boolean) ? (
                <select
                  value={form.correct_answer}
                  onChange={(e) => setForm((prev) => ({ ...prev, correct_answer: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">-- Chọn đáp án đúng --</option>
                  {(form.options ?? []).filter(Boolean).map((opt, i) => (
                    <option key={i} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.correct_answer}
                  onChange={(e) => setForm((prev) => ({ ...prev, correct_answer: e.target.value }))}
                  className={inputCls}
                  placeholder={form.type === "matching" ? 'JSON: [{"de":"...", "vi":"..."}]' : "Đáp án đúng..."}
                />
              )}
            </div>
```

Replace with:

```tsx
            {/* Correct answer */}
            {isMultiBlank ? (
              <div>
                <label className={labelCls}>Đáp án đúng</label>
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                  Đáp án đã được đánh dấu trực tiếp trong nội dung câu hỏi bằng <code className="bg-white px-1 rounded border border-slate-200">{"{{...}}"}</code> — không cần nhập riêng.
                </p>
              </div>
            ) : (
              <div>
                <label className={labelCls}>Đáp án đúng *</label>
                {(form.type === "multiple-choice" || form.type === "listening") && (form.options ?? []).some(Boolean) ? (
                  <select
                    value={form.correct_answer}
                    onChange={(e) => setForm((prev) => ({ ...prev, correct_answer: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">-- Chọn đáp án đúng --</option>
                    {(form.options ?? []).filter(Boolean).map((opt, i) => (
                      <option key={i} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={form.correct_answer}
                    onChange={(e) => setForm((prev) => ({ ...prev, correct_answer: e.target.value }))}
                    className={inputCls}
                    placeholder={form.type === "matching" ? 'JSON: [{"de":"...", "vi":"..."}]' : "Đáp án đúng..."}
                  />
                )}
              </div>
            )}
```

If the file's exact whitespace/indentation differs slightly from what's shown here (this file has been rewritten several times), match by content and JSX structure rather than exact byte-for-byte whitespace.

- [ ] **Step 6: Real browser verification — MANDATORY, non-negotiable**

CRITICAL WARNING: earlier tasks in this project's history had implementers submit reports claiming "browser verification" that were actually just static code re-reading, with no real Browser pane tool call. This was rejected every time. Do not repeat it — your report must contain literal pasted tool output from actual `mcp__Claude_Browser__*` tool calls.

This project has no admin login available in this sandbox (the `AdminApp.tsx` login gate blocks admin pages from mounting pre-auth — confirmed correct/expected in prior work, never worked around). Use this project's established pattern instead: build a throwaway `dbgtest.html` + `dbgtest.tsx` harness at the repo root that renders `AdminQuizSection` directly, with the `../../lib/supabase` import **module-mocked** (e.g. via a local shim file re-exporting a fake `supabase` object whose `.from("quiz_questions").select(...)`, `.from("lessons").select(...)`, `.from("listening_clips").select(...)`, `.from("reading_passages").select(...)` chains resolve to small fixed mock arrays — one lesson, one existing `fill-blank` question) so the component's `fetchQuestions()` on mount does not need a real authenticated Supabase session.

Verify in the browser, via `read_page`/`get_page_text`/`computer`:
1. Open the edit modal for a `fill-blank` question, type `Ich {{bin|Bin}} Student.` into the question text field — confirm the "Đáp án đúng" field disappears and the helper note appears.
2. Clear the text back to plain text with no `{{...}}` — confirm the "Đáp án đúng" field reappears.
3. Confirm the syntax helper text renders under the textarea only when `type = fill-blank`.

Delete `dbgtest.html`/`dbgtest.tsx` and any mock shim file before committing — they must never be committed.

- [ ] **Step 7: `npm run lint`**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no new errors introduced by this task (unrelated pre-existing errors, if any, are out of scope).

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/AdminQuizSection.tsx
git commit -m "feat: let admins author multi-blank fill-blank questions via {{}} syntax"
```

---

### Task 4: Learner UI — inline multi-blank rendering and answer collection

**Files:**
- Modify: `src/pages/QuizPage.tsx`

**Interfaces:**
- Consumes: Task 1's `{{blank}}` literal token in `activeQuestion.questionText` (from `quiz_questions_public`). Task 2's wire contract — submits `"variant1|variant2"` (pipe-joined, positional) in `answers[id]` when a question has ≥1 blank.
- Produces: nothing consumed by other tasks — this is the last code task.

- [ ] **Step 1: Add multi-blank state and derived values**

Find:

```ts
  const [fillBlankValue, setFillBlankValue] = useState("");
```

Replace with:

```ts
  const [fillBlankValue, setFillBlankValue] = useState("");
  const [fillBlankValues, setFillBlankValues] = useState<string[]>([]);
```

Find:

```ts
  const activeQuestion = questions[currentIdx];
  const isLastQuestion = currentIdx === questions.length - 1;
```

Replace with:

```ts
  const activeQuestion = questions[currentIdx];
  const isLastQuestion = currentIdx === questions.length - 1;
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

- [ ] **Step 2: Reset `fillBlankValues` when the active question changes**

Find (inside the `useEffect` that runs on `[currentIdx, questions]`):

```ts
    setSelectedOption("");
    setFillBlankValue("");
```

Replace with:

```ts
    setSelectedOption("");
    setFillBlankValue("");
    setFillBlankValues(Array(fillBlankCount).fill(""));
```

- [ ] **Step 3: Update answer collection to use the wire contract from Task 2**

Find:

```ts
    if (activeQuestion.type === "fill-blank") {
      return fillBlankValue.trim();
    }
```

Replace with:

```ts
    if (activeQuestion.type === "fill-blank") {
      if (fillBlankCount > 0) {
        return fillBlankValues.map((v) => v.trim()).join("|");
      }
      return fillBlankValue.trim();
    }
```

- [ ] **Step 4: Reset `fillBlankValues` on retry**

Find:

```ts
  const handleRetry = () => {
    setCurrentIdx(0);
    setAnswers({});
    setSelectedOption("");
    setFillBlankValue("");
    setMatchedPairs({});
```

Replace with:

```ts
  const handleRetry = () => {
    setCurrentIdx(0);
    setAnswers({});
    setSelectedOption("");
    setFillBlankValue("");
    setFillBlankValues([]);
    setMatchedPairs({});
```

- [ ] **Step 5: Skip the redundant question-text heading for multi-blank questions**

The sentence/paragraph itself becomes the interactive element in Step 6 below, so showing it again verbatim as the `<h2>` heading above would duplicate it. Find:

```tsx
          <h2 className="text-base sm:text-lg font-display font-extrabold text-slate-900 leading-snug">
            {activeQuestion.questionText}
          </h2>
```

Replace with:

```tsx
          {!(activeQuestion.type === "fill-blank" && fillBlankCount > 0) && (
            <h2 className="text-base sm:text-lg font-display font-extrabold text-slate-900 leading-snug">
              {activeQuestion.questionText}
            </h2>
          )}
```

- [ ] **Step 6: Render inline inputs for multi-blank questions; keep the legacy single-input UI for everything else**

Find:

```tsx
        {/* FILL IN THE BLANK */}
        {activeQuestion.type === "fill-blank" && (
          <div className="space-y-3 max-w-sm">
            <input
              id="quiz-fill-input"
              type="text"
              placeholder="Nhập câu trả lời bằng chữ thường..."
              value={fillBlankValue}
              onChange={(e) => setFillBlankValue(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-slate-250 rounded-xl font-sans text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition duration-150"
            />
            <p className="text-[10px] text-slate-400 font-sans tracking-wide">
              *Chú ý viết chính xác từng chữ cái bao gồm cả các ký tự Umlaut (ä, ö, ü, ß) nếu có.
            </p>
          </div>
        )}
```

Replace with:

```tsx
        {/* FILL IN THE BLANK — multi-blank inline (question_text has 1+ {{blank}} tokens) */}
        {activeQuestion.type === "fill-blank" && fillBlankCount > 0 && (
          <div className="space-y-3">
            <p className="text-sm sm:text-base text-slate-800 leading-loose font-sans">
              {fillBlankSegments.map((segment, i) => (
                <React.Fragment key={i}>
                  {segment}
                  {i < fillBlankCount && (
                    <input
                      type="text"
                      value={fillBlankValues[i] ?? ""}
                      onChange={(e) => {
                        const next = [...fillBlankValues];
                        next[i] = e.target.value;
                        setFillBlankValues(next);
                      }}
                      className="inline-block w-28 mx-1 px-2 py-1 bg-white border border-slate-250 rounded-lg font-sans text-sm text-slate-900 text-center focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition duration-150"
                    />
                  )}
                </React.Fragment>
              ))}
            </p>
            <p className="text-[10px] text-slate-400 font-sans tracking-wide">
              *Chú ý viết chính xác từng chữ cái bao gồm cả các ký tự Umlaut (ä, ö, ü, ß) nếu có.
            </p>
          </div>
        )}

        {/* FILL IN THE BLANK — legacy single-answer (no {{blank}} tokens) */}
        {activeQuestion.type === "fill-blank" && fillBlankCount === 0 && (
          <div className="space-y-3 max-w-sm">
            <input
              id="quiz-fill-input"
              type="text"
              placeholder="Nhập câu trả lời bằng chữ thường..."
              value={fillBlankValue}
              onChange={(e) => setFillBlankValue(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-slate-250 rounded-xl font-sans text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition duration-150"
            />
            <p className="text-[10px] text-slate-400 font-sans tracking-wide">
              *Chú ý viết chính xác từng chữ cái bao gồm cả các ký tự Umlaut (ä, ö, ü, ß) nếu có.
            </p>
          </div>
        )}
```

- [ ] **Step 7: Real browser verification — MANDATORY, non-negotiable**

CRITICAL WARNING: earlier tasks in this project's history had implementers submit reports claiming "browser verification" that were actually just static code re-reading, with no real Browser pane tool call. This was rejected every time and required full re-dispatch. Do not repeat it — your report must contain literal pasted tool output.

`QuizPage` needs `lesson`/`category` props and fetches questions via `useQuizQuestions` (which queries `quiz_questions_public` — requires a real learner session in this sandbox, which does not exist). Follow this project's established pattern: build a throwaway `dbgtest.html`/`dbgtest.tsx` harness that renders `QuizPage` with a **module-mocked** `../lib/hooks/useQuizQuestions` (return a fixed list of mock questions directly, bypassing Supabase) and a mocked `../lib/supabase` (so `supabase.functions.invoke("quiz-submit", ...)` resolves to a fixed fake result instead of hitting the network). Mock questions must include:
- 1 multi-blank `fill-blank` question: `questionText: "Ich {{blank}} Student. Ich komme {{blank}} Vietnam."`
- 1 legacy single-answer `fill-blank` question: `questionText: "Guten Tag"`, no `{{blank}}` token.

Use `read_page`/`get_page_text`/`computer` to:
1. Navigate to the multi-blank question — confirm exactly 2 inline `<input>` elements render inside the sentence at the right positions (between "Ich" and "Student.", and between "komme" and "Vietnam."), and confirm the `<h2>` heading is NOT also showing the same sentence above.
2. Type into both inputs, confirm each retains its own value independently (no cross-talk between the two inputs' state).
3. Navigate to the legacy single-answer question — confirm the original single-input UI still renders exactly as before (1 input, `<h2>` heading shows the question text normally).

Delete `dbgtest.html`/`dbgtest.tsx` and any mock shim files before committing — they must never be committed.

- [ ] **Step 8: `npm run lint`**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no new errors introduced by this task.

- [ ] **Step 9: Commit**

```bash
git add src/pages/QuizPage.tsx
git commit -m "feat: render inline multi-blank fill-blank inputs and submit per-blank answers"
```

---

## Final Notes

After all 4 tasks pass individual review, run a final whole-feature review (mirroring the pattern used for the multi-passage-reading and multi-audio-listening plans) covering the full stack: DB view → Edge Function scoring → admin authoring → learner rendering. Specifically re-verify, end to end against the live Supabase project:
- A real multi-blank question created via Task 3's admin flow is correctly scored via Task 2's `quiz-submit` when submitted through Task 4's UI, with partial credit computed per blank.
- The "changed `type` away from `fill-blank`" leak scenario from Task 1 Step 4 still holds after Task 3's admin changes (i.e., nothing added in Task 3 reintroduces a `type`-conditional stripping path).
- Legacy single-answer `fill-blank` questions (existing seeded data, if any) are completely unaffected by any of the 4 tasks — same input UI, same scoring, same admin form.
