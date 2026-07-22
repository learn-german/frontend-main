# Grammar Exercise Hints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins manage one optional, 1,000-character hint per grouped grammar exercise and let learners safely expand that hint without affecting answers or scoring.

**Architecture:** Persist `hint` on every `grammar_exercises` row in a `group_id`, expose it through the existing safe public view, and normalize/validate it through pure helpers. The Admin modal owns one hint state outside its child-question forms; the learner page renders the current group hint in a local collapsible component.

**Tech Stack:** React 19, TypeScript 5.8, Supabase/Postgres migrations, Node test runner with `tsx`, Tailwind CSS, Vite.

## Global Constraints

- Hint is optional; whitespace-only input is stored as `NULL`.
- Maximum length is exactly 1,000 JavaScript characters in UI and 1,000 PostgreSQL characters in storage.
- Do not inspect, warn about, or block hint content based on correct answers.
- Render hint as plain React text with preserved newlines; never execute HTML or script.
- Toggling a hint must not call Supabase or mutate answer, attempt, score, XP, or completion state.
- Old rows with no hint and old rows with no `group_id` remain valid.
- Preserve the user's unrelated `package-lock.json` modification.

---

### Task 1: Hint normalization and persistence contract

**Files:**
- Create: `src/lib/grammarExerciseHint.ts`
- Create: `src/lib/grammarExerciseHint.test.ts`
- Create: `supabase/migrations/20260722000028_grammar_exercise_hints.sql`
- Modify: `src/lib/database.types.ts`

**Interfaces:**
- Produces: `GRAMMAR_EXERCISE_HINT_MAX_LENGTH`, `normalizeGrammarHint(value: string): string | null`, and `validateGrammarHint(value: string): string | null`.
- Produces: nullable `hint` on `grammar_exercises` and `grammar_exercises_public` generated types.

- [ ] **Step 1: Write failing helper tests**

Create tests using `node:test` and `node:assert/strict` for empty, whitespace-only, significant multiline content, 1,000 characters, and 1,001 characters. Assert the exact validation message `Gợi ý không được vượt quá 1.000 ký tự.`.

- [ ] **Step 2: Run the tests and verify RED**

Run: `node --import tsx --test src/lib/grammarExerciseHint.test.ts`

Expected: FAIL because `./grammarExerciseHint` does not exist.

- [ ] **Step 3: Implement the minimal pure helpers**

Implement the three exported interfaces. Normalization uses `value.trim() === "" ? null : value`; validation compares `value.length` to the exported maximum.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `node --import tsx --test src/lib/grammarExerciseHint.test.ts`

Expected: all helper tests PASS.

- [ ] **Step 5: Add the database migration and generated type changes**

The migration adds `hint TEXT`, adds a named check constraint for `char_length(hint) <= 1000`, recreates `grammar_exercises_public` with `g.hint`, preserves the published lesson/exercise filters, preserves classification answer redaction, and grants authenticated SELECT. Add `hint` to table Row/Insert/Update and view Row types.

- [ ] **Step 6: Verify static contracts**

Run: `npm run lint`

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/grammarExerciseHint.ts src/lib/grammarExerciseHint.test.ts src/lib/database.types.ts supabase/migrations/20260722000028_grammar_exercise_hints.sql
git commit -m "feat: add grammar exercise hint persistence"
```

### Task 2: Admin create, edit, clear, and validation flow

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx`
- Modify: `src/lib/grammarExerciseHint.test.ts`

**Interfaces:**
- Consumes: `normalizeGrammarHint` and `validateGrammarHint` from Task 1.
- Produces: one Admin `hint` state per modal and group-wide update behavior.

- [ ] **Step 1: Add failing payload/helper assertions**

Extend the pure helper tests to document that significant leading/trailing whitespace and multiline content remain unchanged while whitespace-only input normalizes to `null`.

- [ ] **Step 2: Run the focused tests and verify RED for the new case**

Run: `node --import tsx --test src/lib/grammarExerciseHint.test.ts`

Expected: the newly introduced preservation case fails until helper behavior matches the contract, or passes if Task 1 already implements the exact contract; in that case verify the test specifically exercises the production helper before continuing.

