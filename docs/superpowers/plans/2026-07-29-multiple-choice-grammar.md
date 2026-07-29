# Trắc nghiệm một đáp án đúng (multiple_choice) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm dạng bài tập Ngữ pháp `multiple_choice` (trắc nghiệm một đáp án đúng, số phương án linh hoạt ≥ 2) vào bảng `grammar_exercises`, dùng chung flow chấm điểm / pass 80% / XP / explanation sẵn có.

**Architecture:** Mỗi câu hỏi là một row `grammar_exercises`, gộp thành bài bằng `group_id`. Phương án lưu ở cột mới `options JSONB` (expose ra view public); đáp án đúng lưu ở cột `correct_answer` sẵn có dưới dạng **index kiểu chuỗi** (`"0"`, `"1"`, …), chỉ server đọc. Logic thuần (nhãn A/B/C, thao tác thêm/xóa/kéo thả phương án, validate) tách ra `src/lib/grammarMultipleChoice.ts` để test bằng `node:test`, đúng pattern `grammarFillInBlank.ts`.

**Tech Stack:** React 19 + TypeScript 5.8 + Vite 6, Tailwind v4, Supabase (PostgREST + Edge Function Deno), @dnd-kit (đã có sẵn), test bằng `node:test` chạy qua `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-07-29-multiple-choice-grammar-design.md`

## Global Constraints

- Code (biến/hàm/type) bằng **English**; nội dung hiển thị cho user bằng **Tiếng Việt**.
- Không dùng `any`; dùng type cụ thể hoặc `unknown`.
- Named exports (không default export).
- **Không thêm npm package mới.**
- Không dùng `window.alert()` / `window.confirm()` — dùng `showToast()`.
- Không sửa tay `src/lib/database.types.ts` — regenerate.
- `correct_answer` **không bao giờ** xuất hiện trong view public / payload trả về client.
- Không refactor ngoài scope; không đụng hệ `quiz_questions` cũ.
- Type check: `npm run lint` (tức `tsc --noEmit`) phải sạch.
- Chạy test: `npx tsx --test <đường dẫn file test>`.
- **Ràng buộc test quan trọng:** test chạy bằng `node:test` **không được import** module nào kéo theo `src/lib/supabase.ts` (file đó đọc `import.meta.env`, ngoài Vite sẽ throw). Vì vậy logic cần test phải nằm ở module thuần (`src/lib/*.ts`) hoặc component không import supabase (`src/components/*.tsx`) — đúng pattern các test hiện có.
- Giá trị type mới, viết chính xác: `multiple_choice`. Nhãn tiếng Việt: `Trắc nghiệm`.
- Commit message tiếng Việt/Anh ngắn gọn, kết thúc bằng:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

---

### Task 1: Migration DB + regenerate types

**Files:**
- Create: `supabase/migrations/20260729000001_grammar_multiple_choice.sql`
- Modify: `src/lib/database.types.ts` (regenerate, không sửa tay)

**Interfaces:**
- Consumes: bảng `grammar_exercises`, view `grammar_exercises_public` hiện có.
- Produces: cột `grammar_exercises.options JSONB`; giá trị `'multiple_choice'` hợp lệ cho `grammar_exercises.type`; view `grammar_exercises_public` có thêm cột `options`.

- [ ] **Step 1: Viết migration**

Tạo `supabase/migrations/20260729000001_grammar_multiple_choice.sql`:

```sql
-- =============================================================================
-- DeutschPath — grammar_exercises: dạng thứ 8 `multiple_choice`
-- Trắc nghiệm một đáp án đúng, số phương án linh hoạt (>= 2).
-- options JSONB = mảng chuỗi theo thứ tự hiển thị (nhãn A/B/C sinh ở client).
-- Đáp án đúng dùng lại cột correct_answer, lưu index dạng chuỗi ("0", "1", ...).
-- =============================================================================

ALTER TABLE grammar_exercises
  DROP CONSTRAINT grammar_exercises_type_check,
  ADD CONSTRAINT grammar_exercises_type_check CHECK (type IN (
    'word_reorder',
    'error_correction',
    'translation',
    'sentence_transformation',
    'guided_sentence_writing',
    'classification',
    'fill_in_the_blank',
    'multiple_choice'
  )),
  ADD COLUMN options JSONB,
  ADD CONSTRAINT grammar_exercises_options_shape
    CHECK (
      options IS NULL
      OR (
        jsonb_typeof(options) = 'array'
        AND jsonb_array_length(options) >= 2
      )
    );

DROP VIEW IF EXISTS grammar_exercises_public;

CREATE VIEW grammar_exercises_public AS
  SELECT
    g.id,
    g.lesson_id,
    g.type,
    g.group_id,
    g.hint,
    g.prompt_text,
    g.transformation_hint,
    g.tokens,
    g.classification_groups,
    (
      SELECT jsonb_agg(elem ->> 'item')
      FROM jsonb_array_elements(g.classification_items) elem
    ) AS classification_items,
    g.word_bank,
    g.options,
    g.explanation,
    g.order_index
  FROM grammar_exercises g
  JOIN lessons l ON l.id = g.lesson_id
  WHERE g.status = 'published'
    AND (l.status = 'published' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

GRANT SELECT ON grammar_exercises_public TO authenticated;
```

- [ ] **Step 2: Xin xác nhận của user trước khi apply lên Supabase**

Migration này chạy trên project production (`awdhqlgxnjwymwgxltlw`). **Dừng lại và hỏi user** trước khi apply. Không tự ý chạy.

