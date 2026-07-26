# Learning Interface Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs (user sees admin notifications, admin draft-save loses edits) and add two features (multiple acceptable translation answers, writing max-6-attempts with history + notification-click navigation) in the DeutschPath app.

**Architecture:** Frontend React 19 + Vite + Tailwind v4; backend Supabase (PostgREST + RLS + triggers) with Deno edge functions. Grading of exercises runs server-side in edge functions; `correct_answer` is never sent to the client. Changes are grouped into 4 independent items shipped in order 4 → 3 → 2 → 1.

**Tech Stack:** React 19, TypeScript 5.8, Supabase JS client, Deno edge functions, `node:test` via `tsx` for pure-logic unit tests, `tsc --noEmit` (`npm run lint`) as the type gate.

## Global Constraints

- Code identifiers/comments in **English**; user-facing strings in **Vietnamese**.
- No `any` in TypeScript — use concrete types or `unknown`.
- Named exports only (except `App.tsx`).
- Never send `correct_answer`/`acceptable_answers` to the client; grading stays in the `grammar-submit` edge function.
- Do **not** hand-edit `src/lib/database.types.ts` — regenerate it.
- `MAX_WRITING_ATTEMPTS = 6` (fixed constant, not configurable).
- Use `showToast()` for notices; never `window.alert`/`confirm`.
- Type gate for every task: `npm run lint` must pass.
- Unit tests run with: `npx tsx --test <file>` (repo pattern: `node:test` + `node:assert/strict`).

### Confirm-before-doing (out of the pure-implementation scope — ask the user)

- **Applying any migration to a live Supabase project or deploying edge functions.** Tasks below create SQL migration files and edited function code; *applying/deploying* them (via `supabase db push`, the Supabase MCP `apply_migration`/`deploy_edge_function`, or a branch) is a separate, side-effectful step — confirm with the user before running it.
- **Regenerating `database.types.ts`** requires the migration to be applied somewhere (local stack or a Supabase branch). If neither is available, pause and ask rather than hand-editing the file.

---

## Task 1 — Item 4: User notification bell hides admin broadcasts

**Files:**
- Modify: `src/lib/hooks/useNotifications.ts:19-24`

**Interfaces:**
- Consumes: existing `notifications` table columns.
- Produces: unchanged `useNotifications` public shape (`notifications`, `unreadCount`, `loading`, `markRead`).

- [ ] **Step 1: Add the `for_admin=false` filter to the query**

In `src/lib/hooks/useNotifications.ts`, change the query chain so it only returns user-facing rows:

```ts
    supabase
      .from("notifications")
      .select("id, type, lesson_id, message, read_at, created_at")
      .eq("for_admin", false)
      .order("created_at", { ascending: false })
      .limit(30)
```

(Only the `.eq("for_admin", false)` line is added; everything else is unchanged.)

- [ ] **Step 2: Type gate**

Run: `npm run lint`
Expected: PASS (no type errors).

- [ ] **Step 3: Manual verification**

Run the dev server (`npm run dev`). Log in as an **admin** account on the user frontend → open the bell → confirm no admin broadcast (e.g. "Có bài viết mới cần chấm…") appears. A normal user's own `writing_graded` notification still appears.

- [ ] **Step 4: Commit**

```bash
git add src/lib/hooks/useNotifications.ts
git commit -m "fix: user notification bell no longer shows admin broadcasts"
```

---

## Task 2 — Item 3: Admin lesson editor saves persist edits and stay on page

**Files:**
- Modify: `src/pages/admin/AdminLessonEditor.tsx:127-193` (the three handlers) and `:221-233` (button labels).

**Interfaces:**
- Consumes: `supabase`, `showToast`, `onSaved`, `data` state (unchanged).
- Produces: unchanged component props (`lesson`, `onBack`, `onSaved`).

- [ ] **Step 1: Make `handleSave` keep status and stay on the editor**

Replace the body of `handleSave` (currently ends by calling `onSaved()`) so it does **not** navigate away. The field list is unchanged; only the success branch changes:

```tsx
  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("lessons").update({
      title: data.title,
      title_vi: data.title_vi,
      duration: data.duration,
      youtube_id: data.youtube_id || null,
      xp_reward: data.xp_reward,
      objective: data.objective || null,
      summary: data.summary || null,
      vocabulary_md: data.vocabulary_md || null,
      grammar: data.grammar,
      grammar_md: data.grammar_md || null,
      speaking_md: data.speaking_md || null,
      writing_prompt_md: data.writing_prompt_md || null,
      video_r2_key: data.video_r2_key || null,
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast("Đã lưu bài học.", "success");
      // Stay on the editor — do NOT call onSaved()/navigate away.
    }
  };
```

- [ ] **Step 2: Make `handleRevertToDraft` persist all fields + set draft + stay**

Replace `handleRevertToDraft` (currently updates only `status`) so it writes the full field set plus `status: "draft"` and stays on the editor:

