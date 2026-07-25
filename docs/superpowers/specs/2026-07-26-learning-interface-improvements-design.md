# Learning Interface Improvements — Design

Date: 2026-07-26

Four independent changes to the DeutschPath app: two bug fixes (admin draft
save, user notifications) and two features (writing attempt limit, multiple
acceptable translation answers). Each ships independently.

---

## Item 4 — User sees admin notifications (bug fix)

### Problem
When logged in with an **admin** account on the user-facing frontend, the
notification bell shows admin broadcast notifications (`for_admin = true`).
RLS is already correct — the `notifications: admin read broadcast` policy lets
an admin read broadcasts, and `useNotifications.ts` never filters them out
client-side.

### Fix
In `src/lib/hooks/useNotifications.ts`, add `.eq("for_admin", false)` to the
query. The user-facing bell then only shows per-user notifications
(`writing_graded`, etc.). The admin app has its own notification view and is
unaffected.

### Verification
- As an admin account, open the user frontend → bell shows no `for_admin`
  broadcasts.
- A normal user still sees their own `writing_graded` notification.

---

## Item 3 — Admin draft save loses edits (bug fix)

### Problem
In `src/pages/admin/AdminLessonEditor.tsx`:
- `handleRevertToDraft` updates only `status: "draft"` and discards all edited
  fields (`grammar_md`, etc.).
- `handleSave`, `handlePublish`, and `handleRevertToDraft` all call `onSaved()`,
  which navigates back to the lesson list (`setEditing(null)`), so the editor
  is left immediately after saving.

Result: editing a lesson's grammar then clicking the draft button navigates
back and loses the edits.

### Design (simple model — no draft/published content staging)
Lesson keeps its single `status: "draft" | "published"`. No separate
draft-vs-live content columns.

- **"Lưu nháp"** (rename the existing "Lưu bài học" button): saves **all**
  fields and sets `status: "draft"`; **stays on the editor** (toast only, no
  `onSaved()`).
- **"Public"**: saves all fields + `status: "published"` (unchanged behavior;
  may still navigate back via `onSaved()`).
- **"Chuyển về Nháp"** (shown when published): saves **all** fields +
  `status: "draft"`; **stays on the editor** (no longer discards field edits).
- The back arrow (`onBack`) remains the explicit way to return to the list.

A newly created lesson is `draft`, so it is not shown to users until "Public"
is clicked — this satisfies "content only appears to users after Public".

### Verification
- Edit grammar of a draft lesson → click "Lưu nháp" → stays on editor, edits
  persist after reload, `status` still `draft`.
- Edit grammar of a published lesson → click "Chuyển về Nháp" → stays on
  editor, edits persist, `status` becomes `draft`.
- `npm run lint` passes.

---

## Item 2 — Multiple acceptable answers for translation exercises (feature)

### Problem
`grammar_exercises.correct_answer` is a single string. Translation exercises
(`type = "translation"`) accept only one exact German sentence after
normalization, so valid alternative phrasings are marked wrong.

### Design

**Schema (new migration):** add column
`acceptable_answers JSONB NULL` to `grammar_exercises`. Used only for
`translation` type; an array of strings. `correct_answer` stays as the primary
answer shown in preview/explanation.

**Admin (`src/pages/admin/AdminGrammarExerciseSection.tsx`):** in the
translation form, below the existing "Câu tiếng Đức" (which writes
`correct_answer`), add a repeatable list **"Đáp án khác chấp nhận được"** —
add/remove multiple rows. Persist the non-empty trimmed entries into
`acceptable_answers` (or `null`/`[]` when none). Include `acceptable_answers`
in the form state, the insert/update payload, and the fetch mapping.

**Scoring (`supabase/functions/grammar-submit/scoring.ts`):** extend
`ScorableGrammarExercise` with `acceptable_answers: string[] | null`. For a
translation exercise, the user's normalized answer is correct if it equals the
normalized `correct_answer` **or** any normalized entry in `acceptable_answers`.
Reuse the existing `normalizeWord` (lowercases, strips `.,!?`, trims). Non-
translation types are unchanged.