- [ ] **Step 3: Apply migration**

Sau khi user đồng ý, apply bằng Supabase MCP tool `apply_migration` (name: `grammar_multiple_choice`, query: nội dung file trên), hoặc `npx supabase db push` nếu user muốn dùng CLI.

- [ ] **Step 4: Regenerate database types**

Dùng Supabase MCP tool `generate_typescript_types` và ghi kết quả đè lên `src/lib/database.types.ts`.
Kiểm tra file mới có `options: Json | null` trong `grammar_exercises` Row/Insert/Update và trong view `grammar_exercises_public`.

Run: `npm run lint`
Expected: PASS (không lỗi type).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260729000001_grammar_multiple_choice.sql src/lib/database.types.ts
git commit -m "feat(db): add multiple_choice grammar exercise type and options column

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Thư viện logic thuần `grammarMultipleChoice.ts`

**Files:**
- Create: `src/lib/grammarMultipleChoice.ts`
- Test: `src/lib/grammarMultipleChoice.test.ts`

**Interfaces:**
- Consumes: không có (module thuần, không import gì).
- Produces:
  - `MIN_MULTIPLE_CHOICE_OPTIONS: number` (= 2)
  - `interface ChoiceForm { options: string[]; correctIndex: number }`
  - `optionLabel(index: number): string`
  - `addOption(form: ChoiceForm): ChoiceForm`
  - `setOption(form: ChoiceForm, index: number, value: string): ChoiceForm`
  - `removeOption(form: ChoiceForm, index: number): ChoiceForm`
  - `moveOption(form: ChoiceForm, from: number, to: number): ChoiceForm`
  - `normalizeOptions(options: string[]): string[] | null`
  - `validateChoiceForm(promptText: string, form: ChoiceForm): string | null`
  - `parseCorrectIndex(correctAnswer: string | null, optionCount: number): number`
  - `createEmptyChoiceForm(): ChoiceForm`
  - `buildMultipleChoicePayload(form: ChoiceForm): { options: string[] | null; correct_answer: string }`

- [ ] **Step 1: Viết test thất bại**

Tạo `src/lib/grammarMultipleChoice.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  addOption,
  buildMultipleChoicePayload,
  createEmptyChoiceForm,
  moveOption,
  normalizeOptions,
  optionLabel,
  parseCorrectIndex,
  removeOption,
  setOption,
  validateChoiceForm,
  type ChoiceForm,
} from "./grammarMultipleChoice";

const form = (options: string[], correctIndex: number): ChoiceForm => ({ options, correctIndex });

test("optionLabel sinh nhãn A/B/C/D theo index", () => {
  assert.equal(optionLabel(0), "A");
  assert.equal(optionLabel(1), "B");
  assert.equal(optionLabel(3), "D");
  assert.equal(optionLabel(25), "Z");
});

test("optionLabel vượt quá Z rơi về số thứ tự", () => {
  assert.equal(optionLabel(26), "27");
});

test("createEmptyChoiceForm tạo 3 phương án trống, chưa chọn đáp án đúng", () => {
  assert.deepEqual(createEmptyChoiceForm(), { options: ["", "", ""], correctIndex: -1 });
});

test("addOption thêm một phương án trống, giữ nguyên đáp án đúng", () => {
  assert.deepEqual(addOption(form(["der", "die"], 1)), { options: ["der", "die", ""], correctIndex: 1 });
});

test("setOption chỉ đổi nội dung phương án tại index", () => {
  assert.deepEqual(setOption(form(["der", "die"], 0), 1, "das"), { options: ["der", "das"], correctIndex: 0 });
});

test("removeOption phía trước đáp án đúng làm index dịch lên", () => {
  assert.deepEqual(removeOption(form(["der", "die", "das"], 2), 0), { options: ["die", "das"], correctIndex: 1 });
});

test("removeOption phía sau đáp án đúng giữ nguyên index", () => {
  assert.deepEqual(removeOption(form(["der", "die", "das"], 0), 2), { options: ["der", "die"], correctIndex: 0 });
});

test("removeOption chính đáp án đúng buộc chọn lại", () => {
  assert.deepEqual(removeOption(form(["der", "die", "das"], 1), 1), { options: ["der", "das"], correctIndex: -1 });
});

test("moveOption kéo thả giữ đáp án đúng bám đúng phương án", () => {
  assert.deepEqual(moveOption(form(["der", "die", "das"], 2), 2, 0), { options: ["das", "der", "die"], correctIndex: 0 });
  assert.deepEqual(moveOption(form(["der", "die", "das"], 0), 0, 2), { options: ["die", "das", "der"], correctIndex: 2 });
  assert.deepEqual(moveOption(form(["der", "die", "das"], 1), 0, 2), { options: ["die", "das", "der"], correctIndex: 0 });
});

test("moveOption với index ngoài biên trả về form không đổi", () => {
  const original = form(["der", "die"], 0);
  assert.deepEqual(moveOption(original, -1, 1), original);
  assert.deepEqual(moveOption(original, 0, 5), original);
});

test("normalizeOptions trim và trả null khi không hợp lệ", () => {
  assert.deepEqual(normalizeOptions([" der ", "die"]), ["der", "die"]);
  assert.equal(normalizeOptions(["der"]), null);
  assert.equal(normalizeOptions(["der", "   "]), null);
});

test("validateChoiceForm báo lỗi tiếng Việt cho từng trường hợp", () => {
  assert.equal(validateChoiceForm("Das ist ___ Computer.", form(["der", "die"], 0)), null);
  assert.equal(validateChoiceForm("   ", form(["der", "die"], 0)), "Nội dung câu hỏi không được để trống.");
  assert.equal(validateChoiceForm("Câu hỏi", form(["der"], 0)), "Cần ít nhất 2 phương án.");
  assert.equal(validateChoiceForm("Câu hỏi", form(["der", " "], 0)), "Cần ít nhất 2 phương án.");
  assert.equal(validateChoiceForm("Câu hỏi", form(["der", "die"], -1)), "Cần chọn đúng một đáp án đúng.");
  assert.equal(validateChoiceForm("Câu hỏi", form(["der", "die"], 5)), "Cần chọn đúng một đáp án đúng.");
});

test("parseCorrectIndex đọc index hợp lệ và loại bỏ giá trị hỏng", () => {
  assert.equal(parseCorrectIndex("2", 3), 2);
  assert.equal(parseCorrectIndex(" 1 ", 3), 1);
  assert.equal(parseCorrectIndex(null, 3), -1);
  assert.equal(parseCorrectIndex("", 3), -1);
  assert.equal(parseCorrectIndex("abc", 3), -1);
  assert.equal(parseCorrectIndex("-1", 3), -1);
  assert.equal(parseCorrectIndex("3", 3), -1);
  assert.equal(parseCorrectIndex("1.5", 3), -1);
});

test("buildMultipleChoicePayload trả options đã trim và correct_answer là index", () => {
  assert.deepEqual(buildMultipleChoicePayload(form([" der ", "die", "das"], 2)), {
    options: ["der", "die", "das"],
    correct_answer: "2",
  });
});

test("buildMultipleChoicePayload trả options null khi dữ liệu không hợp lệ", () => {
  assert.deepEqual(buildMultipleChoicePayload(form(["der"], 0)), { options: null, correct_answer: "0" });
  assert.deepEqual(buildMultipleChoicePayload(form(["der", " "], 0)), { options: null, correct_answer: "0" });
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó fail**

Run: `npx tsx --test src/lib/grammarMultipleChoice.test.ts`
Expected: FAIL — không import được module `./grammarMultipleChoice`.

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `src/lib/grammarMultipleChoice.ts`:

```ts
export const MIN_MULTIPLE_CHOICE_OPTIONS = 2;