```tsx
  const handleRevertToDraft = async () => {
    setSaving(true);
    const { error } = await supabase.from("lessons").update({
      title: data.title,
      title_vi: data.title_vi,
      duration: data.duration,
      youtube_id: data.youtube_id || null,
      xp_reward: data.xp_reward,
      objective: data.objective || null,
      summary: data.summary || null,
      vocabulary_md: data.vocabulary_md || null,
      grammar: data.grammar,
      grammar_md: data.grammar_md || null,
      speaking_md: data.speaking_md || null,
      writing_prompt_md: data.writing_prompt_md || null,
      video_r2_key: data.video_r2_key || null,
      status: "draft",
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Chuyển về Nháp thất bại: " + error.message, "warning");
    } else {
      showToast("Đã lưu và chuyển về Nháp.", "success");
      setData(prev => ({ ...prev, status: "draft" }));
      // Stay on the editor so the status badge updates in place.
    }
  };
```

(Leave `handlePublish` unchanged — it already writes all fields, sets `status: "published"`, and calls `onSaved()` to return to the list.)

- [ ] **Step 3: Type gate**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Manual verification**

`npm run dev` → admin container → Quản lý Nội dung → open a **draft** lesson → edit "Ngữ pháp then chốt" → click "Lưu bài học" → confirm: stays on editor, toast shown, reload keeps the edit, status still Nháp. Then open a **published** lesson → edit grammar → click "Chuyển về Nháp" → confirm: stays on editor, edit persisted, badge now Nháp. Click "Public" on a draft → returns to list, lesson published.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminLessonEditor.tsx
git commit -m "fix: admin lesson save/revert persist edits and stay on editor"
```

---

## Task 3 — Item 2: migration adds `acceptable_answers` to grammar_exercises

**Files:**
- Create: `supabase/migrations/20260726000001_translation_acceptable_answers.sql`
- Modify (regenerated): `src/lib/database.types.ts`

**Interfaces:**
- Produces: new nullable column `grammar_exercises.acceptable_answers JSONB` (array of strings, used only for `translation`).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260726000001_translation_acceptable_answers.sql`:

```sql
-- Additional accepted German answers for translation exercises. NULL/[] means
-- "only correct_answer is accepted". Used exclusively by type = 'translation';
-- scoring accepts the user's answer if it matches correct_answer OR any entry
-- here (after normalization). Kept server-side — never selected by the client.
ALTER TABLE grammar_exercises ADD COLUMN acceptable_answers JSONB;
```

- [ ] **Step 2: Apply the migration** *(confirm-before-doing — see Global Constraints)*

Apply to the local stack or a Supabase branch (ask the user which), e.g. local: `supabase db reset` (or `supabase migration up`), or via the Supabase MCP `apply_migration`.
Expected: migration applies with no error; `grammar_exercises` now has `acceptable_answers`.

- [ ] **Step 3: Regenerate types**

Run: `npm run gen:types` (local stack) **or** Supabase MCP `generate_typescript_types`, writing to `src/lib/database.types.ts`.
Expected: `grammar_exercises` Row/Insert/Update now include `acceptable_answers: Json | null`.

- [ ] **Step 4: Type gate**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260726000001_translation_acceptable_answers.sql src/lib/database.types.ts
git commit -m "feat: add acceptable_answers column for translation exercises"
```

---

## Task 4 — Item 2: scoring accepts any acceptable translation answer (TDD)

**Files:**
- Create: `supabase/functions/grammar-submit/scoring.test.ts`
- Modify: `supabase/functions/grammar-submit/scoring.ts`

**Interfaces:**
- Consumes: `computeGrammarScore(exercises, answers)`.
- Produces: extended `ScorableGrammarExercise` with `type: string`, `correct_answer: string | null`, `acceptable_answers: string[] | null`, `classification_items`. Scoring rule for `translation`: correct if normalized user answer equals normalized `correct_answer` **or** any normalized entry of `acceptable_answers`.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/grammar-submit/scoring.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { computeGrammarScore, type ScorableGrammarExercise } from "./scoring.ts";

const translation = (over: Partial<ScorableGrammarExercise> = {}): ScorableGrammarExercise => ({
  id: "t1",
  type: "translation",
  correct_answer: "Ich lerne Deutsch",
  acceptable_answers: null,
  classification_items: null,
  ...over,
});

test("translation: matches the primary correct_answer", () => {
  const r = computeGrammarScore([translation()], { t1: "ich lerne deutsch." });
  assert.equal(r.correct, 1);
  assert.equal(r.total, 1);
});

test("translation: matches any acceptable alternative", () => {
  const ex = translation({ acceptable_answers: ["Ich studiere Deutsch", "Ich lerne die deutsche Sprache"] });
  const r = computeGrammarScore([ex], { t1: "Ich studiere Deutsch" });
  assert.equal(r.correct, 1);
});

test("translation: an unrelated answer is wrong", () => {
  const ex = translation({ acceptable_answers: ["Ich studiere Deutsch"] });
  const r = computeGrammarScore([ex], { t1: "Ich spiele Fußball" });
  assert.equal(r.correct, 0);
});

test("translation: empty/absent acceptable_answers still grades against correct_answer only", () => {
  const r = computeGrammarScore([translation({ acceptable_answers: [] })], { t1: "Ich lerne Deutsch" });
  assert.equal(r.correct, 1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test supabase/functions/grammar-submit/scoring.test.ts`
