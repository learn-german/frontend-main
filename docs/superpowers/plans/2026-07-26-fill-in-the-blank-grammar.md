# Fill in the Blank Grammar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the seventh grammar exercise type, `fill_in_the_blank`, with server-only accepted answers, optional group-level word banks, per-blank grading, learner interactions, and Admin authoring.

**Architecture:** Extend `grammar_exercises` with `blanks` and `word_bank`, exposing only the latter through `grammar_exercises_public`. Keep grading in `grammar-submit`; isolate blank parsing and word-bank state transitions into pure functions so malformed input and duplicate chips are testable without browser dependencies. Treat word bank configuration as group state in Admin and copy it to every child row.

**Tech Stack:** React 19, TypeScript 5.8, Node test runner through `tsx`, Supabase/Postgres migrations, Supabase Edge Functions (Deno).

## Global Constraints

- Use `___` as the only blank marker.
- Grade case-insensitively after trimming and collapsing whitespace; do not fold German Unicode.
- Each blank contributes one point; pass remains `score >= 80`.
- Never expose `blanks` through `grammar_exercises_public`.
- Do not modify the legacy `quiz_questions` fill-blank implementation.
- Do not add npm packages.
- Word bank is shared by all children in a `group_id`.
- `single_use` tracks chips by array index so duplicate words remain independent.
- Typing a word manually never consumes a chip.

---

### Task 1: Database schema and generated contract

**Files:**
- Create: `supabase/migrations/<generated>_grammar_fill_in_the_blank.sql`
- Modify: `src/lib/database.types.ts`

**Interfaces:**
- Produces: `grammar_exercises.blanks: Json | null`, `grammar_exercises.word_bank: Json | null`, and public-view `word_bank: Json | null`.

- [ ] Generate the migration with `npx supabase migration new grammar_fill_in_the_blank`.
- [ ] Add `fill_in_the_blank` to the existing type CHECK, add both JSONB columns, and add defensive JSON-shape CHECK constraints.
- [ ] Recreate `grammar_exercises_public` with its existing publication/admin filter, add `word_bank`, omit `blanks`, and re-grant SELECT to `authenticated`.
- [ ] Run `npx supabase db reset --local` when the local stack is available; otherwise validate SQL structure and record the unavailable integration check.
- [ ] Run `npm run gen:types` against the validated local schema; if the local stack is unavailable, update generated types only after applying the migration through the connected project.

### Task 2: Defensive per-blank scoring

**Files:**
- Modify: `supabase/functions/grammar-submit/scoring.test.ts`
- Modify: `supabase/functions/grammar-submit/scoring.ts`
- Modify: `supabase/functions/grammar-submit/index.ts`

**Interfaces:**
- Produces: `computeGrammarScore(...): { correct; total; score; blankResults }`.
- Consumes: `answers[exerciseId]` as a JSON string array for fill exercises.

- [ ] Add failing tests for correct alternatives, whitespace, umlaut mismatch, partial results, missing answers, invalid JSON, parsed object/string/null, non-string entries, and malformed `blanks`.
- [ ] Run `npx tsx --test supabase/functions/grammar-submit/scoring.test.ts` and confirm failures are caused by missing fill support.
- [ ] Extend the scorable type and implement defensive parsing with `Array.isArray`, string checks, normalized accepted answers, and a boolean result for every configured blank.
- [ ] Re-run the scoring tests and make them pass without changing behavior for existing exercise types.
- [ ] Select `blanks` in `grammar-submit` and return `blankResults` alongside the existing response fields.

### Task 3: Learner word-bank model and UI

**Files:**
- Create: `src/lib/grammarFillInBlank.ts`
- Create: `src/lib/grammarFillInBlank.test.ts`
- Modify: `src/lib/appTypes.ts`
- Modify: `src/lib/hooks/useGrammarExercises.ts`
- Modify: `src/pages/GrammarExercisePage.tsx`

**Interfaces:**
- Produces: marker counting, initial answer arrays, focus fallback, indexed chip assignments, chip replacement/release, and used-chip calculations.
- Produces: `GrammarExercise.wordBank?: { words: string[]; mode: "single_use" | "multiple_use" }`.

- [ ] Write failing pure-function tests for duplicate single-use chips, replacing/releasing chips, typed input not consuming chips, fallback to the first empty blank, no-op when full, and multiple-use reuse.
- [ ] Run `npx tsx src/lib/grammarFillInBlank.test.ts` and confirm the module/API is missing.
- [ ] Implement the smallest pure helper/reducer API that passes those tests.
- [ ] Extend client types and map `word_bank` from the public view.
- [ ] Add labels, instructions, inline blank inputs, group word-bank chips, focus handling, JSON submission, completion checks, and retry reset.
- [ ] Extend `GrammarResult` with `blankResults` and render read-only per-blank green/red answers in the existing result explanation section.
- [ ] Run the helper tests, `npm run lint`, and `npm run build`.

### Task 4: Admin authoring and group persistence

**Files:**
- Modify: `src/lib/grammarFillInBlank.ts`
- Modify: `src/lib/grammarFillInBlank.test.ts`
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx`

**Interfaces:**
- Consumes: marker counting and word-bank types from `grammarFillInBlank.ts`.
- Produces: per-row `blanks` payload and one normalized group-level `word_bank`.

- [ ] Add failing helper tests for syncing accepted-answer editors to marker count and normalizing/validating blank and word-bank payloads.
- [ ] Run the helper tests and confirm the new validation cases fail.
- [ ] Implement the helper functions, then re-run tests green.
- [ ] Add the type option, badge, per-entry blank editors, shared modal-level word-bank controls, validation, payload nulling, and fill preview.
- [ ] In create, copy the shared word bank to every payload; in edit, propagate it to every row with the same `group_id`; in append, inherit and preserve the group word bank.
- [ ] Run helper tests, `npm run lint`, and `npm run build`.

### Task 5: Full verification and Supabase handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-07-26-fill-in-the-blank-grammar-design.md` only if implementation uncovers a necessary clarification.

**Interfaces:**
- Verifies all interfaces from Tasks 1–4.

- [ ] Run all repository TypeScript tests discovered under `src` and `supabase/functions`.
- [ ] Run `npm run lint`, `npm run build`, and `git diff --check`.
- [ ] Review the public view to confirm `word_bank` is exposed and `blanks` is absent.
- [ ] Review Edge Function code to confirm the service-role key remains server-only and malformed client input cannot crash scoring.
- [ ] If a connected Supabase project is available, apply the migration, regenerate types, run advisors, deploy `grammar-submit`, and execute a test query/function invocation; otherwise report these production operations as pending rather than claiming them complete.
- [ ] Compare the final diff line-by-line with every acceptance criterion in the design spec.