export interface ChoiceForm {
  options: string[];
  correctIndex: number;
}

export const optionLabel = (index: number): string =>
  index >= 0 && index < 26 ? String.fromCharCode(65 + index) : String(index + 1);

export const createEmptyChoiceForm = (): ChoiceForm => ({ options: ["", "", ""], correctIndex: -1 });

export const addOption = (form: ChoiceForm): ChoiceForm => ({
  ...form,
  options: [...form.options, ""],
});

export const setOption = (form: ChoiceForm, index: number, value: string): ChoiceForm => ({
  ...form,
  options: form.options.map((option, i) => (i === index ? value : option)),
});

export function removeOption(form: ChoiceForm, index: number): ChoiceForm {
  if (index < 0 || index >= form.options.length) return form;
  const correctIndex = form.correctIndex === index
    ? -1
    : form.correctIndex > index
      ? form.correctIndex - 1
      : form.correctIndex;
  return { options: form.options.filter((_, i) => i !== index), correctIndex };
}

export function moveOption(form: ChoiceForm, from: number, to: number): ChoiceForm {
  const { options, correctIndex } = form;
  if (from < 0 || to < 0 || from >= options.length || to >= options.length || from === to) return form;
  const next = [...options];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  let nextCorrect = correctIndex;
  if (correctIndex === from) nextCorrect = to;
  else if (correctIndex > from && correctIndex <= to) nextCorrect = correctIndex - 1;
  else if (correctIndex < from && correctIndex >= to) nextCorrect = correctIndex + 1;
  return { options: next, correctIndex: nextCorrect };
}

export function normalizeOptions(options: string[]): string[] | null {
  const normalized = options.map((option) => option.trim());
  if (normalized.length < MIN_MULTIPLE_CHOICE_OPTIONS) return null;
  if (normalized.some((option) => option.length === 0)) return null;
  return normalized;
}

export function validateChoiceForm(promptText: string, form: ChoiceForm): string | null {
  if (!promptText.trim()) return "Nội dung câu hỏi không được để trống.";
  const normalized = normalizeOptions(form.options);
  if (!normalized) return "Cần ít nhất 2 phương án.";
  if (form.correctIndex < 0 || form.correctIndex >= normalized.length) {
    return "Cần chọn đúng một đáp án đúng.";
  }
  return null;
}

export function parseCorrectIndex(correctAnswer: string | null, optionCount: number): number {
  const raw = (correctAnswer ?? "").trim();
  if (!/^\d+$/.test(raw)) return -1;
  const index = Number(raw);
  return index < optionCount ? index : -1;
}