**Edge function select (`supabase/functions/grammar-submit/index.ts`):** add
`acceptable_answers` to the columns selected when loading exercises for scoring.

**Types:** regenerate `src/lib/database.types.ts` via `npm run gen:types` after
the migration (do not hand-edit).

### Verification
- Admin adds a translation exercise with a primary answer + 2 alternatives.
- Submitting any of the 3 (with normalization) scores correct; an unrelated
  answer scores wrong.
- Existing translation exercises with no `acceptable_answers` still grade
  against `correct_answer` only.

---

## Item 1 — Writing (Schreiben): max 6 attempts + past-attempt history (feature)

### Problem
`writing_submissions` has `UNIQUE(lesson_id, user_id)` and the user flow upserts
a single row (unlimited overwrite via "Nộp lại"). The requirement: allow at most
**6 submissions** per lesson per user, show a note, and let the admin grading
view show past submissions and their past comments.

### Design — multi-row attempts

**Constant:** `MAX_WRITING_ATTEMPTS = 6` (fixed, not configurable).

**Schema (new migration):**
- Drop `UNIQUE(lesson_id, user_id)` on `writing_submissions`. Each "Nộp bài" is
  a new INSERT row (an attempt). Existing columns are unchanged; the id already
  identifies each attempt.
- Add a `BEFORE INSERT` trigger `check_writing_attempt_limit` that counts
  existing rows for `(NEW.lesson_id, NEW.user_id)` and raises an exception when
  the count is already `>= 6`. Server-enforced, not UI-only.
- Replace the student **UPDATE (resubmit)** RLS policy with INSERT-only: the
  student never updates content; each submission is a fresh attempt. Keep the
  student INSERT policy (`score/comment/graded_at` must be NULL) and the admin
  `FOR ALL` policy (admin sets score/comment on a specific attempt row).
- Notification triggers: keep INSERT → `writing_submitted` (admin broadcast) and
  UPDATE OF score → `writing_graded` (to the student). The `AFTER UPDATE OF
  content` resubmit-notify trigger is removed (no content updates anymore).

**Types:** regenerate `src/lib/database.types.ts` via `npm run gen:types`.

**User data hook (`src/lib/hooks/useWritingSubmission.ts`):**
- Fetch **all** attempts for `(lesson, user)` ordered by `submitted_at` (list,
  not `maybeSingle`). Expose `attempts: WritingSubmission[]`, derived
  `attemptCount`, and `canSubmit = attemptCount < MAX_WRITING_ATTEMPTS`.
- `submit(content)` performs an **INSERT** of a new attempt (no upsert), then
  refetches. Surface the trigger's limit error as a friendly Vietnamese toast.

**User UI (`WritingTabPanel` in `src/pages/LessonDetailPage.tsx`):**
- Note under the textarea: *"Học viên chỉ được nộp tối đa 6 lần bài viết."* plus
  *"Đã nộp X/6 lần."*
- Disable the submit button when `attemptCount >= 6` (label e.g. "Đã hết lượt
  nộp"). The button always creates a new attempt (no "Nộp lại" overwrite).
- History section listing previous attempts (newest first): each shows content,
  submitted time, and score/comment when graded, or "đang chờ chấm".

**Admin UI (`src/pages/admin/AdminWritingSection.tsx`):**
- Group rows by `(user_id, lesson_id)`; the table shows one entry per group with
  the latest attempt and an attempt count (e.g. "3/6").
- The grading modal gets a **history sub-section** ("Các lần nộp trước") showing
  each past attempt's content and its saved comment/score. Grading targets the
  latest ungraded attempt (each attempt row can still hold its own
  score/comment).

### Verification
- A user submits 6 times → 6 rows; the 7th INSERT is rejected (server) and the
  button is disabled with the note showing 6/6.
- Each attempt appears in the user history with its own grade/comment once
  graded.
- Admin grading modal lists past attempts and their old comments.
- `npm run lint` passes; migration applies cleanly.

---

## Rollout order
Independent, but suggested order by blast radius: **Item 4** (one-line filter) →
**Item 3** (editor buttons) → **Item 2** (translation answers) → **Item 1**
(writing attempts, largest — schema + hook + two UIs).