Expected: FAIL — `ScorableGrammarExercise` has no `acceptable_answers`, so type/behavior mismatch (alternatives scored wrong).

- [ ] **Step 3: Implement the scoring change**

In `supabase/functions/grammar-submit/scoring.ts`, extend the interface and the non-classification branch:

```ts
export interface ScorableGrammarExercise {
  id: string;
  type: string;
  correct_answer: string | null;
  acceptable_answers: string[] | null;
  classification_items: { item: string; group: string }[] | null;
}
```

Then replace the default (non-classification) scoring block:

```ts
    total += 1;
    const userAnswer = normalizeWord(answers[ex.id] ?? "");
    if (ex.type === "translation") {
      const accepted = [ex.correct_answer ?? "", ...(ex.acceptable_answers ?? [])]
        .map(normalizeWord)
        .filter((s) => s.length > 0);
      if (accepted.includes(userAnswer)) correct++;
    } else {
      const correctAnswer = normalizeWord(ex.correct_answer ?? "");
      if (userAnswer === correctAnswer) correct++;
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test supabase/functions/grammar-submit/scoring.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/grammar-submit/scoring.ts supabase/functions/grammar-submit/scoring.test.ts
git commit -m "feat: grammar scoring accepts multiple acceptable translation answers"
```

---

## Task 5 — Item 2: edge-function select + admin translation UI for extra answers

**Files:**
- Modify: `supabase/functions/grammar-submit/index.ts:53-54`
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx` (interface `GrammarExercise` ~L28-46, `EditForm` L76-87, `EMPTY_FORM` L97-108, `buildPayload` L165-181, `openEdit` mapping L650-663, and the translation form JSX L400-423; plus `openCreate`/append default mapping if present)

**Interfaces:**
- Consumes: `acceptable_answers` column (Task 3), `computeGrammarScore` (Task 4).
- Produces: admin form persists `acceptable_answers` for translation; edge function selects it for scoring.

- [ ] **Step 1: Select the column in the edge function**

In `supabase/functions/grammar-submit/index.ts`, extend the select:

```ts
      .from("grammar_exercises")
      .select("id, type, correct_answer, acceptable_answers, classification_items")
```

- [ ] **Step 2: Add `acceptable_answers` to the admin form model**

In `src/pages/admin/AdminGrammarExerciseSection.tsx`:

- Add to the local `GrammarExercise` interface (near `correct_answer`):

```ts
  acceptable_answers: string[] | null;
```

- Add to `EditForm`:

```ts
  acceptable_answers: string[];
```

- Add to `EMPTY_FORM`:

```ts
  acceptable_answers: [],
```

- In `buildPayload`, add (translation-only, else null):

```ts
  acceptable_answers:
    form.type === "translation"
      ? form.acceptable_answers.map((a) => a.trim()).filter(Boolean)
      : null,
```

- In `openEdit`'s entry mapping, add:

```ts
        acceptable_answers: ex.acceptable_answers ?? [],