export function buildMultipleChoicePayload(form: ChoiceForm): {
  options: string[] | null;
  correct_answer: string;
} {
  return { options: normalizeOptions(form.options), correct_answer: String(form.correctIndex) };
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx tsx --test src/lib/grammarMultipleChoice.test.ts`
Expected: PASS, tất cả test.

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/grammarMultipleChoice.ts src/lib/grammarMultipleChoice.test.ts
git commit -m "feat: add pure helpers for multiple choice grammar options

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Chấm điểm trong Edge Function

**Files:**
- Modify: `supabase/functions/grammar-submit/scoring.ts`
- Modify: `supabase/functions/grammar-submit/index.ts` (thêm `options` vào select nếu đang liệt kê cột)
- Test: `supabase/functions/grammar-submit/scoring.test.ts`

**Interfaces:**
- Consumes: `computeGrammarScore(exercises, answers)` và `ScorableGrammarExercise` hiện có.
- Produces:
  - `ScorableGrammarExercise` thêm `options: string[] | null`
  - `ScoreResult` thêm `choiceResults: Record<string, boolean>`
  - Answer format của `multiple_choice`: `answers[exerciseId] = String(selectedIndex)`

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `supabase/functions/grammar-submit/scoring.test.ts`:

```ts
const choice = (over: Partial<ScorableGrammarExercise> = {}): ScorableGrammarExercise => ({
  id: "c1",
  type: "multiple_choice",
  correct_answer: "1",
  acceptable_answers: null,
  classification_items: null,
  blanks: null,
  options: ["der", "die", "das"],
  ...over,
});

test("multiple_choice: chọn đúng index được tính điểm", () => {
  const r = computeGrammarScore([choice()], { c1: "1" });
  assert.equal(r.correct, 1);
  assert.equal(r.total, 1);
  assert.deepEqual(r.choiceResults, { c1: true });
});

test("multiple_choice: chọn sai index không được điểm", () => {
  const r = computeGrammarScore([choice()], { c1: "0" });
  assert.equal(r.correct, 0);
  assert.equal(r.total, 1);
  assert.deepEqual(r.choiceResults, { c1: false });
});

test("multiple_choice: đáp án rỗng, chữ, số âm hoặc ngoài biên đều sai", () => {
  for (const answer of ["", "abc", "-1", "3", "1.0", " "]) {
    const r = computeGrammarScore([choice()], { c1: answer });
    assert.equal(r.correct, 0, `answer=${answer}`);
    assert.deepEqual(r.choiceResults, { c1: false }, `answer=${answer}`);
  }
});

test("multiple_choice: thiếu đáp án trong payload vẫn tính total", () => {
  const r = computeGrammarScore([choice()], {});
  assert.equal(r.correct, 0);
  assert.equal(r.total, 1);
  assert.deepEqual(r.choiceResults, { c1: false });
});

test("multiple_choice: options null hoặc correct_answer hỏng đều sai, không crash", () => {
  assert.deepEqual(computeGrammarScore([choice({ options: null })], { c1: "1" }).choiceResults, { c1: false });
  assert.deepEqual(computeGrammarScore([choice({ correct_answer: null })], { c1: "1" }).choiceResults, { c1: false });
  assert.deepEqual(computeGrammarScore([choice({ correct_answer: "x" })], { c1: "1" }).choiceResults, { c1: false });
});

test("multiple_choice: cộng dồn đúng khi trộn với dạng khác", () => {
  const r = computeGrammarScore(
    [choice({ id: "c1" }), choice({ id: "c2", correct_answer: "0" }), translation({ id: "t9" })],
    { c1: "1", c2: "2", t9: "Ich lerne Deutsch" },
  );
  assert.equal(r.total, 3);
  assert.equal(r.correct, 2);
  assert.equal(r.score, 67);
  assert.deepEqual(r.choiceResults, { c1: true, c2: false });
});
```

Lưu ý: các helper `translation()` sẵn có trong file phải được cập nhật thêm `options: null` (cùng với mọi factory khác trong file) để khớp type mới.

- [ ] **Step 2: Chạy test để chắc chắn nó fail**

Run: `npx tsx --test supabase/functions/grammar-submit/scoring.test.ts`
Expected: FAIL — `choiceResults` undefined / type `options` không tồn tại.

- [ ] **Step 3: Viết implementation tối thiểu**

Trong `supabase/functions/grammar-submit/scoring.ts`:

1. Thêm field vào interface:

```ts
export interface ScorableGrammarExercise {
  id: string;
  type: string;
  correct_answer: string | null;
  acceptable_answers: string[] | null;
  classification_items: { item: string; group: string }[] | null;
  blanks: { acceptedAnswers: string[] }[] | null;
  options: string[] | null;
}

export interface ScoreResult {
  correct: number;
  total: number;
  score: number;
  blankResults: Record<string, boolean[]>;
  choiceResults: Record<string, boolean>;
}
```

2. Thêm helper trên `computeGrammarScore`:

```ts
function isChoiceCorrect(ex: ScorableGrammarExercise, rawAnswer: string): boolean {
  const options = Array.isArray(ex.options) ? ex.options : [];
  const answer = (rawAnswer ?? "").trim();
  const expected = (ex.correct_answer ?? "").trim();
  if (options.length === 0) return false;
  if (!/^\d+$/.test(answer) || !/^\d+$/.test(expected)) return false;
  const answerIndex = Number(answer);
  const expectedIndex = Number(expected);
  if (answerIndex >= options.length || expectedIndex >= options.length) return false;
  return answerIndex === expectedIndex;
}
```

3. Khai báo `const choiceResults: Record<string, boolean> = {};` cạnh `blankResults`, thêm nhánh ngay trước nhánh `classification`:

```ts
    if (ex.type === "multiple_choice") {
      const isCorrect = isChoiceCorrect(ex, answers[ex.id] ?? "");
      choiceResults[ex.id] = isCorrect;
      total += 1;
      if (isCorrect) correct++;
      continue;
    }
```

4. Trả về thêm field:

```ts
  return { correct, total, score, blankResults, choiceResults };
```

5. Trong `supabase/functions/grammar-submit/index.ts`: nếu query đang liệt kê cột cụ thể thì thêm `options`; nếu đang `select("*")` thì giữ nguyên. Kiểm tra bằng cách đọc file trước khi sửa.

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx tsx --test supabase/functions/grammar-submit/scoring.test.ts`
Expected: PASS toàn bộ (gồm cả các test cũ của translation / classification / fill_in_the_blank).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/grammar-submit
git commit -m "feat(grammar-submit): score multiple_choice exercises by option index

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: App types + hook đọc `options`

**Files:**
- Modify: `src/lib/appTypes.ts` (interface `GrammarExercise`)
- Modify: `src/lib/hooks/useGrammarExercises.ts`

**Interfaces:**
- Consumes: view `grammar_exercises_public` có cột `options` (Task 1).
- Produces: `GrammarExercise.type` có thêm `"multiple_choice"`; `GrammarExercise.options?: string[]` (mảng nội dung phương án, đúng thứ tự hiển thị). Client **không** có đáp án đúng.

- [ ] **Step 1: Sửa `src/lib/appTypes.ts`**

Trong interface `GrammarExercise`, thêm `"multiple_choice"` vào union `type` (sau `"fill_in_the_blank"`), và thêm field:

```ts
  options?: string[];
```

đặt ngay dưới `wordBank?: ...`.

- [ ] **Step 2: Sửa `src/lib/hooks/useGrammarExercises.ts`**

Thêm `options` vào chuỗi select (sau `word_bank`):

```ts
      .select("id, lesson_id, type, group_id, hint, prompt_text, transformation_hint, tokens, classification_groups, classification_items, word_bank, options, explanation, order_index")
```

và thêm vào phần map, ngay dưới dòng `wordBank`:

```ts
              options: (e.options as string[] | null) ?? undefined,
```

- [ ] **Step 3: Type check**

Run: `npm run lint`
Expected: PASS. Nếu `GRAMMAR_TYPE_LABELS` / `TYPE_LABELS` báo thiếu key `multiple_choice`, **để nguyên lỗi đó** — Task 5 và Task 6 sẽ xử lý. Nếu muốn commit sạch, làm Task 4 + 5 liền nhau rồi commit chung.

- [ ] **Step 4: Commit**

```bash
git add src/lib/appTypes.ts src/lib/hooks/useGrammarExercises.ts
git commit -m "feat: expose multiple_choice options to the learner client

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: UI học viên — chọn đáp án và xem kết quả

**Files:**
- Create: `src/components/MultipleChoiceOptions.tsx`
- Test: `src/components/MultipleChoiceOptions.test.tsx`
- Modify: `src/pages/GrammarExercisePage.tsx`

**Interfaces:**
- Consumes: `GrammarExercise.options` (Task 4), `optionLabel` từ `src/lib/grammarMultipleChoice` (Task 2), `choiceResults` trong response `grammar-submit` (Task 3).
- Produces: component `MultipleChoiceOptions` export từ `src/components/MultipleChoiceOptions.tsx` (**không** import supabase — để test được bằng `node:test`) với props:
  ```ts
  {
    options: string[];
    selectedIndex: number | undefined;
    onSelect: (index: number) => void;
    exerciseId: string;
    result?: boolean;
  }
  ```

- [ ] **Step 1: Viết test thất bại**

Tạo `src/components/MultipleChoiceOptions.test.tsx`:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MultipleChoiceOptions } from "./MultipleChoiceOptions";

const noop = () => {};

test("render đủ số phương án với nhãn A/B theo thứ tự", () => {
  const html = renderToStaticMarkup(
    <MultipleChoiceOptions options={["der", "die"]} selectedIndex={undefined} onSelect={noop} exerciseId="e1" />,
  );
  assert.match(html, />A</);
  assert.match(html, />B</);
  assert.doesNotMatch(html, />C</);
  assert.match(html, />der</);
  assert.match(html, />die</);
});

test("render 4 phương án thì có nhãn tới D", () => {
  const html = renderToStaticMarkup(
    <MultipleChoiceOptions options={["a", "b", "c", "d"]} selectedIndex={undefined} onSelect={noop} exerciseId="e1" />,
  );
  assert.match(html, />D</);
});

test("chỉ phương án đang chọn được đánh dấu aria-checked", () => {
  const html = renderToStaticMarkup(
    <MultipleChoiceOptions options={["der", "die", "das"]} selectedIndex={1} onSelect={noop} exerciseId="e1" />,
  );
  assert.equal(html.match(/aria-checked="true"/g)?.length, 1);
  assert.equal(html.match(/aria-checked="false"/g)?.length, 2);
});

test("sau khi nộp, đáp án đã chọn được tô xanh khi đúng và đỏ khi sai", () => {
  const correct = renderToStaticMarkup(
    <MultipleChoiceOptions options={["der", "die"]} selectedIndex={0} onSelect={noop} exerciseId="e1" result={true} />,
  );
  assert.match(correct, /border-green-400/);
  const wrong = renderToStaticMarkup(
    <MultipleChoiceOptions options={["der", "die"]} selectedIndex={0} onSelect={noop} exerciseId="e1" result={false} />,
  );
  assert.match(wrong, /border-red-400/);
  assert.doesNotMatch(wrong, /border-green-400/);
});

test("không tiết lộ đáp án đúng: phương án không được chọn giữ style trung tính", () => {
  const html = renderToStaticMarkup(
    <MultipleChoiceOptions options={["der", "die"]} selectedIndex={0} onSelect={noop} exerciseId="e1" result={false} />,
  );
  assert.equal(html.match(/border-red-400/g)?.length, 1);
});
```

- [ ] **Step 2: Chạy test để chắc chắn nó fail**

Run: `npx tsx --test src/components/MultipleChoiceOptions.test.tsx`
Expected: FAIL — module `./MultipleChoiceOptions` không tồn tại.

- [ ] **Step 3a: Tạo component `src/components/MultipleChoiceOptions.tsx`**

File này chỉ import `react` và `../lib/grammarMultipleChoice` — **không** import supabase, không import từ `pages/`.

- [ ] **Step 3b: Nối vào `src/pages/GrammarExercisePage.tsx`**

1. Import:

```ts
import { MultipleChoiceOptions } from "../components/MultipleChoiceOptions";
```

2. Thêm entry cho type mới:

```ts
  multiple_choice: "Trắc nghiệm",
```
vào `GRAMMAR_TYPE_LABELS`, và

```ts
  multiple_choice: "Chọn một đáp án đúng cho mỗi câu:",
```
vào `GRAMMAR_TYPE_INSTRUCTIONS`.

3. Nội dung `src/components/MultipleChoiceOptions.tsx` (viết ở Step 3a):

```tsx
import React from "react";
import { optionLabel } from "../lib/grammarMultipleChoice";

export const MultipleChoiceOptions: React.FC<{
  options: string[];
  selectedIndex: number | undefined;
  onSelect: (index: number) => void;
  exerciseId: string;
  result?: boolean;
}> = ({ options, selectedIndex, onSelect, exerciseId, result }) => (
  <div role="radiogroup" className="space-y-1.5">
    {options.map((option, index) => {
      const selected = selectedIndex === index;
      const stateCls = selected
        ? result === true
          ? "border-green-400 bg-green-50 text-green-800"
          : result === false
            ? "border-red-400 bg-red-50 text-red-800"
            : "border-orange-300 bg-orange-50 text-orange-700"
        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
      return (
        <button
          key={`${exerciseId}:${index}`}
          type="button"
          role="radio"
          aria-checked={selected}
          onClick={() => onSelect(index)}
          className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition-colors ${stateCls}`}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[10px] font-display font-bold">
            {optionLabel(index)}
          </span>
          <span className="whitespace-pre-wrap">{option}</span>
        </button>
      );
    })}
  </div>
);
```

4. Trong `ExerciseCard`, thêm props `selectedChoice: number | undefined`, `onSelectChoice: (index: number) => void`, `choiceResult?: boolean` (thêm vào type props và destructuring), rồi thêm nhánh render sau nhánh `fill_in_the_blank`:

```tsx
      {exercise.type === "multiple_choice" && (
        <>
          <p className="text-xs bg-slate-50 text-slate-700 rounded-lg px-2.5 py-2">
            <span className="font-bold text-slate-400">{letter}</span> {exercise.promptText}
          </p>
          <MultipleChoiceOptions
            options={exercise.options ?? []}
            selectedIndex={selectedChoice}
            onSelect={onSelectChoice}
            exerciseId={exercise.id}
            result={choiceResult}
          />
        </>
      )}
