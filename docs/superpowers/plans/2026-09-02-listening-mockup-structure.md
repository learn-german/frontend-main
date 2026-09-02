# Bài tập Nghe — Mockup Structure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure tab Nghe (admin + learner) to match 6 mockups — 3 question types only, set-level editor with audio / general instruction / questions, while keeping existing orange DesignSystem style.

**Architecture:** Keep `grammar_exercises` + `grammar-submit`. Add `exercise_sets.general_instruction` and new type `richtig_falsch`. New `AdminListeningExerciseSection` mirrors Reading's set editor pattern. Learner changes isolated to `QuizSetListPage` when `category === "nghe"`.

**Tech Stack:** React 19, TypeScript 5.8, Supabase migrations, Deno edge functions, existing hooks (`useExerciseSets`, `useGrammarExercises`, `useMediaPlaybackUrl`).

## Global Constraints

- Code (variables, functions, types, technical comments): **English**
- UI text (labels, messages, placeholders): **Tiếng Việt**
- No `any` — use specific types or `unknown`
- Named exports only (except `App.tsx`)
- Do not hand-edit `src/lib/database.types.ts` — run `npm run gen:types`
- Tab Nghe exposes **only** `fill_in_the_blank`, `multiple_choice`, `richtig_falsch`
- Keep existing orange Tailwind / `DesignSystem` style — do not copy red mockup palette
- No new npm packages without asking
- Run `npm run lint` after each task

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/20260902100000_listening_mockup_structure.sql` | Create | `general_instruction` + `richtig_falsch` type |
| `supabase/functions/grammar-submit/scoring.ts` | Modify | Score `richtig_falsch` |
| `supabase/functions/grammar-submit/scoring.test.ts` | Modify | Tests for `richtig_falsch` |
| `src/lib/listeningExerciseTypes.ts` | Create | Constants + labels for 3 listening types |
| `src/lib/listeningExerciseForm.ts` | Create | Validate/build payloads for admin |
| `src/lib/listeningExerciseForm.test.ts` | Create | Unit tests for form helpers |
| `src/lib/appTypes.ts` | Modify | Add `richtig_falsch` to `GrammarExercise.type` |
| `src/lib/grammarAnswerCodec.ts` | Modify | Serialize/parse `richtig_falsch` |
| `src/lib/grammarAnswerCodec.test.ts` | Modify | Codec tests |
| `src/lib/hooks/useExerciseSets.ts` | Modify | `generalInstruction` field + `updateSetInstruction` |
| `src/components/MultipleChoiceOptions.tsx` | Modify | `layout="horizontal"` prop |
| `src/components/ExerciseAnswerInput.tsx` | Modify | `richtig_falsch` UI + layout props |
| `src/components/ExercisePageHeader.tsx` | Modify | Level badge + progress bar |
| `src/pages/admin/AdminListeningExerciseSection.tsx` | Create | Admin list + set editor |
| `src/pages/admin/AdminQuizSection.tsx` | Modify | Route `nghe` → new section |
| `src/pages/admin/AdminGrammarExerciseSection.tsx` | Modify | Remove `category === "nghe"` branches |
| `src/pages/QuizSetListPage.tsx` | Modify | Nghe-specific learner layout |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260902100000_listening_mockup_structure.sql`

**Interfaces:**
- Produces: column `exercise_sets.general_instruction TEXT`; type `richtig_falsch` in `grammar_exercises_type_check`

- [ ] **Step 1: Write migration**

```sql
-- general_instruction for set-level "Yêu cầu chung"
ALTER TABLE exercise_sets
  ADD COLUMN IF NOT EXISTS general_instruction TEXT;

-- Add richtig_falsch question type
ALTER TABLE grammar_exercises
  DROP CONSTRAINT IF EXISTS grammar_exercises_type_check,
  ADD CONSTRAINT grammar_exercises_type_check CHECK (type IN (
    'word_reorder', 'error_correction', 'translation', 'sentence_transformation',
    'guided_sentence_writing', 'classification', 'fill_in_the_blank', 'multiple_choice',
    'matching', 'richtig_falsch'
  ));
```