```

(If a separate `openCreate`/append mapping builds an `EditForm` from scratch, it already spreads `EMPTY_FORM`; no change needed there beyond the `EMPTY_FORM` default.)

- [ ] **Step 3: Add the repeatable "Đáp án khác chấp nhận được" UI**

In the `entry.type === "translation"` JSX block (after the "Câu tiếng Đức" field, before the closing `</>`), add:

```tsx
        <div>
          <label className={labelCls}>Đáp án khác chấp nhận được</label>
          <p className="text-[11px] text-slate-400 mb-1.5">Các câu tiếng Đức khác cũng được tính đúng (không phân biệt hoa thường, dấu câu).</p>
          <div className="space-y-2">
            {entry.acceptable_answers.map((ans, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={ans}
                  onChange={(e) =>
                    onChange((prev) => ({
                      ...prev,
                      acceptable_answers: prev.acceptable_answers.map((a, j) => (j === i ? e.target.value : a)),
                    }))
                  }
                  className={inputCls}
                  placeholder="Ich studiere Deutsch."
                />
                <button
                  type="button"
                  onClick={() =>
                    onChange((prev) => ({
                      ...prev,
                      acceptable_answers: prev.acceptable_answers.filter((_, j) => j !== i),
                    }))
                  }
                  className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                  aria-label="Xóa đáp án"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onChange((prev) => ({ ...prev, acceptable_answers: [...prev.acceptable_answers, ""] }))}
              className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm đáp án
            </button>
          </div>
        </div>
```

Ensure `X` and `Plus` are imported from `lucide-react` in this file (add to the existing import if missing).

- [ ] **Step 4: Type gate**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Manual verification**

`npm run dev` → admin → Grammatikübungen → create/edit a translation exercise → add 2 alternatives → save. In the user quiz, submitting the primary answer or either alternative scores correct; an unrelated answer scores wrong. (Requires the edge function deployed/served — see confirm-before-doing.)

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/grammar-submit/index.ts src/pages/admin/AdminGrammarExerciseSection.tsx
git commit -m "feat: admin can add extra acceptable answers for translation exercises"
```

---

## Task 6 — Item 1: migration for multi-attempt writing (limit 6 + RLS + triggers)

**Files:**
- Create: `supabase/migrations/20260726000002_writing_attempts_limit.sql`
- Modify (regenerated): `src/lib/database.types.ts`

**Interfaces:**
- Produces: `writing_submissions` allows up to 6 rows per `(lesson_id, user_id)`; students may only INSERT (each submit is a new attempt); a `BEFORE INSERT` trigger enforces the limit server-side; the `writing_submitted` (insert) and `writing_graded` (score update) notification triggers are preserved.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260726000002_writing_attempts_limit.sql`:

```sql
-- Switch writing_submissions from one-row-per-(lesson,user) upsert to a
-- multi-attempt model: each "Nộp bài" INSERTs a new attempt row, capped at 6
-- per (lesson_id, user_id). Students never UPDATE content anymore (each
-- submission is a fresh attempt); admins still grade via UPDATE of
-- score/comment on a specific row.

-- 1. Allow multiple attempts: drop the uniqueness that forced upsert.
ALTER TABLE writing_submissions DROP CONSTRAINT writing_submissions_lesson_id_user_id_key;

-- 2. Server-enforced 6-attempt cap.
CREATE OR REPLACE FUNCTION enforce_writing_attempt_limit()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM writing_submissions
      WHERE lesson_id = NEW.lesson_id AND user_id = NEW.user_id) >= 6 THEN
    RAISE EXCEPTION 'writing attempt limit reached'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_writing_attempt_limit
  BEFORE INSERT ON writing_submissions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_writing_attempt_limit();

-- 3. Students are INSERT-only now — drop the resubmit UPDATE policy and the
--    resubmit-notify trigger (there are no content updates by students).
DROP POLICY "writing_submissions: own resubmit" ON writing_submissions;
DROP TRIGGER trg_notify_writing_resubmitted ON writing_submissions;
```

Note: the student INSERT policy, the admin `FOR ALL` policy, the INSERT `writing_submitted` notify trigger, and the score-UPDATE `writing_graded` notify trigger are all kept from migration `20260717000017`.

- [ ] **Step 2: Apply the migration** *(confirm-before-doing)*

Apply to local stack or a Supabase branch (ask the user).
Expected: applies cleanly; existing single rows remain as each user's attempt #1.

- [ ] **Step 3: Regenerate types**

Run: `npm run gen:types` or Supabase MCP `generate_typescript_types` → `src/lib/database.types.ts`.
Expected: `writing_submissions` types unchanged in columns (constraint change is not reflected in TS).

- [ ] **Step 4: Type gate + commit**

Run: `npm run lint` → PASS.

```bash
git add supabase/migrations/20260726000002_writing_attempts_limit.sql src/lib/database.types.ts
git commit -m "feat: writing_submissions supports up to 6 attempts with server-enforced cap"
```

---

## Task 7 — Item 1: `useWritingSubmission` returns all attempts + submit inserts

**Files:**
- Modify: `src/lib/hooks/useWritingSubmission.ts` (whole file)

**Interfaces:**
- Consumes: `writing_submissions` (multi-row).
- Produces: hook returns `{ attempts: WritingSubmission[]; attemptCount: number; canSubmit: boolean; loading: boolean; error: string | null; submit: (content: string) => Promise<{ error: string | null }> }`. `attempts` are ordered newest-first. `submit` INSERTs a new attempt (no upsert) and refetches. Exports `MAX_WRITING_ATTEMPTS = 6`.

- [ ] **Step 1: Rewrite the hook for multiple attempts**

Replace the contents of `src/lib/hooks/useWritingSubmission.ts`:

```ts
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";

export const MAX_WRITING_ATTEMPTS = 6;

export interface WritingSubmission {
  id: string;
  content: string;
  score: number | null;
  comment: string | null;
  gradedAt: string | null;
  submittedAt: string;
}

export function useWritingSubmission(lessonId: string, userId: string | null) {
  const [attempts, setAttempts] = useState<WritingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAttempts = useCallback(() => {
    if (!userId) {
      setAttempts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("writing_submissions")
      .select("id, content, score, comment, graded_at, submitted_at")
      .eq("lesson_id", lessonId)
      .eq("user_id", userId)
      .order("submitted_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
        } else {
          setAttempts(
            (data ?? []).map((d) => ({
              id: d.id as string,
              content: d.content as string,
              score: d.score as number | null,
              comment: d.comment as string | null,
              gradedAt: d.graded_at as string | null,
              submittedAt: d.submitted_at as string,
            })),
          );
        }
        setLoading(false);
      });
  }, [lessonId, userId]);

  useEffect(() => { fetchAttempts(); }, [fetchAttempts]);

  const submit = async (content: string): Promise<{ error: string | null }> => {
    if (!userId) return { error: "Chưa đăng nhập." };
    if (attempts.length >= MAX_WRITING_ATTEMPTS) {
      return { error: "Bạn đã dùng hết 6 lần nộp cho bài viết này." };
    }
    const { error: err } = await supabase.from("writing_submissions").insert({
      lesson_id: lessonId,
      user_id: userId,
      content,
      score: null,
      comment: null,
      graded_at: null,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (err) {
      // The server-side trigger also enforces the cap; surface a friendly message.
      if (err.message.includes("writing attempt limit")) {
        return { error: "Bạn đã dùng hết 6 lần nộp cho bài viết này." };
      }
      return { error: err.message };
    }
    fetchAttempts();
    return { error: null };
  };

  const attemptCount = attempts.length;
  const canSubmit = attemptCount < MAX_WRITING_ATTEMPTS;

  return { attempts, attemptCount, canSubmit, loading, error, submit };
}
```

- [ ] **Step 2: Type gate**

Run: `npm run lint`
Expected: FAIL — `WritingTabPanel` in `LessonDetailPage.tsx` still uses the old `{ submission }` shape. This is expected; Task 8 fixes the consumer. (If you are running tasks strictly independently, proceed to Task 8 before asserting a green lint.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useWritingSubmission.ts
git commit -m "feat: useWritingSubmission returns all attempts and inserts new ones"
```

---

## Task 8 — Item 1: user writing tab shows note, remaining count, disabled state, history

**Files:**
- Modify: `src/pages/LessonDetailPage.tsx:315-379` (the `WritingTabPanel` component)

**Interfaces:**
- Consumes: `useWritingSubmission` → `{ attempts, attemptCount, canSubmit, loading, submit }`, `MAX_WRITING_ATTEMPTS`.
- Produces: unchanged `WritingTabPanel` props (`lessonId`, `userId`, `promptMd`).

- [ ] **Step 1: Rewrite `WritingTabPanel`**

Replace the `WritingTabPanel` component. Update its import at the top of the file to include the constant:

```tsx
import { useWritingSubmission, MAX_WRITING_ATTEMPTS } from "../lib/hooks/useWritingSubmission";
```

Component body:

```tsx
const WritingTabPanel: React.FC<{ lessonId: string; userId: string; promptMd: string }> = ({ lessonId, userId, promptMd }) => {
  const { attempts, attemptCount, canSubmit, loading, submit } = useWritingSubmission(lessonId, userId);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) {
      showToast("Vui lòng viết bài trước khi nộp.", "warning");
      return;
    }
    setSubmitting(true);
    const { error } = await submit(content.trim());
    setSubmitting(false);
    if (error) {
      showToast("Nộp bài thất bại: " + error, "warning");
    } else {
      showToast("Đã nộp bài viết.", "success");
      setContent("");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MarkdownBlock content={promptMd} />

      <textarea
        id="writing-submission-textarea"
        rows={10}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Viết bài của bạn ở đây..."
        disabled={!canSubmit}
        className="w-full px-4 py-3 bg-white border border-slate-250 rounded-xl font-sans text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition duration-150 resize-y disabled:bg-slate-50 disabled:text-slate-400"
      />

      <p className="text-xs text-slate-400 font-sans text-center">
        Học viên chỉ được nộp tối đa {MAX_WRITING_ATTEMPTS} lần bài viết. Đã nộp {attemptCount}/{MAX_WRITING_ATTEMPTS} lần.
      </p>

      <div className="flex justify-center">
        <Button id="btn-writing-submit" variant="primary" onClick={handleSubmit} disabled={submitting || !canSubmit}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
          {canSubmit ? "Nộp bài" : "Đã hết lượt nộp"}
        </Button>
      </div>

      {attempts.length > 0 && (
        <div className="space-y-3 pt-2">
          <h4 className="text-xs font-display font-bold text-slate-500 uppercase tracking-wider">Các lần đã nộp</h4>
          {attempts.map((a, i) => (
            <div key={a.id} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">Lần {attempts.length - i}</span>
                <span className="text-[11px] text-slate-400">{new Date(a.submittedAt).toLocaleString("vi-VN")}</span>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap font-sans">{a.content}</p>
              {a.gradedAt ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 space-y-1">
                  <p className="text-xs font-display font-bold text-emerald-700">Đã chấm: {a.score}/100</p>
                  {a.comment && <p className="text-xs text-emerald-800 font-sans whitespace-pre-wrap">{a.comment}</p>}
                </div>
              ) : (
                <p className="text-xs text-slate-400 font-sans">Đang chờ admin chấm điểm.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

(Remove the old single-submission graded box / "Nộp lại" markup — it is replaced by the history list above.)

- [ ] **Step 2: Type gate**

Run: `npm run lint`
Expected: PASS (Task 7 + Task 8 together compile).

- [ ] **Step 3: Manual verification**

`npm run dev` → open a lesson with a writing prompt → the note shows "Đã nộp 0/6". Submit → history shows "Lần 1", count becomes 1/6. Submit up to 6 → the textarea and button disable, button reads "Đã hết lượt nộp", note shows 6/6.

- [ ] **Step 4: Commit**

```bash
git add src/pages/LessonDetailPage.tsx
git commit -m "feat: writing tab shows attempt limit note, count, and submission history"
```

---

## Task 9 — Item 1: admin grading groups by student+lesson with read-only history

**Files:**
- Modify: `src/pages/admin/AdminWritingSection.tsx` (whole file)

**Interfaces:**
- Consumes: `writing_submissions` (multi-row) with `lessons(title_vi)` and `profiles(email, full_name)`.
- Produces: table shows one row per `(user_id, lesson_id)` group with attempt count; grading modal grades the **latest** attempt and lists earlier attempts read-only.

- [ ] **Step 1: Group rows and render count; add read-only history in the modal**

Rewrite `AdminWritingSection.tsx`. Keep the existing fetch/select and the grade save, but derive groups and target the latest attempt:

```tsx
import React, { useState, useEffect, useMemo } from "react";
import { Loader2, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";

interface WritingSubmissionRow {
  id: string;
  lesson_id: string;
  user_id: string;
  content: string;
  score: number | null;
  comment: string | null;
  graded_at: string | null;
  submitted_at: string;
  lessons: { title_vi: string } | null;
  profiles: { email: string; full_name: string | null } | null;
}

interface WritingGroup {
  key: string;
  latest: WritingSubmissionRow;      // newest attempt — the one admin grades
  earlier: WritingSubmissionRow[];   // older attempts, read-only, newest-first
  attemptCount: number;
}

export const AdminWritingSection: React.FC = () => {
  const [rows, setRows] = useState<WritingSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState<WritingGroup | null>(null);
  const [score, setScore] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRows = () => {
    setLoading(true);
    supabase
      .from("writing_submissions")
      .select("id, lesson_id, user_id, content, score, comment, graded_at, submitted_at, lessons(title_vi), profiles(email, full_name)")
      .order("submitted_at", { ascending: false })
      .then(({ data }) => {
        setRows((data ?? []) as unknown as WritingSubmissionRow[]);
        setLoading(false);
      });
  };

  useEffect(() => { fetchRows(); }, []);

  // rows are newest-first; group by (user_id, lesson_id), first seen = latest.
  const groups = useMemo<WritingGroup[]>(() => {
    const map = new Map<string, WritingSubmissionRow[]>();
    for (const r of rows) {
      const k = `${r.user_id}::${r.lesson_id}`;
      const arr = map.get(k);
      if (arr) arr.push(r); else map.set(k, [r]);
    }
    return Array.from(map.entries()).map(([key, list]) => ({
      key,
      latest: list[0],
      earlier: list.slice(1),
      attemptCount: list.length,
    }));
  }, [rows]);

  const openGrade = (g: WritingGroup) => {
    setGrading(g);
    setScore(g.latest.score !== null ? String(g.latest.score) : "");
    setComment(g.latest.comment ?? "");
  };

  const handleSaveGrade = async () => {
    if (!grading) return;
    const parsedScore = parseInt(score, 10);
    if (Number.isNaN(parsedScore) || parsedScore < 0 || parsedScore > 100) {
      showToast("Điểm phải là số từ 0 đến 100.", "warning");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("writing_submissions")
      .update({ score: parsedScore, comment: comment || null, graded_at: new Date().toISOString() })
      .eq("id", grading.latest.id);
    setSaving(false);
    if (error) {
      showToast("Lưu điểm thất bại: " + error.message, "warning");
    } else {
      showToast("Đã lưu điểm.", "success");
      setGrading(null);
      fetchRows();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-display font-extrabold text-slate-900">Chấm bài viết</h1>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-display font-bold text-slate-500 uppercase tracking-wider">
              <th className="px-4 py-2.5">Học viên</th>
              <th className="px-4 py-2.5">Bài học</th>
              <th className="px-4 py-2.5">Nộp lúc</th>
              <th className="px-4 py-2.5">Lần nộp</th>
              <th className="px-4 py-2.5">Trạng thái</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groups.map((g) => (
              <tr key={g.key} className="hover:bg-slate-50/50">
                <td className="px-4 py-2.5 text-slate-700">{g.latest.profiles?.full_name || g.latest.profiles?.email || g.latest.user_id}</td>
                <td className="px-4 py-2.5 text-slate-700">{g.latest.lessons?.title_vi ?? g.latest.lesson_id}</td>
                <td className="px-4 py-2.5 text-slate-500">{new Date(g.latest.submitted_at).toLocaleString("vi-VN")}</td>
                <td className="px-4 py-2.5 text-slate-500">{g.attemptCount}/6</td>
                <td className="px-4 py-2.5">
                  {g.latest.graded_at ? (
                    <span className="text-xs font-bold text-emerald-600">Đã chấm ({g.latest.score}/100)</span>
                  ) : (
                    <span className="text-xs font-bold text-amber-600">Chưa chấm</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => openGrade(g)} className="text-xs font-bold text-orange-600 hover:text-orange-700">
                    {g.latest.graded_at ? "Sửa điểm" : "Chấm điểm"}
                  </button>
                </td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-sm">Chưa có bài viết nào được nộp.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {grading && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-display font-extrabold text-slate-900">Chấm bài viết — lần {grading.attemptCount}</h2>
              <button onClick={() => setGrading(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-700 whitespace-pre-wrap max-h-64 overflow-y-auto font-sans">
              {grading.latest.content}
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Điểm (0-100)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Nhận xét</label>
              <textarea
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none"
                placeholder="Nhận xét cho học viên (không bắt buộc)..."
              />
            </div>

            {grading.earlier.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Các lần nộp trước (chỉ xem)</h3>
                {grading.earlier.map((e, i) => (
                  <div key={e.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500">Lần {grading.earlier.length - i}</span>
                      <span className="text-[11px] text-slate-400">{new Date(e.submitted_at).toLocaleString("vi-VN")}</span>
                    </div>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap font-sans">{e.content}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setGrading(null)}>Hủy</Button>
              <Button variant="primary" className="flex-1" onClick={handleSaveGrade} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Lưu điểm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Type gate**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 3: Manual verification**

`npm run dev` → admin → Chấm bài viết → a student who submitted 3 times shows one row "3/6"; opening it grades the latest attempt and lists the 2 earlier attempts read-only. Saving a score marks the latest attempt graded.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/AdminWritingSection.tsx
git commit -m "feat: admin writing grading groups attempts with read-only history"
```

---

## Task 10 — Item 1: notification click jumps to grading location (student + admin)

**Files:**
- Modify: `src/components/NotificationBell.tsx` (add `onNavigate` prop)
- Modify: `src/components/Navigation.tsx` (thread `onNotificationNavigate` prop → bell)
- Modify: `src/App.tsx` (define handler; `handleSelectLesson(lessonId, initialTab?)`; pass initial tab to `LessonDetailPage`)
- Modify: `src/pages/LessonDetailPage.tsx` (accept `initialTab` prop)
- Modify: `src/pages/admin/AdminApp.tsx` + `src/pages/admin/AdminPage.tsx` (lift `section` state; wire bell)

**Interfaces:**
- Consumes: `AppNotification` (from `useNotifications`), `BottomTab` (from `lessonBottomTabs`), `AdminSection` (from `AdminPage`).
- Produces: `NotificationBell` accepts `onNavigate?: (n: AppNotification) => void`. Student `writing_graded` → open lesson on `"viet"` tab. Admin `writing_submitted` → switch to `"writing"` section.

- [ ] **Step 1: NotificationBell accepts and calls `onNavigate`**

In `src/components/NotificationBell.tsx`, import the type and extend props:

```tsx
import { useNotifications, type AppNotification } from "../lib/hooks/useNotifications";

export const NotificationBell: React.FC<{ dark?: boolean; onNavigate?: (n: AppNotification) => void }> = ({ dark = false, onNavigate }) => {
```

Change the per-notification button `onClick`:

```tsx
                  onClick={() => { markRead(n.id); setOpen(false); onNavigate?.(n); }}
```

- [ ] **Step 2: LessonDetailPage accepts `initialTab`**

In `src/pages/LessonDetailPage.tsx`, add to `LessonDetailPageProps`:

```tsx
  initialTab?: BottomTab;
```

Add `initialTab` to the destructured props, and use it as the initial tab when it is currently visible:

```tsx
  const [bottomTab, setBottomTab] = useState<BottomTab>(
    () => (initialTab && visibleTabs.some((t) => t.id === initialTab) ? initialTab : (visibleTabs[0]?.id ?? "tuvung")),
  );
```

- [ ] **Step 3: App wires initial tab + notification handler (student)**

In `src/App.tsx`:

- Add state near `selectedLessonId`:

```tsx
  const [initialLessonTab, setInitialLessonTab] = useState<BottomTab | undefined>(undefined);
```

Import the type: `import { BottomTab } from "./pages/lessonBottomTabs";` and the notification type: `import type { AppNotification } from "./lib/hooks/useNotifications";`.

- Extend `handleSelectLesson`:

```tsx
  const handleSelectLesson = (lessonId: string, initialTab?: BottomTab) => {
    setSelectedLessonId(lessonId);
    setInitialLessonTab(initialTab);
    setCurrentPage("lesson-detail");
  };
```

- Add the notification navigation handler:

```tsx
  const handleNotificationNavigate = (n: AppNotification) => {
    if (n.type === "writing_graded" && n.lessonId) {
      handleSelectLesson(n.lessonId, "viet");
    }
  };
```

- Pass it to the `Navbar`:

```tsx
        <Navbar
          currentPage={currentPage}
          onNavigate={handleNavigate}
          user={user}
          onLogout={handleLogout}
          streak={stats.streak}
          xp={stats.xp}
          onNotificationNavigate={handleNotificationNavigate}
        />
```

- Pass `initialTab` to `LessonDetailPage`:

```tsx
                <LessonDetailPage
                  lesson={activeLessonObject}
                  stats={stats}
                  userId={user.id}
                  initialTab={initialLessonTab}
                  onBack={() => handleNavigate("roadmap")}
                  onMarkComplete={handleMarkComplete}
                  onStartQuiz={(lessonId, category = "nguphap") => {
                    setSelectedLessonId(lessonId);
                    setActiveExerciseCategory(category);
                    setCurrentPage("quiz");
                  }}
                />
```

- [ ] **Step 4: Navigation forwards the handler to the bell**

In `src/components/Navigation.tsx`, add to `NavigationProps`:

```tsx
  onNotificationNavigate?: (n: AppNotification) => void;
```

Import the type: `import type { AppNotification } from "../lib/hooks/useNotifications";`. Add `onNotificationNavigate` to the destructured props, and pass it:

```tsx
            <NotificationBell onNavigate={onNotificationNavigate} />
```

- [ ] **Step 5: Admin — lift `section` state and wire the bell**

In `src/pages/admin/AdminPage.tsx`, change the section state to controlled props. Update the component signature and remove the local `useState` for `section`:

```tsx
type AdminSection = "dashboard" | "users" | "content" | "quiz" | "writing";

interface AdminPageProps {
  userRole: string;
  onNavigateHome: () => void;
  section: AdminSection;
  onSectionChange: (s: AdminSection) => void;
}

export const AdminPage: React.FC<AdminPageProps> = ({ userRole, onNavigateHome, section, onSectionChange }) => {
```

Export the section type for reuse: add `export type { AdminSection };` (or change the `type AdminSection` line to `export type AdminSection`). Replace `setSection(id)` calls with `onSectionChange(id)`.

In `src/pages/admin/AdminApp.tsx`:

- Import: `import { AdminPage, type AdminSection } from "./AdminPage";` and `import type { AppNotification } from "../../lib/hooks/useNotifications";`.
- Add state: `const [section, setSection] = useState<AdminSection>("dashboard");`
- Add handler:

```tsx
  const handleNotificationNavigate = (n: AppNotification) => {
    if (n.type === "writing_submitted") setSection("writing");
  };
```

- Pass the handler to the bell and section to the page:

```tsx
            <NotificationBell dark onNavigate={handleNotificationNavigate} />
```

```tsx
          <AdminPage userRole={user.role} onNavigateHome={() => window.location.href = "/"} section={section} onSectionChange={setSection} />
```

- [ ] **Step 6: Type gate**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 7: Manual verification**

Student: grade a submission as admin, then log in as that student → click the "Bài viết của bạn đã được chấm điểm" notification → lands on that lesson's "Viết" tab showing the grade. Admin: submit a writing as a student, then as admin click "Có bài viết mới cần chấm" → switches to the "Chấm bài viết" section.

- [ ] **Step 8: Commit**

```bash
git add src/components/NotificationBell.tsx src/components/Navigation.tsx src/App.tsx src/pages/LessonDetailPage.tsx src/pages/admin/AdminApp.tsx src/pages/admin/AdminPage.tsx
git commit -m "feat: clicking a writing notification jumps to its grading location"
```

---

## Self-Review notes

- **Spec coverage:** Item 4 → Task 1. Item 3 → Task 2. Item 2 → Tasks 3–5 (schema, scoring TDD, edge select + admin UI). Item 1 → Tasks 6–9 (schema/limit/RLS, hook, user UI, admin UI) + notification navigation → Task 10.
- **Cross-task type consistency:** `useWritingSubmission` returns `{ attempts, attemptCount, canSubmit, loading, error, submit }` and exports `MAX_WRITING_ATTEMPTS` (Task 7), consumed verbatim in Task 8. `ScorableGrammarExercise` gains `type` + `acceptable_answers` (Task 4), selected in Task 5. `AdminSection` exported by `AdminPage` and imported by `AdminApp` (Task 10).
- **Ordering caveat:** Task 7 alone leaves `LessonDetailPage` failing lint until Task 8; the two are sibling halves of the hook migration and should land together (do not gate Task 7 on a green lint in isolation).