```

5. Trong `GrammarExercisePage`:
   - state mới: `const [choiceByExercise, setChoiceByExercise] = useState<Record<string, number>>({});`
   - interface `GrammarResult` thêm `choiceResults: Record<string, boolean>;`
   - trong `getAnswerStringFor`, thêm trước dòng `return (textAnswerByExercise...)`:

```ts
    if (exercise.type === "multiple_choice") {
      const selected = choiceByExercise[exercise.id];
      return selected === undefined ? "" : String(selected);
    }
```
   - truyền xuống `ExerciseCard` tại chỗ render (cùng chỗ đang truyền `blankAnswers`):

```tsx
                        selectedChoice={choiceByExercise[exercise.id]}
                        onSelectChoice={(index) =>
                          setChoiceByExercise((prev) => ({ ...prev, [exercise.id]: index }))
                        }
                        choiceResult={result?.choiceResults?.[exercise.id]}
```
   - trong `handleRetry`, thêm `setChoiceByExercise({});`

6. Trong màn kết quả (block `if (result)`), thêm ngay sau block render `fill_in_the_blank`:

```tsx
                    {ex.type === "multiple_choice" && (
                      <div className="mb-2">
                        <MultipleChoiceOptions
                          options={ex.options ?? []}
                          selectedIndex={choiceByExercise[ex.id]}
                          onSelect={() => {}}
                          exerciseId={ex.id}
                          result={result.choiceResults?.[ex.id]}
                        />
                      </div>
                    )}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `npx tsx --test src/components/MultipleChoiceOptions.test.tsx`