No view change needed — `grammar_exercises_public` selects `g.type` without filtering types.

- [ ] **Step 2: Regenerate types**

Run: `npm run gen:types`
Expected: `exercise_sets` Row includes `general_instruction: string | null`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260902100000_listening_mockup_structure.sql src/lib/database.types.ts
git commit -m "feat(db): add general_instruction and richtig_falsch for listening"
```

---

### Task 2: Scoring — `richtig_falsch`

**Files:**
- Modify: `supabase/functions/grammar-submit/scoring.ts`
- Modify: `supabase/functions/grammar-submit/scoring.test.ts`

**Interfaces:**
- Consumes: exercises with `type: "richtig_falsch"`, `correct_answer: "richtig" | "falsch"`
- Produces: `computeGrammarScore` treats RF like text match; answer wire format `"richtig"` or `"falsch"`

- [ ] **Step 1: Write failing tests**

Add to `scoring.test.ts`:

```typescript
const rfExercise: ScorableGrammarExercise = {
  id: "rf1",
  type: "richtig_falsch",
  correct_answer: "richtig",
  acceptable_answers: null,
  classification_items: null,
  blanks: null,
  options: null,
  prompt_text: "Anna kommt aus Deutschland.",
};

test("richtig_falsch: đúng khi khớp richtig/falsch", () => {
  const r = computeGrammarScore([rfExercise], { rf1: "richtig" });
  assert.equal(r.correct, 1);
  assert.equal(r.exerciseResults.rf1, true);
});

test("richtig_falsch: sai khi khác đáp án", () => {
  const r = computeGrammarScore([rfExercise], { rf1: "falsch" });
  assert.equal(r.correct, 0);
  assert.equal(r.exerciseResults.rf1, false);
});