- [ ] **Step 3: Extend Admin data and modal state**

Add `hint: string | null` to the local row interface and `hint` state initialized to `""`. Reset it in `openCreate`, load it in `openEdit`, and leave it unchanged in `handleTypeChange`.

- [ ] **Step 4: Add the field directly below exercise type**

Render a multiline textarea labeled `Gợi ý`, a learner-oriented placeholder, and a right-aligned `${hint.length}/1000` counter. Do not apply `maxLength`, because 1,001-character input must remain visible for validation and correction.

- [ ] **Step 5: Implement validation and writes**

Call `validateGrammarHint(hint)` before per-entry validation. On create, add normalized `hint` to every inserted row. On edit, update the selected row's normal payload, then update `{ hint: normalizedHint }` across its `group_id`; for a null `group_id`, include hint in the selected-row update. Do not close the modal unless all required requests succeed.

- [ ] **Step 6: Verify Admin compilation**

Run: `npm run lint`

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/AdminGrammarExerciseSection.tsx src/lib/grammarExerciseHint.test.ts
git commit -m "feat: manage grammar exercise hints in admin"
```

### Task 3: Learner hint mapping and safe collapsible UI

**Files:**
- Modify: `src/lib/appTypes.ts`
- Modify: `src/lib/hooks/useGrammarExercises.ts`
- Create: `src/components/GrammarExerciseHint.tsx`
- Modify: `src/pages/GrammarExercisePage.tsx`

**Interfaces:**
- Produces: `GrammarExercise.hint?: string`.
- Produces: `GrammarExerciseHint({ hint, groupKey }: { hint?: string; groupKey: string }): React.ReactNode`.
- Consumes: current page's first exercise because every row in a group shares the same hint.

- [ ] **Step 1: Add the learner model and query mapping**

Add optional `hint` to `GrammarExercise`, request `hint` from `grammar_exercises_public`, and map nullable database values to `undefined`.

- [ ] **Step 2: Implement the isolated collapsible component**

Return `null` when `hint?.trim()` is empty. Otherwise render an accessible button with `aria-expanded`, labels `Xem gợi ý`/`Ẩn gợi ý`, and conditionally render the hint in a `whitespace-pre-wrap break-words` text container. Reset expanded state to false in an effect keyed by `groupKey`.

- [ ] **Step 3: Place the component above child questions**

In `GrammarExercisePage`, derive the key from `currentPage[0]?.groupId ?? currentPage[0]?.id` and render the component between the page instruction and question grid. Do not pass answer setters or Supabase dependencies to the component.

- [ ] **Step 4: Verify types and production build**

Run: `npm run lint && npm run build`

Expected: both commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/appTypes.ts src/lib/hooks/useGrammarExercises.ts src/components/GrammarExerciseHint.tsx src/pages/GrammarExercisePage.tsx
git commit -m "feat: show collapsible grammar hints to learners"
```

### Task 4: End-to-end verification and acceptance audit

**Files:**
- Modify if needed: files changed in Tasks 1-3 only

**Interfaces:**
- Consumes all previous tasks; produces no new runtime API.

- [ ] **Step 1: Run automated verification from a clean command invocation**

Run: `node --import tsx --test src/lib/grammarExerciseHint.test.ts && npm run lint && npm run build`

Expected: all tests pass, typecheck exits 0, Vite production build exits 0.

- [ ] **Step 2: Audit the migration security contract**

Confirm the latest public view includes `hint` and excludes `correct_answer` plus the group assignment from `classification_items`. Confirm the database constraint accepts `NULL` and 1,000 characters but rejects 1,001.

- [ ] **Step 3: Audit state isolation and responsive rendering**

Inspect the final component tree to confirm hint toggle owns only `expanded`, answer inputs remain controlled by `GrammarExercisePage`, no API call is attached to the toggle, no hint wrapper exists for empty values, and no fixed width can overflow mobile.

- [ ] **Step 4: Review the final diff and working tree**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only planned feature files plus the user's pre-existing `package-lock.json` modification are present.

- [ ] **Step 5: Commit any verification fixes**

If verification required code changes, stage only the affected feature files and commit with `fix: address grammar hint verification findings`. Never stage `package-lock.json`.