Expected: PASS.

Run: `npm run lint`
Expected: PASS (sau khi Task 6 xong nếu admin còn thiếu key; nếu làm tuần tự, lỗi duy nhất còn lại được phép là `TYPE_LABELS`/`TYPE_COLORS` trong admin thiếu `multiple_choice`).

- [ ] **Step 5: Commit**

```bash
git add src/components/MultipleChoiceOptions.tsx src/components/MultipleChoiceOptions.test.tsx src/pages/GrammarExercisePage.tsx
git commit -m "feat: learner UI for multiple choice grammar exercises

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: UI Admin — soạn thảo, kéo thả, validate, preview

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx`

**Interfaces:**
- Consumes: `addOption`, `removeOption`, `moveOption`, `setOption`, `buildMultipleChoicePayload`, `validateChoiceForm`, `parseCorrectIndex`, `optionLabel`, `createEmptyChoiceForm` từ `src/lib/grammarMultipleChoice` (Task 2); cột `options` (Task 1).
- Produces: `EditForm` thêm `options: string[]` và `correct_option_index: number`; `buildPayload` xuất `options` + `correct_answer = String(correct_option_index)`.

**Không tạo file test cho task này:** `AdminGrammarExerciseSection.tsx` import `src/lib/supabase.ts` nên không import được trong `node:test`. Toàn bộ logic thuần (validate, thêm/xóa/kéo thả phương án, build payload) đã có test ở Task 2; task này chỉ nối UI vào các helper đó và được verify bằng `npm run lint` + browser ở Task 7. **Không** viết logic tính toán mới trực tiếp trong file admin — nếu cần thêm logic, thêm vào `src/lib/grammarMultipleChoice.ts` kèm test.