test("richtig_falsch: rỗng tính sai", () => {
  const r = computeGrammarScore([rfExercise], { rf1: "" });
  assert.equal(r.correct, 0);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `deno test supabase/functions/grammar-submit/scoring.test.ts --filter richtig_falsch`
Expected: FAIL (type not handled)

- [ ] **Step 3: Implement scoring branch**

In `computeGrammarScore`, before the final `total += 1` fallback block, add:

```typescript
if (ex.type === "richtig_falsch") {
  total += 1;
  const answer = (answers[ex.id] ?? "").trim().toLowerCase();
  const expected = (ex.correct_answer ?? "").trim().toLowerCase();
  const isCorrect = answer === "richtig" || answer === "falsch"
    ? answer === expected
    : false;
  choiceResults[ex.id] = isCorrect;
  exerciseResults[ex.id] = isCorrect;
  if (isCorrect) correct++;
  continue;
}
```

`deriveCorrectAnswers` already returns `correct_answer` for unknown types — no change needed.

- [ ] **Step 4: Run tests — expect PASS**

Run: `deno test supabase/functions/grammar-submit/scoring.test.ts`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/grammar-submit/scoring.ts supabase/functions/grammar-submit/scoring.test.ts
git commit -m "feat(scoring): add richtig_falsch for listening exercises"
```

---

### Task 3: Listening constants + form helpers

**Files:**
- Create: `src/lib/listeningExerciseTypes.ts`
- Create: `src/lib/listeningExerciseForm.ts`
- Create: `src/lib/listeningExerciseForm.test.ts`
- Modify: `src/lib/appTypes.ts`

**Interfaces:**
- Produces:
  - `LISTENING_QUESTION_TYPES` = `["fill_in_the_blank", "multiple_choice", "richtig_falsch"] as const`
  - `ListeningQuestionType` union
  - `LISTENING_TYPE_LABELS: Record<ListeningQuestionType, string>`
  - `validateListeningExercise(form): string | null`
  - `buildListeningPayload(form): Partial<GrammarExerciseRow>`

- [ ] **Step 1: Write failing tests**

`src/lib/listeningExerciseForm.test.ts`:

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateListeningExercise, buildListeningPayload } from "./listeningExerciseForm.ts";

describe("listeningExerciseForm", () => {
  it("richtig_falsch requires prompt and answer", () => {
    const err = validateListeningExercise({
      type: "richtig_falsch",
      promptText: "",
      correctAnswer: null,
      options: [],
      blanks: [],
    });
    assert.match(err ?? "", /không được để trống/);
  });

  it("buildListeningPayload stores richtig/falsch answer", () => {
    const payload = buildListeningPayload({
      type: "richtig_falsch",
      promptText: "Lisa ist 20.",
      correctAnswer: "falsch",
      options: [],
      blanks: [],
    });
    assert.equal(payload.correct_answer, "falsch");
    assert.equal(payload.prompt_text, "Lisa ist 20.");
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `node --experimental-strip-types --test src/lib/listeningExerciseForm.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

`src/lib/listeningExerciseTypes.ts`:

```typescript
export const LISTENING_QUESTION_TYPES = [
  "fill_in_the_blank",
  "multiple_choice",
  "richtig_falsch",
] as const;

export type ListeningQuestionType = (typeof LISTENING_QUESTION_TYPES)[number];

export const LISTENING_TYPE_LABELS: Record<ListeningQuestionType, string> = {
  fill_in_the_blank: "Điền vào ô trống",
  multiple_choice: "Trắc nghiệm",
  richtig_falsch: "Richtig / Falsch",
};
```

`src/lib/listeningExerciseForm.ts` — reuse `validateForm`/`buildPayload` from `grammarExerciseForm.ts` for fill_blank + MC; add RF branch:

```typescript
export interface ListeningExerciseForm {
  type: ListeningQuestionType;
  promptText: string;
  correctAnswer: "richtig" | "falsch" | null;
  options: string[];
  blanks: BlankDefinition[];
}

export function validateListeningExercise(f: ListeningExerciseForm): string | null {
  if (f.type === "richtig_falsch") {
    if (!f.promptText.trim()) return "Nhận định không được để trống.";
    if (f.correctAnswer !== "richtig" && f.correctAnswer !== "falsch") return "Chọn đáp án Richtig hoặc Falsch.";
    return null;
  }
  // delegate fill_in_the_blank + multiple_choice to existing grammarExerciseForm helpers
  ...
}

export function buildListeningPayload(f: ListeningExerciseForm) {
  if (f.type === "richtig_falsch") {
    return {
      type: "richtig_falsch" as const,
      prompt_text: f.promptText.trim(),
      correct_answer: f.correctAnswer,
      options: null,
      blanks: null,
    };
  }
  ...
}
```

Update `GrammarExercise["type"]` in `appTypes.ts` to include `"richtig_falsch"`.

- [ ] **Step 4: Run tests + lint**

Run: `node --experimental-strip-types --test src/lib/listeningExerciseForm.test.ts && npm run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/listeningExerciseTypes.ts src/lib/listeningExerciseForm.ts src/lib/listeningExerciseForm.test.ts src/lib/appTypes.ts
git commit -m "feat: listening exercise form helpers and richtig_falsch type"
```

---

### Task 4: Answer codec for `richtig_falsch`

**Files:**
- Modify: `src/lib/grammarAnswerCodec.ts`
- Modify: `src/lib/grammarAnswerCodec.test.ts` (if exists, else create minimal test)

**Interfaces:**
- Produces: `emptyAnswer` returns `{ kind: "text", value: "" }` for RF; `serializeAnswer`/`parseAnswer` pass through `"richtig"|"falsch"` strings

- [ ] **Step 1: Write failing test**

```typescript
it("richtig_falsch round-trip", () => {
  const ex = { id: "1", type: "richtig_falsch" as const, promptText: "Test" };
  const raw = serializeAnswer(ex, { kind: "text", value: "richtig" });
  assert.equal(raw, "richtig");
  assert.deepEqual(parseAnswer(ex, "falsch"), { kind: "text", value: "falsch" });
});
```

- [ ] **Step 2: Implement**

RF uses existing text path in `serializeAnswer`/`parseAnswer` — add explicit branch in `emptyAnswer`:

```typescript
if (exercise.type === "richtig_falsch") return { kind: "text", value: "" };
```

Ensure `getParsedAnswerFor` in pages treats RF as text answer (already falls through to text path if not special-cased).

- [ ] **Step 3: Run lint + tests**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: grammar answer codec support for richtig_falsch"
```

---

### Task 5: `useExerciseSets` — general instruction

**Files:**
- Modify: `src/lib/hooks/useExerciseSets.ts`

**Interfaces:**
- Produces:
  - `ExerciseSet.generalInstruction?: string | null`
  - `updateGeneralInstruction(id: string, text: string): Promise<{ error: string | null }>`

- [ ] **Step 1: Extend interface + select**

```typescript
export interface ExerciseSet {
  ...
  generalInstruction?: string | null;
}

// in fromRow:
generalInstruction: (row as { general_instruction?: string | null }).general_instruction ?? null,

// in select:
.select("id, lesson_id, category, title, order_index, status, general_instruction")
```

- [ ] **Step 2: Add updater**

```typescript
const updateGeneralInstruction = async (id: string, text: string) => {
  const { error } = await supabase
    .from("exercise_sets")
    .update({ general_instruction: text.trim() || null })
    .eq("id", id);
  if (!error) refetch();
  return { error: error?.message ?? null };
};
```

- [ ] **Step 3: Run lint**

- [ ] **Step 4: Commit**

---

### Task 6: UI components — RF input + horizontal MC

**Files:**
- Modify: `src/components/MultipleChoiceOptions.tsx`
- Modify: `src/components/ExerciseAnswerInput.tsx`

**Interfaces:**
- Produces:
  - `MultipleChoiceOptions` accepts `layout?: "vertical" | "horizontal"` (default `"vertical"`)
  - `ExerciseAnswerInput` accepts `optionLayout?: "vertical" | "horizontal"`, `variant?: "default" | "listening"`
  - New inline block for `exercise.type === "richtig_falsch"`: statement + two pill buttons

- [ ] **Step 1: Write failing test for horizontal layout**

In `MultipleChoiceOptions.test.tsx`:

```typescript
it("horizontal layout uses flex row", () => {
  renderToStaticMarkup(
    <MultipleChoiceOptions options={["A","B","C","D"]} selectedIndex={undefined} onSelect={noop} exerciseId="e1" layout="horizontal" />
  );
  // assert class contains flex-wrap or grid-cols-4
});
```

- [ ] **Step 2: Implement MultipleChoiceOptions horizontal**

```typescript
const groupCls = layout === "horizontal"
  ? "flex flex-wrap gap-2"
  : "space-y-1.5";
```

Each option button in horizontal mode: compact, letter circle + truncated text.

- [ ] **Step 3: Add RichtigFalschInput in ExerciseAnswerInput**

```typescript
{exercise.type === "richtig_falsch" && (
  <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
    <p className="text-sm text-slate-700 flex-1">
      <span className="font-bold text-slate-400 mr-2">{letter}</span>
      {exercise.promptText}
    </p>
    <div className="flex gap-2 shrink-0">
      {(["richtig", "falsch"] as const).map((val) => (
        <button
          key={val}
          type="button"
          onClick={() => onTextAnswerChange(val)}
          className={/* pill styling like reading admin preview */}
        >
          {val === "richtig" ? "Richtig" : "Falsch"}
        </button>
      ))}
    </div>
  </div>
)}
```

Wire `textAnswer` prop (already exists) — parent stores `"richtig"` or `"falsch"`.

- [ ] **Step 4: Add ExerciseResultReview branch for RF**

Show picked value + correct answer when revealed.

- [ ] **Step 5: Run lint + component tests**

- [ ] **Step 6: Commit**

---

### Task 7: AdminListeningExerciseSection — list view

**Files:**
- Create: `src/pages/admin/AdminListeningExerciseSection.tsx` (partial — list only first)

**Interfaces:**
- Consumes: `useExerciseSets`, `useModuleOrder`, `LISTENING_QUESTION_TYPES`
- Produces: `AdminListeningExerciseSection` with lesson list + "Thêm bài tập" modal picking question type

- [ ] **Step 1: Scaffold component**

Copy structure from `AdminReadingExerciseSection` list header:

```typescript
export const AdminListeningExerciseSection: React.FC = () => {
  // state: lessons, clips, search, expanded, selectedSetId, createTypeModal
  // filter sets where category === 'nghe'
  // render AdminReadingPageHeader pattern with title "Bài tập nghe"
};
```

- [ ] **Step 2: Lesson rows**

Each lesson shows nghe sets count. Expand → list sets with status badge + click → `setSelectedSetId`.

- [ ] **Step 3: Create set flow**

Modal: pick type (3 radio) → `createSet(lessonId, "nghe", nextOrder)` → store `setQuestionType[setId] = pickedType` in local state (also infer from first exercise type when editing existing).

- [ ] **Step 4: Wire AdminQuizSection**

```typescript
{activeTab === "doc" ? <AdminReadingExerciseSection />
 : activeTab === "nghe" ? <AdminListeningExerciseSection />
 : <AdminGrammarExerciseSection category={activeTab} />}
```

- [ ] **Step 5: Run lint**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(admin): AdminListeningExerciseSection list view"
```

---

### Task 8: AdminListeningExerciseSection — set editor

**Files:**
- Modify: `src/pages/admin/AdminListeningExerciseSection.tsx`

**Interfaces:**
- Consumes: `ClipRow`, `updateGeneralInstruction`, `validateListeningExercise`, `buildListeningPayload`, DnD from `@dnd-kit`
- Produces: Set editor view with §1 audio, §2 instruction, §3 question table, sticky footer

- [ ] **Step 1: Breadcrumb bar component (inline)**

Show level, lesson title, set stats, `LessonStatusBadge`.

- [ ] **Step 2: §1 File nghe**

- Load clips for lesson via `listening_clips`
- Show assigned clip (from first exercise's `audio_clip_id` in set)
- "Thay đổi file" dropdown + upload (reuse `handleUploadClip` logic from `AdminGrammarExerciseSection`)

- [ ] **Step 3: §2 Yêu cầu chung**

- Display `set.generalInstruction`
- Edit mode → textarea → `updateGeneralInstruction(set.id, text)`

- [ ] **Step 4: §3 Question table**

Fetch exercises for set (`supabase.from("grammar_exercises").select("*").eq("set_id", setId)`).

Table columns by type:
- `#`, drag handle, checkbox, prompt, actions (edit/delete)
- RF: inline Richtig/Falsch radio for correct answer
- MC: 4 option inputs + correct radio
- Fill blank: prompt with `{{blank}}` marker helper

"+ Thêm câu" inserts row via `buildListeningPayload` + shared `group_id`.

DnD reorder → update `order_index` (copy pattern from `AdminGrammarExerciseSection.handleReorderGroups`).

- [ ] **Step 5: Sticky footer**

```typescript
<div className="sticky bottom-0 ...">
  <Button variant="secondary" onClick={() => setPreviewSetId(set.id)}><Eye /> Xem trước</Button>
  <Button variant="secondary" onClick={() => toggleSetStatus(set.id, "published", "draft")}>Lưu nháp</Button>
  <Button variant="primary" onClick={handlePublish}>Xuất bản</Button>
</div>
```

`handlePublish` validates: has audio_clip_id, ≥1 exercise, all valid → `toggleSetStatus` to published.

- [ ] **Step 6: Preview modal**

Reuse `ExerciseAnswerInput` in read-only/disabled mode inside modal (pattern from grammar preview).

- [ ] **Step 7: Run lint + manual smoke test in browser**

- [ ] **Step 8: Commit**

---

### Task 9: Remove nghe from AdminGrammarExerciseSection

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx`
- Modify: `src/pages/admin/AdminQuizSection.tsx` (verify routing)

- [ ] **Step 1: Change prop type**

```typescript
export const AdminGrammarExerciseSection: React.FC = () => {
  const category = "nguphap" as const;
```

Remove `category` prop; delete all `category === "nghe"` branches (clip upload, audio picker in modal).

- [ ] **Step 2: Fix hardcoded title**

Always `"Bài tập ngữ pháp"`.

- [ ] **Step 3: Run lint**

- [ ] **Step 4: Commit**

---

### Task 10: Learner — ExercisePageHeader + QuizSetListPage layout

**Files:**
- Modify: `src/components/ExercisePageHeader.tsx`
- Modify: `src/pages/QuizSetListPage.tsx`
- Modify: `src/pages/GrammarExercisePage.tsx` (add `richtig_falsch` to `GRAMMAR_TYPE_LABELS` if shared)

**Interfaces:**
- Consumes: `lesson.level`, `lesson.title`, `useLessonSetSummary(lesson.id, "nghe")`
- Produces: Nghe layout with vertical question list, general instruction block, relabeled footer

- [ ] **Step 1: Extend ExercisePageHeader**

```typescript
interface ExercisePageHeaderProps {
  title: string;
  subtitle?: string;
  levelBadge?: string;
  lessonTitle?: string;
  progress?: { current: number; total: number };
  onBackToLesson: () => void;
}
```

Render badge + lesson title under title; progress bar on right when `progress` provided.

- [ ] **Step 2: QuizSetListPage — nghe header**

When `category === "nghe"`:

```typescript
const { summary } = useLessonSetSummary(lesson.id, "nghe");
<ExercisePageHeader
  title="Bài tập nghe"
  levelBadge={lesson.level}
  lessonTitle={lesson.title}
  progress={summary ? { current: summary.passedCount, total: summary.totalCount } : undefined}
  onBackToLesson={onBackToLesson}
/>
```

- [ ] **Step 3: Refactor QuizExerciseSetBody layout for nghe**

Pass `isListening={category === "nghe"}` into body.

When `isListening`:
1. Audio label: `File nghe {clipIndex + 1}`
2. General instruction block from `findSet(set.id)?.generalInstruction`
3. Single column question list (`space-y-3`, no sm:grid-cols-2)
4. Pass `optionLayout="horizontal"` to ExerciseAnswerInput for MC
5. Footer: hide "Lưu" button; rename "Nộp bài" → "Kiểm tra đáp án"; add "Làm lại" left (clears form, not only after submit)

- [ ] **Step 4: Filter unsupported types on learner**

If set contains non-listening types (legacy data), show warning toast and skip rendering those exercises.

- [ ] **Step 5: Update GRAMMAR_TYPE_LABELS**

Add `richtig_falsch: "Richtig / Falsch"`.

- [ ] **Step 6: Run lint**

- [ ] **Step 7: Manual browser test**

- Create published nghe set with all 3 types
- Verify header progress, instruction block, layouts, submit flow

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(learner): listening mockup layout in QuizSetListPage"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|------------------|------|
| 3 types only for Nghe | Task 3, 7, 9, 10 |
| `general_instruction` | Task 1, 5, 8, 10 |
| `richtig_falsch` type + scoring | Task 1, 2, 3, 4, 6 |
| Admin set editor 3 sections | Task 8 |
| Admin footer actions | Task 8 |
| Learner header badge + progress | Task 10 |
| Learner vertical list + MC horizontal | Task 6, 10 |
| Keep style / no waveform | Global constraints |
| No backend split | Architecture (no task needed) |

## Self-Review

- No TBD/TODO placeholders in tasks
- Type names consistent: `richtig_falsch`, `ListeningQuestionType`, `generalInstruction`
- Each task independently testable with lint/tests
- Admin and learner can ship incrementally (Task 7 usable before Task 8 editor complete if list-only first)

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-02-listening-mockup-structure.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — implement tasks in this session with checkpoints

Which approach do you want?