- [ ] **Step 1: Viết implementation**

Trong `src/pages/admin/AdminGrammarExerciseSection.tsx`:

1. Import helper:

```ts
import {
  addOption,
  buildMultipleChoicePayload,
  createEmptyChoiceForm,
  moveOption,
  optionLabel,
  parseCorrectIndex,
  removeOption,
  setOption,
  validateChoiceForm,
} from "../../lib/grammarMultipleChoice";
```

2. Thêm `"multiple_choice"` vào union `GrammarExercise["type"]` (interface local ở đầu file) và thêm field `options: string[] | null;` vào interface đó.

3. Thêm nhãn + màu:

```ts
  multiple_choice: "Trắc nghiệm",           // TYPE_LABELS
  multiple_choice: "bg-indigo-50 text-indigo-700", // TYPE_COLORS
```

4. `EditForm`: thêm `options: string[];` và `correct_option_index: number;`. `EMPTY_FORM`: thêm `options: createEmptyChoiceForm().options,` và `correct_option_index: -1,`.

5. `validateForm` — thêm nhánh trước nhánh `fill_in_the_blank`:

```ts
  if (f.type === "multiple_choice") {
    return validateChoiceForm(f.prompt_text, { options: f.options, correctIndex: f.correct_option_index });
  }
```

6. `buildPayload` — sửa `correct_answer`, thêm `options`, dùng helper đã test:

```ts
const buildPayload = (form: EditForm) => {
  const choicePayload = buildMultipleChoicePayload({
    options: form.options,
    correctIndex: form.correct_option_index,
  });
  return {
    // ...các field hiện có giữ nguyên...
    correct_answer:
      form.type === "classification" || form.type === "fill_in_the_blank"
        ? null
        : form.type === "multiple_choice"
          ? choicePayload.correct_answer
          : form.correct_answer,
    options: form.type === "multiple_choice" ? choicePayload.options : null,
    // ...
  };
};
```

7. `openEdit`: thêm vào object entry:

```ts
        options: ex.options ?? [],
        correct_option_index: parseCorrectIndex(ex.correct_answer, (ex.options ?? []).length),
```

8. `ExerciseEntryFields`: thêm nhánh render cho type mới (đặt trước nhánh `classification`). Dùng dnd-kit sortable — thêm component sortable riêng ở scope module, phía trên `ExerciseEntryFields`:

```tsx
const SortableOptionRow: React.FC<{
  id: string;
  index: number;
  value: string;
  checked: boolean;
  onChangeValue: (value: string) => void;
  onSelectCorrect: () => void;
  onRemove: () => void;
}> = ({ id, index, value, checked, onChangeValue, onSelectCorrect, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-xl border border-slate-100 bg-white p-2 ${isDragging ? "z-10 opacity-60 shadow-lg" : ""}`}
    >
      <button type="button" className="cursor-grab p-1 text-slate-300 hover:text-slate-500" {...attributes} {...listeners} aria-label={`Kéo phương án ${optionLabel(index)}`}>
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-5 shrink-0 text-center text-xs font-display font-bold text-slate-400">{optionLabel(index)}</span>
      <input
        type="radio"
        checked={checked}
        onChange={onSelectCorrect}
        className="h-4 w-4 accent-orange-500"
        aria-label={`Đáp án đúng là phương án ${optionLabel(index)}`}
      />
      <input
        type="text"
        value={value}
        onChange={(event) => onChangeValue(event.target.value)}
        className={inputCls + " flex-1"}
        placeholder={`Phương án ${optionLabel(index)}`}
      />
      <button
        type="button"
        onClick={onRemove}
        className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-400"
        aria-label={`Xóa phương án ${optionLabel(index)}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
```

Nhánh render trong `ExerciseEntryFields`:

```tsx
    {entry.type === "multiple_choice" && (
      <>
        <div>
          <label className={labelCls}>Nội dung câu hỏi *</label>
          <textarea
            rows={2}
            value={entry.prompt_text}
            onChange={(event) => onChange((prev) => ({ ...prev, prompt_text: event.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Das ist ___ Computer."
          />
        </div>
        <div>
          <label className={labelCls}>Phương án * (chọn radio để đánh dấu đáp án đúng)</label>
          <p className="mb-1.5 text-[11px] text-slate-400">Tối thiểu 2 phương án. Kéo để đổi thứ tự; nhãn A/B/C tự sinh theo vị trí.</p>
          <DndContext
            sensors={optionSensors}
            collisionDetection={closestCenter}
            onDragEnd={(event: DragEndEvent) => {
              const { active, over } = event;
              if (!over || active.id === over.id) return;
              onChange((prev) => {
                const from = prev.options.findIndex((_, i) => `option-${i}` === active.id);
                const to = prev.options.findIndex((_, i) => `option-${i}` === over.id);
                const moved = moveOption({ options: prev.options, correctIndex: prev.correct_option_index }, from, to);
                return { ...prev, options: moved.options, correct_option_index: moved.correctIndex };
              });
            }}
          >
            <SortableContext items={entry.options.map((_, i) => `option-${i}`)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {entry.options.map((option, index) => (
                  <SortableOptionRow
                    key={`option-${index}`}
                    id={`option-${index}`}
                    index={index}
                    value={option}
                    checked={entry.correct_option_index === index}
                    onChangeValue={(value) => onChange((prev) => ({
                      ...prev,
                      options: setOption({ options: prev.options, correctIndex: prev.correct_option_index }, index, value).options,
                    }))}
                    onSelectCorrect={() => onChange((prev) => ({ ...prev, correct_option_index: index }))}
                    onRemove={() => onChange((prev) => {
                      const next = removeOption({ options: prev.options, correctIndex: prev.correct_option_index }, index);
                      return { ...prev, options: next.options, correct_option_index: next.correctIndex };
                    })}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <button
            type="button"
            onClick={() => onChange((prev) => ({
              ...prev,
              options: addOption({ options: prev.options, correctIndex: prev.correct_option_index }).options,
            }))}
            className="mt-2 flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700"
          >
            <Plus className="h-3.5 w-3.5" /> Thêm phương án
          </button>
          {entry.correct_option_index < 0 && (
            <p className="mt-1.5 text-[11px] font-bold text-rose-500">Chưa chọn đáp án đúng.</p>
          )}
        </div>
      </>
    )}
```

`optionSensors` khai báo trong `ExerciseEntryFields` (trên phần return — đổi component từ arrow-implicit-return sang có body):

```ts
  const optionSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
```

9. `handleTypeChange`: `EMPTY_FORM` đã có `options` mặc định 3 dòng nên không cần sửa thêm.

10. Preview modal: thêm nhánh trước nhánh `classification`:

```tsx
            {previewTarget.type === "multiple_choice" && (
              <div className="space-y-2">
                <p className="text-sm text-slate-700">{previewTarget.prompt_text}</p>
                <div className="space-y-1.5">
                  {(previewTarget.options ?? []).map((option, index) => (
                    <div key={index} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold">
                        {optionLabel(index)}
                      </span>
                      <span>{option}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
```

11. `previewContent`: không cần sửa (`prompt_text` là fallback mặc định).

- [ ] **Step 2: Xác nhận không hồi quy**

Run: `npx tsx --test src/lib/grammarMultipleChoice.test.ts src/components/MultipleChoiceOptions.test.tsx supabase/functions/grammar-submit/scoring.test.ts`
Expected: PASS toàn bộ.

Run: `npm run lint`
Expected: PASS, không lỗi.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/AdminGrammarExerciseSection.tsx
git commit -m "feat(admin): author multiple choice grammar exercises with drag-and-drop options

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Kiểm thử toàn bộ + verify trên browser

**Files:**
- Không tạo file mới (trừ khi phát hiện bug cần fix).

**Interfaces:**
- Consumes: toàn bộ Task 1–6.
- Produces: bằng chứng chạy được (test output + build + ảnh chụp preview).

- [ ] **Step 1: Chạy toàn bộ test hiện có (chống hồi quy)**

Run:
```bash
npx tsx --test src/lib/grammarMultipleChoice.test.ts src/lib/grammarFillInBlank.test.ts src/lib/grammarExerciseGroups.test.ts src/lib/grammarExerciseHint.test.ts src/components/ExercisePageHeader.test.tsx src/components/GrammarExerciseHint.test.tsx src/components/MultipleChoiceOptions.test.tsx src/pages/LessonDetailPage.test.tsx supabase/functions/grammar-submit/scoring.test.ts
```
Expected: tất cả PASS, `fail 0`.

- [ ] **Step 2: Type check + build**

Run: `npm run lint`
Expected: PASS.

Run: `npm run build`
Expected: build thành công.

- [ ] **Step 3: Verify trên browser preview**

Mở dev server bằng preview_start (`.claude/launch.json`), đăng nhập admin, tạo một bài trắc nghiệm gồm 3 câu (2, 3 và 4 phương án), publish, rồi mở phía học viên:
- Đủ số câu và số phương án, nhãn A/B/C/D đúng thứ tự.
- Chọn A rồi đổi sang B → chỉ B được đánh dấu.
- Còn câu chưa trả lời → nút "Nộp bài" disabled; trả lời hết → enabled.
- Nộp bài → điểm hiển thị đúng, câu đúng xanh / câu sai đỏ, không lộ đáp án đúng ở câu sai.
Kiểm tra `read_console_messages` không có lỗi. Chụp screenshot làm bằng chứng.

- [ ] **Step 4: Ghi lại kết quả**

Báo cáo cho user: output test, kết quả build, screenshot. Nếu có bước nào không chạy được (ví dụ chưa apply migration lên prod), nói rõ.

- [ ] **Step 5: Commit (nếu có fix phát sinh)**

```bash
git add -A
git commit -m "fix: address issues found while verifying multiple choice exercises

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Ghi chú tự review

- Mọi mục trong spec đều có task: DB (T1), scoring + choiceResults (T3), types/hook (T4), UI học viên (T5), UI admin gồm kéo thả/validate/preview (T6), test (T2, T3, T5, T6, T7).
- Tên hàm/type dùng nhất quán giữa các task: `ChoiceForm`, `correct_option_index`, `choiceResults`, `optionLabel`, `MultipleChoiceOptions`.
- Không có placeholder: mọi bước code đều có nội dung cụ thể.
