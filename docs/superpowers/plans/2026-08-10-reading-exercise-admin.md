# Phase 6a — Admin tạo/sửa bài đọc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin tạo/sửa/xoá văn bản đọc + nhóm câu hỏi đọc (`richtig_falsch`, `multiple_choice`), thay thế hoàn toàn tab "Đọc" hiện tại (dùng chung `AdminGrammarExerciseSection`).

**Architecture:** 3 tầng `lesson → reading_passages (tái dùng, nâng markdown) → reading_question_groups (bảng mới, JSONB statements/sub_questions) → câu con`. Gắn `exercise_sets` để tái dùng draft/publish/reorder. Xem spec đầy đủ: [2026-08-10-reading-exercise-admin-design.md](../specs/2026-08-10-reading-exercise-admin-design.md).

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + PostgREST + RLS), `@dnd-kit/*` cho kéo-thả, `react-markdown` (qua `MarkdownBlock`), `node:test` cho unit test.

## Global Constraints

- Không dùng `any` — type cụ thể hoặc `unknown`.
- Không `window.alert`/`window.confirm` — dùng `showToast()`.
- Không sửa `src/lib/database.types.ts` bằng tay — chỉ qua `generate_typescript_types` (MCP) hoặc `npm run gen:types`.
- `correct_answer`/`correct_option_id` không lộ qua PostgREST cho non-admin — `reading_question_groups` admin-only RLS cả đọc lẫn ghi.
- Named export, không default export (trừ `App.tsx`).
- Sau mỗi task: `npm run lint` phải sạch trước khi commit.
- Dữ liệu Đọc cũ (`grammar_exercises` category=doc, toàn bộ `reading_passages` hiện có) bị xoá trong migration — không migrate, theo giả định nền "chưa có người dùng thật" của roadmap.

---

## Task 1: Migration — bảng `reading_question_groups` + dọn dữ liệu Đọc cũ

**Files:**
- Create: `supabase/migrations/20260810120000_reading_question_groups.sql`
- Modify: `src/lib/database.types.ts` (qua MCP `generate_typescript_types`, không sửa tay)

**Interfaces:**
- Produces: bảng `reading_question_groups(id, passage_id, set_id, order_index, title, question_intro, question_type, statements, sub_questions, explanation)`; bảng `reading_passages` giữ nguyên schema, dữ liệu cũ bị xoá.

- [ ] **Step 1: Viết migration**

```sql
-- =============================================================================
-- Phase 6a — bảng nhóm câu hỏi đọc (richtig_falsch/multiple_choice), gắn vào
-- văn bản (reading_passages, tái dùng) qua passage_id, và vào exercise_sets
-- qua set_id để tái dùng draft/publish/reorder. Xem
-- docs/superpowers/specs/2026-08-10-reading-exercise-admin-design.md.
--
-- Xoá sạch dữ liệu Đọc cũ (category=doc trong grammar_exercises, toàn bộ
-- reading_passages hiện có) — chưa có người dùng thật, không cần migrate.
-- =============================================================================

DELETE FROM grammar_exercises
WHERE set_id IN (SELECT id FROM exercise_sets WHERE category = 'doc');

DELETE FROM reading_passages;

CREATE TABLE reading_question_groups (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  passage_id     UUID NOT NULL REFERENCES reading_passages(id) ON DELETE CASCADE,
  set_id         UUID NOT NULL REFERENCES exercise_sets(id) ON DELETE CASCADE,
  order_index    INTEGER NOT NULL DEFAULT 0,
  title          TEXT,
  question_intro TEXT,
  question_type  TEXT NOT NULL CHECK (question_type IN ('richtig_falsch', 'multiple_choice')),
  statements     JSONB,
  sub_questions  JSONB,
  explanation    TEXT,
  CONSTRAINT reading_question_groups_body_shape CHECK (
    (question_type = 'richtig_falsch' AND statements IS NOT NULL AND sub_questions IS NULL)
    OR
    (question_type = 'multiple_choice' AND sub_questions IS NOT NULL AND statements IS NULL)
  )
);

ALTER TABLE reading_question_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reading_question_groups: admin only"
  ON reading_question_groups FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

- [ ] **Step 2: Áp dụng migration vào Supabase project qua MCP**

Dùng tool `mcp__6c5f47ff-759a-40a7-ae05-33e169423511__apply_migration` với `name: "reading_question_groups"` và nội dung SQL ở Step 1. Trước khi chạy, gọi `mcp__...__list_projects` để xác nhận đang trỏ đúng project (không phải project lạ). Sau khi apply, gọi `mcp__...__list_tables` xác nhận `reading_question_groups` xuất hiện và `reading_passages` rỗng.

- [ ] **Step 3: Regenerate types**

Gọi `mcp__6c5f47ff-759a-40a7-ae05-33e169423511__generate_typescript_types`, ghi kết quả đè lên `src/lib/database.types.ts` bằng tool Write (không sửa tay từng dòng).

- [ ] **Step 4: Xác nhận build không vỡ**

Run: `npm run lint`
Expected: PASS (không lỗi type liên quan `database.types.ts`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260810120000_reading_question_groups.sql src/lib/database.types.ts
git commit -m "feat(db): bảng reading_question_groups + xoá dữ liệu Đọc cũ"
```

---

## Task 2: `readingExerciseForm.ts` — types + logic danh sách nhận định (richtig_falsch)

**Files:**
- Create: `src/lib/readingExerciseForm.ts`
- Test: `src/lib/readingExerciseForm.test.ts`

**Interfaces:**
- Produces: `StatementForm { id: string; text: string; correctAnswer: "richtig" | "falsch" | null }`, `ReadingQuestionGroupForm` (đủ field, `subQuestions` rỗng ở task này — hoàn thiện ở Task 3), `createEmptyReadingForm()`, `addStatement`, `removeStatement`, `setStatementText`, `setStatementAnswer`, `moveStatement`.

- [ ] **Step 1: Viết test cho statement helpers (thất bại trước)**

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyReadingForm,
  addStatement,
  removeStatement,
  setStatementText,
  setStatementAnswer,
  moveStatement,
} from "./readingExerciseForm";

test("createEmptyReadingForm: passageId rỗng, questionType mặc định richtig_falsch, statements/subQuestions rỗng", () => {
  const form = createEmptyReadingForm();
  assert.equal(form.passageId, "");
  assert.equal(form.questionType, "richtig_falsch");
  assert.deepEqual(form.statements, []);
  assert.deepEqual(form.subQuestions, []);
});

test("addStatement: thêm 1 statement rỗng, correctAnswer null", () => {
  const form = addStatement(createEmptyReadingForm());
  assert.equal(form.statements.length, 1);
  assert.equal(form.statements[0].text, "");
  assert.equal(form.statements[0].correctAnswer, null);
  assert.ok(form.statements[0].id);
});

test("setStatementText: sửa đúng statement theo id, không đụng statement khác", () => {
  let form = addStatement(addStatement(createEmptyReadingForm()));
  const [first, second] = form.statements;
  form = setStatementText(form, first.id, "Hallo");
  assert.equal(form.statements[0].text, "Hallo");
  assert.equal(form.statements[1].text, second.text);
});

test("setStatementAnswer: đặt richtig/falsch theo id", () => {
  let form = addStatement(createEmptyReadingForm());
  const id = form.statements[0].id;
  form = setStatementAnswer(form, id, "richtig");
  assert.equal(form.statements[0].correctAnswer, "richtig");
});

test("removeStatement: xoá đúng statement theo id, giữ nguyên statement khác", () => {
  let form = addStatement(addStatement(createEmptyReadingForm()));
  const [first, second] = form.statements;
  form = removeStatement(form, first.id);
  assert.equal(form.statements.length, 1);
  assert.equal(form.statements[0].id, second.id);
});

test("moveStatement: đổi vị trí 2 statement", () => {
  let form = addStatement(addStatement(addStatement(createEmptyReadingForm())));
  const ids = form.statements.map((s) => s.id);
  form = moveStatement(form, 0, 2);
  assert.deepEqual(form.statements.map((s) => s.id), [ids[1], ids[2], ids[0]]);
});
```

- [ ] **Step 2: Chạy test, xác nhận fail vì module chưa tồn tại**

Run: `npx tsx --test src/lib/readingExerciseForm.test.ts`
Expected: FAIL — "Cannot find module './readingExerciseForm'".

- [ ] **Step 3: Viết module `readingExerciseForm.ts` (phần statements)**

```typescript
export interface StatementForm {
  id: string;
  text: string;
  correctAnswer: "richtig" | "falsch" | null;
}

export interface SubQuestionForm {
  id: string;
  textSnippet: string;
  imageKey: string | null;
  question: string;
  options: string[];
  correctIndex: number;
}

export interface ReadingQuestionGroupForm {
  passageId: string;
  title: string;
  questionIntro: string;
  questionType: "richtig_falsch" | "multiple_choice";
  statements: StatementForm[];
  subQuestions: SubQuestionForm[];
  explanation: string;
}

export const createEmptyReadingForm = (): ReadingQuestionGroupForm => ({
  passageId: "",
  title: "",
  questionIntro: "",
  questionType: "richtig_falsch",
  statements: [],
  subQuestions: [],
  explanation: "",
});

const newId = (): string => crypto.randomUUID();

export const addStatement = (form: ReadingQuestionGroupForm): ReadingQuestionGroupForm => ({
  ...form,
  statements: [...form.statements, { id: newId(), text: "", correctAnswer: null }],
});

export const removeStatement = (form: ReadingQuestionGroupForm, id: string): ReadingQuestionGroupForm => ({
  ...form,
  statements: form.statements.filter((s) => s.id !== id),
});

export const setStatementText = (form: ReadingQuestionGroupForm, id: string, text: string): ReadingQuestionGroupForm => ({
  ...form,
  statements: form.statements.map((s) => (s.id === id ? { ...s, text } : s)),
});

export const setStatementAnswer = (
  form: ReadingQuestionGroupForm,
  id: string,
  correctAnswer: "richtig" | "falsch",
): ReadingQuestionGroupForm => ({
  ...form,
  statements: form.statements.map((s) => (s.id === id ? { ...s, correctAnswer } : s)),
});

export const moveStatement = (form: ReadingQuestionGroupForm, from: number, to: number): ReadingQuestionGroupForm => {
  if (from < 0 || to < 0 || from >= form.statements.length || to >= form.statements.length || from === to) return form;
  const next = [...form.statements];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { ...form, statements: next };
};
```

- [ ] **Step 4: Chạy lại test, xác nhận pass**

Run: `npx tsx --test src/lib/readingExerciseForm.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 5: Commit**

```bash
git add src/lib/readingExerciseForm.ts src/lib/readingExerciseForm.test.ts
git commit -m "feat: readingExerciseForm — logic danh sách nhận định richtig_falsch"
```

---

## Task 3: `readingExerciseForm.ts` — sub_questions, validate, payload build/parse

**Files:**
- Modify: `src/lib/readingExerciseForm.ts`
- Test: `src/lib/readingExerciseForm.test.ts`

**Interfaces:**
- Consumes: `addOption`, `setOption`, `removeOption`, `moveOption`, `validateChoiceForm`, `buildMultipleChoicePayload`, `normalizeOptions`, type `ChoiceForm` từ `./grammarMultipleChoice` (đã có, không sửa).
- Produces: `addSubQuestion`, `removeSubQuestion`, `setSubQuestionField`, `moveSubQuestion`, `setSubQuestionOptions` (thao tác option trong 1 sub-question qua `ChoiceForm`), `validateReadingForm(form): string | null`, `buildReadingPayload(form, passageId, setId, orderIndex)`, `parseReadingRow(row): ReadingQuestionGroupForm`.

**Quyết định thiết kế:** `sub_questions[].options` lưu `string[]` + `correct_option_id` lưu dạng `String(correctIndex)` (y hệt cách `grammar_exercises` lưu `correct_answer` cho `multiple_choice` qua `buildMultipleChoicePayload`) — tái dùng nguyên `ChoiceForm`/`addOption`/`setOption`/`removeOption`/`moveOption`/`validateChoiceForm`/`buildMultipleChoicePayload` cho từng sub-question, không viết lại logic option list-reorder.

- [ ] **Step 1: Viết test cho sub_questions + validate + payload (thất bại trước)**

```typescript
import { addOption } from "./grammarMultipleChoice";
// (thêm vào đầu file test, cạnh các import đã có ở Task 2)

test("addSubQuestion: thêm 1 câu hỏi con, 3 option rỗng, correctIndex -1", () => {
  const form = addSubQuestion(createEmptyReadingForm());
  assert.equal(form.subQuestions.length, 1);
  assert.deepEqual(form.subQuestions[0].options, ["", "", ""]);
  assert.equal(form.subQuestions[0].correctIndex, -1);
  assert.equal(form.subQuestions[0].textSnippet, "");
  assert.equal(form.subQuestions[0].imageKey, null);
});

test("setSubQuestionField: sửa question text theo id", () => {
  let form = addSubQuestion(createEmptyReadingForm());
  const id = form.subQuestions[0].id;
  form = setSubQuestionField(form, id, "question", "Was ist das?");
  assert.equal(form.subQuestions[0].question, "Was ist das?");
});

test("setSubQuestionOptions: thêm option qua addOption dùng chung grammarMultipleChoice", () => {
  let form = addSubQuestion(createEmptyReadingForm());
  const id = form.subQuestions[0].id;
  const choiceForm = { options: form.subQuestions[0].options, correctIndex: form.subQuestions[0].correctIndex };
  const next = addOption(choiceForm);
  form = setSubQuestionOptions(form, id, next);
  assert.equal(form.subQuestions[0].options.length, 4);
});

test("removeSubQuestion / moveSubQuestion: xoá và đổi vị trí theo id/index", () => {
  let form = addSubQuestion(addSubQuestion(createEmptyReadingForm()));
  const [first, second] = form.subQuestions;
  form = moveSubQuestion(form, 0, 1);
  assert.deepEqual(form.subQuestions.map((q) => q.id), [second.id, first.id]);
  form = removeSubQuestion(form, first.id);
  assert.equal(form.subQuestions.length, 1);
  assert.equal(form.subQuestions[0].id, second.id);
});

test("validateReadingForm: chưa chọn văn bản thì báo lỗi", () => {
  const form = addStatement(createEmptyReadingForm());
  assert.equal(validateReadingForm(form), "Chưa chọn văn bản.");
});

test("validateReadingForm: richtig_falsch chưa có nhận định nào thì báo lỗi", () => {
  const form = { ...createEmptyReadingForm(), passageId: "p1" };
  assert.equal(validateReadingForm(form), "Cần ít nhất 1 nhận định.");
});

test("validateReadingForm: richtig_falsch có nhận định thiếu text thì báo lỗi", () => {
  let form = { ...createEmptyReadingForm(), passageId: "p1" };
  form = addStatement(form);
  form = setStatementAnswer(form, form.statements[0].id, "richtig");
  assert.equal(validateReadingForm(form), "Mỗi nhận định cần có nội dung.");
});

test("validateReadingForm: richtig_falsch có nhận định chưa chọn đáp án thì báo lỗi", () => {
  let form = { ...createEmptyReadingForm(), passageId: "p1" };
  form = addStatement(form);
  form = setStatementText(form, form.statements[0].id, "Er ist Lehrer.");
  assert.equal(validateReadingForm(form), "Mỗi nhận định cần chọn Richtig hoặc Falsch.");
});

test("validateReadingForm: richtig_falsch đủ điều kiện thì không lỗi", () => {
  let form = { ...createEmptyReadingForm(), passageId: "p1" };
  form = addStatement(form);
  form = setStatementText(form, form.statements[0].id, "Er ist Lehrer.");
  form = setStatementAnswer(form, form.statements[0].id, "richtig");
  assert.equal(validateReadingForm(form), null);
});

test("validateReadingForm: multiple_choice chưa có câu hỏi con thì báo lỗi", () => {
  const form = { ...createEmptyReadingForm(), passageId: "p1", questionType: "multiple_choice" as const };
  assert.equal(validateReadingForm(form), "Cần ít nhất 1 câu hỏi.");
});

test("validateReadingForm: multiple_choice thiếu đáp án đúng thì báo lỗi", () => {
  let form = { ...createEmptyReadingForm(), passageId: "p1", questionType: "multiple_choice" as const };
  form = addSubQuestion(form);
  const id = form.subQuestions[0].id;
  form = setSubQuestionField(form, id, "question", "Was ist das?");
  form = setSubQuestionOptions(form, id, { options: ["A", "B", "C"], correctIndex: -1 });
  assert.equal(validateReadingForm(form), "Mỗi câu hỏi cần đủ phương án và đáp án đúng.");
});

test("validateReadingForm: multiple_choice đủ điều kiện thì không lỗi", () => {
  let form = { ...createEmptyReadingForm(), passageId: "p1", questionType: "multiple_choice" as const };
  form = addSubQuestion(form);
  const id = form.subQuestions[0].id;
  form = setSubQuestionField(form, id, "question", "Was ist das?");
  form = setSubQuestionOptions(form, id, { options: ["A", "B", "C"], correctIndex: 1 });
  assert.equal(validateReadingForm(form), null);
});

test("buildReadingPayload: richtig_falsch ra đúng shape JSONB, sub_questions null", () => {
  let form = { ...createEmptyReadingForm(), passageId: "p1", title: "Teil 1", explanation: "vì..." };
  form = addStatement(form);
  form = setStatementText(form, form.statements[0].id, "Er ist Lehrer.");
  form = setStatementAnswer(form, form.statements[0].id, "richtig");
  const payload = buildReadingPayload(form, "set1", 0);
  assert.equal(payload.passage_id, "p1");
  assert.equal(payload.set_id, "set1");
  assert.equal(payload.order_index, 0);
  assert.equal(payload.question_type, "richtig_falsch");
  assert.equal(payload.sub_questions, null);
  assert.deepEqual(payload.statements, [{ text: "Er ist Lehrer.", correct_answer: "richtig" }]);
});

test("buildReadingPayload: multiple_choice ra đúng shape JSONB, statements null, correct_option_id là string index", () => {
  let form = { ...createEmptyReadingForm(), passageId: "p1", questionType: "multiple_choice" as const };
  form = addSubQuestion(form);
  const id = form.subQuestions[0].id;
  form = setSubQuestionField(form, id, "question", "Was ist das?");
  form = setSubQuestionOptions(form, id, { options: ["A", "B", "C"], correctIndex: 1 });
  const payload = buildReadingPayload(form, "set1", 0);
  assert.equal(payload.statements, null);
  assert.deepEqual(payload.sub_questions, [
    { text_snippet: null, image_key: null, question: "Was ist das?", options: ["A", "B", "C"], correct_option_id: "1" },
  ]);
});

test("parseReadingRow: round-trip đúng ngược lại buildReadingPayload cho richtig_falsch", () => {
  const row = {
    passage_id: "p1",
    title: "Teil 1",
    question_intro: "Richtig oder Falsch?",
    question_type: "richtig_falsch" as const,
    statements: [{ text: "Er ist Lehrer.", correct_answer: "richtig" as const }],
    sub_questions: null,
    explanation: "vì...",
  };
  const form = parseReadingRow(row);
  assert.equal(form.passageId, "p1");
  assert.equal(form.statements.length, 1);
  assert.equal(form.statements[0].text, "Er ist Lehrer.");
  assert.equal(form.statements[0].correctAnswer, "richtig");
});
```

- [ ] **Step 2: Chạy test, xác nhận fail (thiếu hàm)**

Run: `npx tsx --test src/lib/readingExerciseForm.test.ts`
Expected: FAIL — `addSubQuestion is not defined` (hoặc tương đương).

- [ ] **Step 3: Bổ sung vào `readingExerciseForm.ts`**

```typescript
import type { ChoiceForm } from "./grammarMultipleChoice";
import { buildMultipleChoicePayload, validateChoiceForm } from "./grammarMultipleChoice";
// (thêm vào đầu file, cạnh các import khác nếu có)

export const addSubQuestion = (form: ReadingQuestionGroupForm): ReadingQuestionGroupForm => ({
  ...form,
  subQuestions: [
    ...form.subQuestions,
    { id: newId(), textSnippet: "", imageKey: null, question: "", options: ["", "", ""], correctIndex: -1 },
  ],
});

export const removeSubQuestion = (form: ReadingQuestionGroupForm, id: string): ReadingQuestionGroupForm => ({
  ...form,
  subQuestions: form.subQuestions.filter((q) => q.id !== id),
});

export const setSubQuestionField = <K extends "textSnippet" | "imageKey" | "question">(
  form: ReadingQuestionGroupForm,
  id: string,
  field: K,
  value: SubQuestionForm[K],
): ReadingQuestionGroupForm => ({
  ...form,
  subQuestions: form.subQuestions.map((q) => (q.id === id ? { ...q, [field]: value } : q)),
});

export const setSubQuestionOptions = (
  form: ReadingQuestionGroupForm,
  id: string,
  choiceForm: ChoiceForm,
): ReadingQuestionGroupForm => ({
  ...form,
  subQuestions: form.subQuestions.map((q) =>
    q.id === id ? { ...q, options: choiceForm.options, correctIndex: choiceForm.correctIndex } : q,
  ),
});

export const moveSubQuestion = (form: ReadingQuestionGroupForm, from: number, to: number): ReadingQuestionGroupForm => {
  if (from < 0 || to < 0 || from >= form.subQuestions.length || to >= form.subQuestions.length || from === to) return form;
  const next = [...form.subQuestions];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return { ...form, subQuestions: next };
};

export const validateReadingForm = (form: ReadingQuestionGroupForm): string | null => {
  if (!form.passageId) return "Chưa chọn văn bản.";

  if (form.questionType === "richtig_falsch") {
    if (form.statements.length === 0) return "Cần ít nhất 1 nhận định.";
    if (form.statements.some((s) => !s.text.trim())) return "Mỗi nhận định cần có nội dung.";
    if (form.statements.some((s) => s.correctAnswer === null)) return "Mỗi nhận định cần chọn Richtig hoặc Falsch.";
    return null;
  }

  if (form.subQuestions.length === 0) return "Cần ít nhất 1 câu hỏi.";
  for (const q of form.subQuestions) {
    if (!q.question.trim()) return "Mỗi câu hỏi cần có nội dung.";
    const err = validateChoiceForm(q.question, { options: q.options, correctIndex: q.correctIndex });
    if (err) return "Mỗi câu hỏi cần đủ phương án và đáp án đúng.";
  }
  return null;
};

export interface ReadingQuestionGroupPayload {
  passage_id: string;
  set_id: string;
  order_index: number;
  title: string | null;
  question_intro: string | null;
  question_type: "richtig_falsch" | "multiple_choice";
  statements: { text: string; correct_answer: "richtig" | "falsch" }[] | null;
  sub_questions:
    | { text_snippet: string | null; image_key: string | null; question: string; options: string[]; correct_option_id: string }[]
    | null;
  explanation: string;
}

export const buildReadingPayload = (
  form: ReadingQuestionGroupForm,
  setId: string,
  orderIndex: number,
): ReadingQuestionGroupPayload => ({
  passage_id: form.passageId,
  set_id: setId,
  order_index: orderIndex,
  title: form.title.trim() || null,
  question_intro: form.questionIntro.trim() || null,
  question_type: form.questionType,
  statements:
    form.questionType === "richtig_falsch"
      ? form.statements.map((s) => ({ text: s.text, correct_answer: s.correctAnswer as "richtig" | "falsch" }))
      : null,
  sub_questions:
    form.questionType === "multiple_choice"
      ? form.subQuestions.map((q) => {
          const choicePayload = buildMultipleChoicePayload({ options: q.options, correctIndex: q.correctIndex });
          return {
            text_snippet: q.textSnippet.trim() || null,
            image_key: q.imageKey,
            question: q.question,
            options: choicePayload.options ?? q.options,
            correct_option_id: choicePayload.correct_answer,
          };
        })
      : null,
  explanation: form.explanation,
});

export interface ReadingQuestionGroupRow {
  passage_id: string;
  title: string | null;
  question_intro: string | null;
  question_type: "richtig_falsch" | "multiple_choice";
  statements: { text: string; correct_answer: "richtig" | "falsch" }[] | null;
  sub_questions:
    | { text_snippet: string | null; image_key: string | null; question: string; options: string[]; correct_option_id: string }[]
    | null;
  explanation: string | null;
}

export const parseReadingRow = (row: ReadingQuestionGroupRow): ReadingQuestionGroupForm => ({
  passageId: row.passage_id,
  title: row.title ?? "",
  questionIntro: row.question_intro ?? "",
  questionType: row.question_type,
  statements: (row.statements ?? []).map((s) => ({ id: newId(), text: s.text, correctAnswer: s.correct_answer })),
  subQuestions: (row.sub_questions ?? []).map((q) => ({
    id: newId(),
    textSnippet: q.text_snippet ?? "",
    imageKey: q.image_key,
    question: q.question,
    options: q.options,
    correctIndex: q.options.findIndex((_, i) => String(i) === q.correct_option_id),
  })),
  explanation: row.explanation ?? "",
});
```

- [ ] **Step 4: Chạy lại toàn bộ test file, xác nhận pass**

Run: `npx tsx --test src/lib/readingExerciseForm.test.ts`
Expected: PASS, tất cả test (Task 2 + Task 3).

- [ ] **Step 5: `npm run lint`, xác nhận sạch**

- [ ] **Step 6: Commit**

```bash
git add src/lib/readingExerciseForm.ts src/lib/readingExerciseForm.test.ts
git commit -m "feat: readingExerciseForm — sub_questions, validate, payload build/parse"
```

---

## Task 4: Nâng cấp `PassageEditRow` — markdown + paste-ảnh

**Files:**
- Modify: `src/pages/admin/AdminExerciseSetMedia.tsx`

**Interfaces:**
- Consumes: `uploadMedia` từ `../../lib/uploadMedia`, `MarkdownBlock` từ `../../components/MarkdownBlock`, `showToast` từ `../../lib/toast`.
- Produces: `PassageEditRow` nhận thêm prop `lessonId: string`, nội dung `text_de` giờ là markdown, hỗ trợ paste ảnh (dùng `r2img:` scheme, giống `AdminLessonEditor.tsx:86-117`).

- [ ] **Step 1: Đọc lại đúng cơ chế paste-ảnh hiện có để mirror chính xác**

Đọc `src/pages/admin/AdminLessonEditor.tsx:86-125` (`insertGrammarImage`, `handleGrammarImageUpload`, `handleGrammarPaste`) trước khi sửa — copy đúng cơ chế chèn `r2img:<key>` vào vị trí con trỏ trong textarea.

- [ ] **Step 2: Sửa `PassageEditRow`**

File hiện có import ở đầu: `import React, { useState } from "react"; import { Trash2 } from "lucide-react"; import { useMediaPlaybackUrl } from "../../lib/hooks/useMediaPlaybackUrl";`. Sửa dòng import đầu tiên (`React`) thành `import React, { useRef, useState } from "react";`, dòng `lucide-react` thành `import { Trash2, Image as ImageIcon, Eye, Pencil } from "lucide-react";`, giữ nguyên dòng `useMediaPlaybackUrl`, rồi thêm 2 dòng import mới ngay dưới:

```typescript
import { uploadMedia } from "../../lib/uploadMedia";
import { showToast } from "../../lib/toast";
import { MarkdownBlock } from "../../components/MarkdownBlock";

// (giữ nguyên ListeningClip, ReadingPassage, ClipRow như cũ)

export const PassageEditRow: React.FC<{
  passage: ReadingPassage;
  lessonId: string;
  index: number;
  saving: boolean;
  onSave: (id: string, textDe: string) => void;
  onDelete: (p: ReadingPassage) => void;
}> = ({ passage, lessonId, index, saving, onSave, onDelete }) => {
  const [textDe, setTextDe] = useState(passage.text_de);
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dirty = textDe !== passage.text_de;

  const insertImage = (objectKey: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? textDe.length;
    const end = textarea?.selectionEnd ?? textDe.length;
    const markdown = `![](r2img:${objectKey})`;
    setTextDe(textDe.slice(0, start) + markdown + textDe.slice(end));
  };

  const uploadImage = async (file: File) => {
    setUploadPct(0);
    try {
      const objectKey = await uploadMedia(file, lessonId, "image", setUploadPct);
      insertImage(objectKey);
      showToast("Đã thêm ảnh vào đoạn văn.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Tải ảnh lên thất bại", "warning");
    } finally {
      setUploadPct(null);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const item = Array.from(e.clipboardData.items).find((it) => it.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    const file = item.getAsFile();
    if (file) uploadImage(file);
  };

  return (
    <div className="p-2.5 bg-slate-50/60 rounded-xl space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-display font-bold text-slate-600 shrink-0">Văn bản {index + 1}</span>
        <div className="flex items-center gap-2 shrink-0">
          <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1 cursor-pointer hover:bg-slate-50">
            <ImageIcon className="w-3.5 h-3.5 text-orange-500" />
            {uploadPct !== null ? `${uploadPct}%` : "Thêm ảnh"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploadPct !== null}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ""; }}
            />
          </label>
          <button onClick={() => setTab(tab === "edit" ? "preview" : "edit")} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400" title={tab === "edit" ? "Xem trước" : "Chỉnh sửa"}>
            {tab === "edit" ? <Eye className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          </button>
          {dirty && (
            <button onClick={() => onSave(passage.id, textDe)} disabled={saving} className="text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-50">
              {saving ? "Đang lưu..." : "Lưu văn bản"}
            </button>
          )}
          <button onClick={() => onDelete(passage)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Xóa văn bản">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {tab === "edit" ? (
        <textarea
          ref={textareaRef}
          rows={4}
          value={textDe}
          onChange={(e) => setTextDe(e.target.value)}
          onPaste={handlePaste}
          placeholder="Nhập văn bản (hỗ trợ Markdown, paste ảnh trực tiếp)..."
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-y font-mono"
        />
      ) : (
        <div className="min-h-16 bg-white border border-slate-200 rounded-xl p-3">
          {textDe ? <MarkdownBlock content={textDe} lessonId={lessonId} /> : <p className="text-xs text-slate-400 italic">Chưa có nội dung.</p>}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 3: Cập nhật mọi nơi gọi `<PassageEditRow>` để truyền `lessonId`**

Grep `PassageEditRow` trong repo (`grep -rn "PassageEditRow" src/`), sửa mọi call site truyền thêm `lessonId={...}` (lúc này chỉ còn call site trong `AdminGrammarExerciseSection.tsx`, sẽ bị xoá ở Task 10 — nhưng phải sửa ngay để không vỡ build ở task này; Task 5 sẽ thêm call site mới trong `AdminReadingExerciseSection.tsx`).

- [ ] **Step 4: `npm run lint`, xác nhận sạch**

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminExerciseSetMedia.tsx src/pages/admin/AdminGrammarExerciseSection.tsx
git commit -m "feat(admin): PassageEditRow hỗ trợ markdown + paste-ảnh"
```

---

## Task 5: `AdminReadingExerciseSection.tsx` — data layer + accordion + panel Văn bản

**Files:**
- Create: `src/pages/admin/AdminReadingExerciseSection.tsx`

**Interfaces:**
- Consumes: `useModuleOrder` (`../../lib/hooks/useModuleOrder`), `useExerciseSets`/`ExerciseSet` (`../../lib/hooks/useExerciseSets`), `ReadingPassage`/`PassageEditRow` (`./AdminExerciseSetMedia`), `supabase`, `showToast`, `Button`/`LessonStatusBadge` (`../../components/DesignSystem`).
- Produces: `export const AdminReadingExerciseSection: React.FC`. Component tự fetch `reading_passages` (không filter category, bảng này chỉ dùng cho Đọc) + `exercise_sets` (category='doc') + `lessons` (id, title_vi, module_id, modules(title_vi)), nhóm theo lesson giống `AdminGrammarExerciseSection.fetchExercises` (dòng 938-975).

- [ ] **Step 1: Viết component — data fetching + accordion shell + panel Văn bản**

```typescript
import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { showToast } from "../../lib/toast";
import { useModuleOrder } from "../../lib/hooks/useModuleOrder";
import { useExerciseSets } from "../../lib/hooks/useExerciseSets";
import { type ReadingPassage, PassageEditRow } from "./AdminExerciseSetMedia";

interface LessonGroup {
  lesson_id: string;
  lesson_title: string;
  module_title: string;
}

export const AdminReadingExerciseSection: React.FC = () => {
  const [lessons, setLessons] = useState<LessonGroup[]>([]);
  const [passages, setPassages] = useState<ReadingPassage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [savingPassageId, setSavingPassageId] = useState<string | null>(null);
  const [deletePassageTarget, setDeletePassageTarget] = useState<ReadingPassage | null>(null);
  const [deletingPassage, setDeletingPassage] = useState(false);
  const { moduleOrder } = useModuleOrder();
  const { sets, toggleSetStatus, createSet } = useExerciseSets();

  const docSets = sets.filter((s) => s.category === "doc");

  const fetchAll = async () => {
    setLoading(true);
    const [lessonsRes, passagesRes] = await Promise.all([
      supabase.from("lessons").select("id, title_vi, module_id, modules(title_vi)").order("order_index"),
      supabase.from("reading_passages").select("*").order("lesson_id").order("order_index"),
    ]);
    setLessons(
      (lessonsRes.data ?? []).map((l) => ({
        lesson_id: l.id,
        lesson_title: l.title_vi,
        module_title: (l.modules as unknown as { title_vi: string } | null)?.title_vi ?? "",
      })),
    );
    setPassages((passagesRes.data ?? []) as ReadingPassage[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleAddPassage = async (lessonId: string) => {
    const nextOrder = passages.filter((p) => p.lesson_id === lessonId).length;
    const { error } = await supabase.from("reading_passages").insert({ lesson_id: lessonId, text_de: "", order_index: nextOrder });
    if (error) showToast("Thêm văn bản thất bại: " + error.message, "warning");
    else fetchAll();
  };

  const handleSavePassage = async (passageId: string, textDe: string) => {
    setSavingPassageId(passageId);
    const { error } = await supabase.from("reading_passages").update({ text_de: textDe }).eq("id", passageId);
    setSavingPassageId(null);
    if (error) showToast("Lưu thất bại: " + error.message, "warning");
    else { showToast("Đã lưu văn bản.", "success"); fetchAll(); }
  };

  const handleDeletePassage = async () => {
    if (!deletePassageTarget) return;
    setDeletingPassage(true);
    const { error } = await supabase.from("reading_passages").delete().eq("id", deletePassageTarget.id);
    setDeletingPassage(false);
    if (error) showToast("Xóa thất bại: " + error.message, "warning");
    else { showToast("Đã xóa văn bản (mọi nhóm câu hỏi gắn theo cũng bị xoá).", "success"); setDeletePassageTarget(null); fetchAll(); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>;

  const orderedLessons = moduleOrder.length > 0
    ? [...lessons].sort((a, b) => moduleOrder.indexOf(a.module_id ?? "") - moduleOrder.indexOf(b.module_id ?? ""))
    : lessons;

  return (
    <div className="space-y-3">
      {orderedLessons.map((lesson) => {
        const lessonPassages = passages.filter((p) => p.lesson_id === lesson.lesson_id);
        const lessonSets = docSets.filter((s) => s.lessonId === lesson.lesson_id);
        const isExpanded = expanded[lesson.lesson_id] ?? false;
        return (
          <div key={lesson.lesson_id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded((prev) => ({ ...prev, [lesson.lesson_id]: !isExpanded }))}
              className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 text-left"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <span className="text-sm font-display font-bold text-slate-700">{lesson.lesson_title}</span>
              <span className="text-xs text-slate-400">{lesson.module_title}</span>
              <span className="ml-auto text-xs text-slate-400">{lessonPassages.length} văn bản · {lessonSets.length} nhóm bài</span>
            </button>
            {isExpanded && (
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-display font-bold text-slate-500 uppercase">Văn bản</span>
                    <button type="button" onClick={() => handleAddPassage(lesson.lesson_id)} className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700">
                      <Plus className="w-3.5 h-3.5" /> Thêm văn bản
                    </button>
                  </div>
                  {lessonPassages.map((passage, i) => (
                    <PassageEditRow
                      key={passage.id}
                      passage={passage}
                      lessonId={lesson.lesson_id}
                      index={i}
                      saving={savingPassageId === passage.id}
                      onSave={handleSavePassage}
                      onDelete={setDeletePassageTarget}
                    />
                  ))}
                  {lessonPassages.length === 0 && <p className="text-xs text-slate-400 italic">Chưa có văn bản nào.</p>}
                </div>
                {/* Panel "Nhóm bài" — Task 6 */}
              </div>
            )}
          </div>
        );
      })}
      {deletePassageTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3">
            <p className="text-sm text-slate-700">Xóa văn bản này? Mọi nhóm câu hỏi đang dựa vào văn bản này sẽ bị xoá theo.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletePassageTarget(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-lg">Hủy</button>
              <button onClick={handleDeletePassage} disabled={deletingPassage} className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50">
                {deletingPassage ? "Đang xóa..." : "Xóa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: `npm run lint`**

Expected: sạch — component chưa được render ở đâu (chưa wire vào `AdminQuizSection.tsx`, việc đó ở Task 9) nên không phá build hiện có, nhưng phải tự thân không có lỗi type.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/AdminReadingExerciseSection.tsx
git commit -m "feat(admin): AdminReadingExerciseSection — accordion lesson + panel Văn bản"
```

---

## Task 6: Panel "Nhóm bài" + modal tạo/sửa (richtig_falsch)

**Files:**
- Modify: `src/pages/admin/AdminReadingExerciseSection.tsx`

**Interfaces:**
- Consumes: mọi export của `readingExerciseForm.ts` (Task 2+3), `Button`/`LessonStatusBadge`.
- Produces: panel liệt kê `reading_question_groups` theo từng `set` (nhóm bài), modal tạo/sửa với chọn văn bản + tiêu đề + câu hỏi chung + editor nhận định richtig_falsch. (Editor multiple_choice ở Task 7.)

- [ ] **Step 1: Thêm state + data fetching cho `reading_question_groups`, thêm import**

Thêm vào đầu component (sau các `useState` đã có ở Task 5):

```typescript
import {
  createEmptyReadingForm,
  parseReadingRow,
  buildReadingPayload,
  validateReadingForm,
  addStatement,
  removeStatement,
  setStatementText,
  setStatementAnswer,
  moveStatement,
  type ReadingQuestionGroupForm,
} from "../../lib/readingExerciseForm";
import { Trash2, Pencil, X, ChevronUp, ChevronDown } from "lucide-react";

interface ReadingQuestionGroupRowData {
  id: string;
  passage_id: string;
  set_id: string;
  order_index: number;
  title: string | null;
  question_intro: string | null;
  question_type: "richtig_falsch" | "multiple_choice";
  statements: { text: string; correct_answer: "richtig" | "falsch" }[] | null;
  sub_questions:
    | { text_snippet: string | null; image_key: string | null; question: string; options: string[]; correct_option_id: string }[]
    | null;
  explanation: string | null;
}
```

Thêm state trong `AdminReadingExerciseSection`:

```typescript
const [groups, setGroups] = useState<ReadingQuestionGroupRowData[]>([]);
const [modalOpen, setModalOpen] = useState(false);
const [editingId, setEditingId] = useState<string | null>(null);
const [editingSetId, setEditingSetId] = useState<string>("");
const [form, setForm] = useState<ReadingQuestionGroupForm>(createEmptyReadingForm());
const [saving, setSaving] = useState(false);
const [deleteGroupTarget, setDeleteGroupTarget] = useState<ReadingQuestionGroupRowData | null>(null);
const [deletingGroup, setDeletingGroup] = useState(false);
```

Sửa `fetchAll` (thêm fetch `reading_question_groups` song song):

```typescript
const fetchAll = async () => {
  setLoading(true);
  const [lessonsRes, passagesRes, groupsRes] = await Promise.all([
    supabase.from("lessons").select("id, title_vi, module_id, modules(title_vi)").order("order_index"),
    supabase.from("reading_passages").select("*").order("lesson_id").order("order_index"),
    supabase.from("reading_question_groups").select("*").order("set_id").order("order_index"),
  ]);
  setLessons(
    (lessonsRes.data ?? []).map((l) => ({
      lesson_id: l.id,
      lesson_title: l.title_vi,
      module_title: (l.modules as unknown as { title_vi: string } | null)?.title_vi ?? "",
    })),
  );
  setPassages((passagesRes.data ?? []) as ReadingPassage[]);
  setGroups((groupsRes.data ?? []) as ReadingQuestionGroupRowData[]);
  setLoading(false);
};
```

- [ ] **Step 2: Handler mở modal tạo mới / sửa / lưu / xoá**

```typescript
const openCreateGroup = (setId: string) => {
  setEditingId(null);
  setEditingSetId(setId);
  setForm(createEmptyReadingForm());
  setModalOpen(true);
};

const openEditGroup = (group: ReadingQuestionGroupRowData) => {
  setEditingId(group.id);
  setEditingSetId(group.set_id);
  setForm(parseReadingRow(group));
  setModalOpen(true);
};

const handleSaveGroup = async () => {
  const error = validateReadingForm(form);
  if (error) { showToast(error, "warning"); return; }
  setSaving(true);
  const existingInSet = groups.filter((g) => g.set_id === editingSetId);
  const orderIndex = editingId
    ? existingInSet.find((g) => g.id === editingId)?.order_index ?? existingInSet.length
    : existingInSet.length;
  const payload = buildReadingPayload(form, editingSetId, orderIndex);
  const { error: dbError } = editingId
    ? await supabase.from("reading_question_groups").update(payload).eq("id", editingId)
    : await supabase.from("reading_question_groups").insert(payload);
  setSaving(false);
  if (dbError) { showToast("Lưu thất bại: " + dbError.message, "warning"); return; }
  showToast("Đã lưu nhóm câu hỏi.", "success");
  setModalOpen(false);
  fetchAll();
};

const handleDeleteGroup = async () => {
  if (!deleteGroupTarget) return;
  setDeletingGroup(true);
  const { error } = await supabase.from("reading_question_groups").delete().eq("id", deleteGroupTarget.id);
  setDeletingGroup(false);
  if (error) showToast("Xóa thất bại: " + error.message, "warning");
  else { showToast("Đã xóa nhóm câu hỏi.", "success"); setDeleteGroupTarget(null); fetchAll(); }
};

const handleCreateSet = async (lessonId: string, nextOrder: number) => {
  const { data, error } = await createSet(lessonId, "doc", nextOrder);
  if (error || !data) { showToast("Tạo nhóm bài thất bại: " + error, "warning"); return; }
  openCreateGroup(data.id);
};

const handleMoveGroup = async (setId: string, index: number, direction: -1 | 1) => {
  const setGroups = groups.filter((g) => g.set_id === setId).sort((a, b) => a.order_index - b.order_index);
  const target = index + direction;
  if (target < 0 || target >= setGroups.length) return;
  const a = setGroups[index];
  const b = setGroups[target];
  const [{ error: err1 }, { error: err2 }] = await Promise.all([
    supabase.from("reading_question_groups").update({ order_index: b.order_index }).eq("id", a.id),
    supabase.from("reading_question_groups").update({ order_index: a.order_index }).eq("id", b.id),
  ]);
  if (err1 || err2) showToast("Sắp xếp thất bại: " + (err1?.message ?? err2?.message), "warning");
  else fetchAll();
};
```

- [ ] **Step 3: JSX panel "Nhóm bài" — chèn vào chỗ comment `{/* Panel "Nhóm bài" — Task 6 */}`**

```tsx
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <span className="text-xs font-display font-bold text-slate-500 uppercase">Nhóm bài</span>
    <button type="button" onClick={() => handleCreateSet(lesson.lesson_id, lessonSets.length)} className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700">
      <Plus className="w-3.5 h-3.5" /> Thêm nhóm bài
    </button>
  </div>
  {lessonSets.map((set) => {
    const setGroups = groups.filter((g) => g.set_id === set.id).sort((a, b) => a.order_index - b.order_index);
    return (
      <div key={set.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-3 bg-slate-50 px-3 py-2.5">
          <span className="text-sm font-black text-slate-700">{set.title}</span>
          <span role="button" onClick={() => toggleSetStatus(set.id, set.status)}>
            <LessonStatusBadge status={set.status} />
          </span>
          <button type="button" onClick={() => openCreateGroup(set.id)} className="ml-auto flex items-center gap-1 text-xs font-bold text-orange-600 hover:bg-orange-50 px-2 py-1 rounded-lg">
            <Plus className="w-3.5 h-3.5" /> Thêm nhóm câu hỏi
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {setGroups.map((group, i) => (
            <div key={group.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex flex-col items-center gap-0.5 shrink-0">
                <button type="button" disabled={i === 0} onClick={() => handleMoveGroup(set.id, i, -1)} className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-20" aria-label="Đưa nhóm câu hỏi lên trên"><ChevronUp className="w-3.5 h-3.5" /></button>
                <button type="button" disabled={i === setGroups.length - 1} onClick={() => handleMoveGroup(set.id, i, 1)} className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-20" aria-label="Đưa nhóm câu hỏi xuống dưới"><ChevronDown className="w-3.5 h-3.5" /></button>
              </div>
              <span className="text-xs font-bold text-slate-400 w-6">{i + 1}</span>
              <span className="text-sm text-slate-700 flex-1 truncate">{group.title || (group.question_type === "richtig_falsch" ? "Richtig/Falsch" : "Trắc nghiệm")}</span>
              <button onClick={() => openEditGroup(group)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
              <button onClick={() => setDeleteGroupTarget(group)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {setGroups.length === 0 && <p className="text-xs text-slate-400 italic px-3 py-2.5">Chưa có nhóm câu hỏi nào.</p>}
        </div>
      </div>
    );
  })}
  {lessonSets.length === 0 && <p className="text-xs text-slate-400 italic">Chưa có nhóm bài nào.</p>}
</div>
```

> Sắp xếp `reading_question_groups` trong 1 set dùng nút mũi tên lên/xuống (`handleMoveGroup`, thêm ở Step 2), không dùng kéo-thả `@dnd-kit` — tránh `DndContext` lồng nhau khi modal cũng có editor bên trong, và danh sách nhóm câu hỏi trong 1 set thường ngắn nên không cần kéo-thả.

- [ ] **Step 4: Modal tạo/sửa — chọn văn bản, tiêu đề, câu hỏi chung, dạng câu hỏi, editor richtig_falsch**

Thêm vào cuối JSX (trước `</div>` đóng return, cạnh modal xoá văn bản):

```tsx
{modalOpen && (
  <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
    <div className="bg-white rounded-2xl p-5 max-w-2xl w-full my-8 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-bold text-slate-800">{editingId ? "Sửa nhóm câu hỏi" : "Thêm nhóm câu hỏi"}</h3>
        <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1">Văn bản *</label>
        <select
          value={form.passageId}
          onChange={(e) => setForm((prev) => ({ ...prev, passageId: e.target.value }))}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
        >
          <option value="">-- Chọn văn bản --</option>
          {passages.map((p) => (
            <option key={p.id} value={p.id}>{p.text_de.slice(0, 60) || `Văn bản ${p.id.slice(0, 8)}`}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1">Tiêu đề</label>
        <input type="text" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl" />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1">Câu hỏi chung</label>
        <textarea rows={2} value={form.questionIntro} onChange={(e) => setForm((prev) => ({ ...prev, questionIntro: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none" />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1">Dạng câu hỏi *</label>
        <div className="flex gap-2">
          {(["richtig_falsch", "multiple_choice"] as const).map((qt) => (
            <button
              key={qt}
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, questionType: qt }))}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border ${form.questionType === qt ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-600 border-slate-200"}`}
            >
              {qt === "richtig_falsch" ? "Richtig/Falsch" : "Trắc nghiệm"}
            </button>
          ))}
        </div>
      </div>

      {form.questionType === "richtig_falsch" && (
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-500">Nhận định *</label>
          {form.statements.map((s, i) => (
            <div key={s.id} className="flex items-start gap-2 p-2 bg-slate-50/60 rounded-xl">
              <div className="flex flex-col items-center gap-0.5 shrink-0 mt-1">
                <button type="button" disabled={i === 0} onClick={() => setForm((prev) => moveStatement(prev, i, i - 1))} className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-20 disabled:hover:text-slate-300" aria-label="Đưa nhận định lên trên"><ChevronUp className="w-3.5 h-3.5" /></button>
                <span className="text-xs font-bold text-slate-400">{i + 1}</span>
                <button type="button" disabled={i === form.statements.length - 1} onClick={() => setForm((prev) => moveStatement(prev, i, i + 1))} className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-20 disabled:hover:text-slate-300" aria-label="Đưa nhận định xuống dưới"><ChevronDown className="w-3.5 h-3.5" /></button>
              </div>
              <textarea
                rows={2}
                value={s.text}
                onChange={(e) => setForm((prev) => setStatementText(prev, s.id, e.target.value))}
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none"
                placeholder="Nhận định..."
              />
              <div className="flex flex-col gap-1 shrink-0">
                {(["richtig", "falsch"] as const).map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setForm((prev) => setStatementAnswer(prev, s.id, val))}
                    className={`px-2 py-1 text-[11px] font-bold rounded-lg border ${s.correctAnswer === val ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-500 border-slate-200"}`}
                  >
                    {val === "richtig" ? "Richtig" : "Falsch"}
                  </button>
                ))}
              </div>
              <button onClick={() => setForm((prev) => removeStatement(prev, s.id))} className="p-1.5 text-slate-300 hover:text-rose-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <button type="button" onClick={() => setForm((prev) => addStatement(prev))} className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700">
            <Plus className="w-3.5 h-3.5" /> Thêm nhận định
          </button>
        </div>
      )}

      {/* Editor multiple_choice — Task 7 */}

      <div>
        <label className="block text-xs font-bold text-slate-500 mb-1">Giải thích</label>
        <textarea rows={2} value={form.explanation} onChange={(e) => setForm((prev) => ({ ...prev, explanation: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none" />
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Hủy</button>
        <button onClick={handleSaveGroup} disabled={saving} className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl disabled:opacity-50">
          {saving ? "Đang lưu..." : "Lưu"}
        </button>
      </div>
    </div>
  </div>
)}

{deleteGroupTarget && (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3">
      <p className="text-sm text-slate-700">Xóa nhóm câu hỏi này?</p>
      <div className="flex justify-end gap-2">
        <button onClick={() => setDeleteGroupTarget(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-lg">Hủy</button>
        <button onClick={handleDeleteGroup} disabled={deletingGroup} className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50">
          {deletingGroup ? "Đang xóa..." : "Xóa"}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: `npm run lint`**

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/AdminReadingExerciseSection.tsx
git commit -m "feat(admin): panel Nhóm bài + modal tạo/sửa richtig_falsch"
```

---

## Task 7: Editor `multiple_choice` trong modal (văn bản ngắn + ảnh + options)

**Files:**
- Modify: `src/pages/admin/AdminReadingExerciseSection.tsx`

**Interfaces:**
- Consumes: `addOption`, `setOption`, `removeOption`, `optionLabel` (`../../lib/grammarMultipleChoice`); `addSubQuestion`, `removeSubQuestion`, `setSubQuestionField`, `setSubQuestionOptions` (`../../lib/readingExerciseForm`); `uploadMedia`.

- [ ] **Step 1: Thêm import còn thiếu**

```typescript
import { addOption, setOption, removeOption, optionLabel } from "../../lib/grammarMultipleChoice";
import { addSubQuestion, removeSubQuestion, setSubQuestionField, setSubQuestionOptions, moveSubQuestion } from "../../lib/readingExerciseForm";
import { uploadMedia } from "../../lib/uploadMedia";
```

(Gộp vào cụm import `readingExerciseForm` đã thêm ở Task 6 thay vì import riêng 2 dòng.)

- [ ] **Step 2: Thêm handler upload ảnh cho sub-question (dùng chung `lesson.lesson_id` đang render — component con nhận `lessonId` qua prop)**

Thêm hàm trong component, ngay cạnh `handleSaveGroup`:

```typescript
const [subQuestionUploadId, setSubQuestionUploadId] = useState<string | null>(null);

const handleSubQuestionImageUpload = async (lessonId: string, subQuestionId: string, file: File) => {
  setSubQuestionUploadId(subQuestionId);
  try {
    const objectKey = await uploadMedia(file, lessonId, "image", () => {});
    setForm((prev) => setSubQuestionField(prev, subQuestionId, "imageKey", objectKey));
  } catch (err) {
    showToast(err instanceof Error ? err.message : "Tải ảnh lên thất bại", "warning");
  } finally {
    setSubQuestionUploadId(null);
  }
};
```

- [ ] **Step 3: JSX editor multiple_choice — thay chỗ comment `{/* Editor multiple_choice — Task 7 */}`**

Cần biết `lessonId` hiện tại trong modal: thêm state `const [modalLessonId, setModalLessonId] = useState("");`, set nó trong `openCreateGroup`/`openEditGroup` (nhận thêm tham số `lessonId`, sửa 2 call site `handleCreateSet`/`openEditGroup` truyền `lesson.lesson_id`).

Sửa `openCreateGroup`/`openEditGroup`:

```typescript
const openCreateGroup = (setId: string, lessonId: string) => {
  setEditingId(null);
  setEditingSetId(setId);
  setModalLessonId(lessonId);
  setForm(createEmptyReadingForm());
  setModalOpen(true);
};

const openEditGroup = (group: ReadingQuestionGroupRowData, lessonId: string) => {
  setEditingId(group.id);
  setEditingSetId(group.set_id);
  setModalLessonId(lessonId);
  setForm(parseReadingRow(group));
  setModalOpen(true);
};
```

Sửa call site trong JSX panel Nhóm bài (Task 6): `onClick={() => openCreateGroup(set.id, lesson.lesson_id)}` và `onClick={() => openEditGroup(group, lesson.lesson_id)}`; sửa `handleCreateSet` gọi `openCreateGroup(data.id, lessonId)`.

JSX editor:

```tsx
{form.questionType === "multiple_choice" && (
  <div className="space-y-3">
    <label className="block text-xs font-bold text-slate-500">Câu hỏi *</label>
    {form.subQuestions.map((q, qi) => (
      <div key={q.id} className="p-3 bg-slate-50/60 rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400">Câu {qi + 1}</span>
          <div className="flex items-center gap-1">
            <button type="button" disabled={qi === 0} onClick={() => setForm((prev) => moveSubQuestion(prev, qi, qi - 1))} className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-20" aria-label="Đưa câu hỏi lên trên"><ChevronUp className="w-3.5 h-3.5" /></button>
            <button type="button" disabled={qi === form.subQuestions.length - 1} onClick={() => setForm((prev) => moveSubQuestion(prev, qi, qi + 1))} className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-20" aria-label="Đưa câu hỏi xuống dưới"><ChevronDown className="w-3.5 h-3.5" /></button>
            <button onClick={() => setForm((prev) => removeSubQuestion(prev, q.id))} className="p-1 text-slate-300 hover:text-rose-500"><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>
        <textarea
          rows={2}
          value={q.textSnippet}
          onChange={(e) => setForm((prev) => setSubQuestionField(prev, q.id, "textSnippet", e.target.value))}
          placeholder="Văn bản ngắn (tuỳ chọn)..."
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none"
        />
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1 cursor-pointer hover:bg-slate-50">
            {subQuestionUploadId === q.id ? "Đang tải..." : "Thêm ảnh"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={subQuestionUploadId !== null}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSubQuestionImageUpload(modalLessonId, q.id, f); e.target.value = ""; }}
            />
          </label>
          {q.imageKey && <span className="text-[11px] text-emerald-600">Đã có ảnh</span>}
        </div>
        <input
          type="text"
          value={q.question}
          onChange={(e) => setForm((prev) => setSubQuestionField(prev, q.id, "question", e.target.value))}
          placeholder="Câu hỏi..."
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
        />
        <div className="space-y-1.5">
          {q.options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <span className="w-5 text-center text-xs font-display font-bold text-slate-400">{optionLabel(oi)}</span>
              <input
                type="radio"
                checked={q.correctIndex === oi}
                onChange={() => setForm((prev) => setSubQuestionOptions(prev, q.id, { options: q.options, correctIndex: oi }))}
                className="h-4 w-4 accent-orange-500"
              />
              <input
                type="text"
                value={opt}
                onChange={(e) => setForm((prev) => setSubQuestionOptions(prev, q.id, setOption({ options: q.options, correctIndex: q.correctIndex }, oi, e.target.value)))}
                className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                placeholder={`Phương án ${optionLabel(oi)}`}
              />
              <button
                onClick={() => setForm((prev) => setSubQuestionOptions(prev, q.id, removeOption({ options: q.options, correctIndex: q.correctIndex }, oi)))}
                className="p-1 text-slate-300 hover:text-rose-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setForm((prev) => setSubQuestionOptions(prev, q.id, addOption({ options: q.options, correctIndex: q.correctIndex })))}
            className="text-xs font-bold text-orange-600 hover:text-orange-700"
          >
            + Thêm phương án
          </button>
        </div>
      </div>
    ))}
    <button type="button" onClick={() => setForm((prev) => addSubQuestion(prev))} className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700">
      <Plus className="w-3.5 h-3.5" /> Thêm câu hỏi
    </button>
  </div>
)}
```

> Sắp xếp câu hỏi con dùng nút mũi tên lên/xuống (`moveSubQuestion`, giống statements ở Task 6). Riêng **sắp xếp option A/B/C trong 1 câu hỏi con thì không làm** — danh sách chỉ 2-4 phần tử, ticket gốc chỉ yêu cầu sắp xếp "câu hỏi" chứ không yêu cầu sắp xếp option; không tái dùng `SortableOptionRow` để tránh kéo thêm `DndContext` lồng nhau trong modal.

- [ ] **Step 4: `npm run lint`**

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminReadingExerciseSection.tsx
git commit -m "feat(admin): editor multiple_choice — văn bản ngắn, ảnh, options"
```

---

## Task 8: Preview modal

**Files:**
- Modify: `src/pages/admin/AdminReadingExerciseSection.tsx`

**Interfaces:**
- Consumes: `MarkdownBlock`.
- Produces: preview read-only mô phỏng tương tác học viên (click chọn Richtig/Falsch hoặc option, chỉ local state).

- [ ] **Step 1: Thêm state + nút mở preview cạnh nút sửa/xoá trong panel Nhóm bài**

Thêm state: `const [previewTarget, setPreviewTarget] = useState<ReadingQuestionGroupRowData | null>(null);` và import `Eye` từ `lucide-react` (gộp vào import đã có).

Thêm nút trong row nhóm câu hỏi (Task 6, cạnh nút Pencil):
```tsx
<button onClick={() => setPreviewTarget(group)} className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-600"><Eye className="w-3.5 h-3.5" /></button>
```

- [ ] **Step 2: Component preview nội bộ + modal**

Thêm trước `export const AdminReadingExerciseSection`:

```tsx
const ReadingGroupPreview: React.FC<{ group: ReadingQuestionGroupRowData; passageText: string; lessonId: string }> = ({ group, passageText, lessonId }) => {
  const [picked, setPicked] = useState<Record<number, "richtig" | "falsch">>({});
  const [chosenOption, setChosenOption] = useState<Record<number, number>>({});

  return (
    <div className="space-y-3">
      {group.title && <p className="text-sm font-display font-bold text-slate-800">{group.title}</p>}
      {group.question_intro && <p className="text-xs text-slate-500">{group.question_intro}</p>}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
        <MarkdownBlock content={passageText} lessonId={lessonId} />
      </div>
      {group.question_type === "richtig_falsch" && (group.statements ?? []).map((s, i) => (
        <div key={i} className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-xl">
          <span className="flex-1 text-sm text-slate-700">{s.text}</span>
          {(["richtig", "falsch"] as const).map((val) => (
            <button
              key={val}
              onClick={() => setPicked((prev) => ({ ...prev, [i]: val }))}
              className={`px-2 py-1 text-[11px] font-bold rounded-lg border ${picked[i] === val ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-500 border-slate-200"}`}
            >
              {val === "richtig" ? "Richtig" : "Falsch"}
            </button>
          ))}
        </div>
      ))}
      {group.question_type === "multiple_choice" && (group.sub_questions ?? []).map((q, qi) => (
        <div key={qi} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
          {q.text_snippet && <p className="text-xs text-slate-500">{q.text_snippet}</p>}
          <p className="text-sm font-medium text-slate-700">{q.question}</p>
          <div className="space-y-1">
            {q.options.map((opt, oi) => (
              <button
                key={oi}
                onClick={() => setChosenOption((prev) => ({ ...prev, [qi]: oi }))}
                className={`w-full text-left px-3 py-1.5 text-sm rounded-lg border ${chosenOption[qi] === oi ? "bg-orange-50 border-orange-400 text-orange-700" : "bg-white border-slate-200 text-slate-700"}`}
              >
                {optionLabel(oi)}. {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
```

(Import `optionLabel` đã có từ Task 7.)

Thêm modal preview vào cuối JSX, cạnh modal xoá nhóm câu hỏi:

```tsx
{previewTarget && (
  <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
    <div className="bg-white rounded-2xl p-5 max-w-xl w-full my-8 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display font-bold text-slate-800">Xem trước</h3>
        <button onClick={() => setPreviewTarget(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
      </div>
      <ReadingGroupPreview
        group={previewTarget}
        passageText={passages.find((p) => p.id === previewTarget.passage_id)?.text_de ?? ""}
        lessonId={passages.find((p) => p.id === previewTarget.passage_id)?.lesson_id ?? ""}
      />
    </div>
  </div>
)}
```

- [ ] **Step 3: `npm run lint`**

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/AdminReadingExerciseSection.tsx
git commit -m "feat(admin): Preview modal mô phỏng tương tác học viên"
```

---

## Task 9: Wire vào `AdminQuizSection.tsx`

**Files:**
- Modify: `src/pages/admin/AdminQuizSection.tsx`

- [ ] **Step 1: Thay import + JSX**

```typescript
import { AdminReadingExerciseSection } from "./AdminReadingExerciseSection";
```

Xoá import `AdminGrammarExerciseSection` nếu không còn dùng cho category khác trong file này (file này chỉ render `AdminGrammarExerciseSection` cho `"nguphap"`/`"nghe"`, giữ lại import — chỉ đổi nhánh `"doc"`).

Sửa dòng render:
```tsx
<AdminGrammarExerciseSection category={activeTab} />
```
thành:
```tsx
{activeTab === "doc" ? <AdminReadingExerciseSection /> : <AdminGrammarExerciseSection category={activeTab} />}
```

- [ ] **Step 2: `npm run lint`**

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/AdminQuizSection.tsx
git commit -m "feat(admin): tab Đọc dùng AdminReadingExerciseSection"
```

---

## Task 10: Dọn code chết `category === "doc"` trong `AdminGrammarExerciseSection.tsx`

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx`

- [ ] **Step 1: Grep lại vị trí hiện tại (số dòng đã đổi so với lúc khảo sát ban đầu do Task 4 sửa file này)**

Run: `grep -n 'category === "doc"\|"doc"\|ReadingPassage\|PassageEditRow\|handleAddPassage\|handleSavePassage\|handleDeletePassage\|deletePassageTarget\|savingPassageId\|deletingPassage' src/pages/admin/AdminGrammarExerciseSection.tsx`

- [ ] **Step 2: Xoá theo danh sách cụ thể**

Xoá:
- Import `ReadingPassage`, `PassageEditRow` từ `./AdminExerciseSetMedia` (giữ lại `ListeningClip`, `ClipRow`).
- State: `passages`, `savingPassageId`, `deletePassageTarget`, `deletingPassage`.
- Nhánh `else if (category === "doc") { ... }` trong `fetchMedia`.
- Hàm `handleAddPassage`, `handleSavePassage`, `handleDeletePassage`.
- Nhánh JSX render danh sách văn bản (`category === "doc" &&`, khoảng dòng ~1410 theo khảo sát ban đầu — xác nhận lại bằng grep Step 1) và modal xoá văn bản liên quan.
- Trong JSX chọn "media cho bộ bài tập mới" (dòng ~1080-1490 theo khảo sát ban đầu): xoá nhánh `category === "doc"` khỏi các biểu thức 3 ngôi (`category === "nghe" ? ... : category === "doc" ? ... : ...` → rút gọn lại đúng 2 nhánh còn `nghe`/mặc định).
- Đổi type prop: `category: "nguphap" | "nghe" | "doc"` → `category: "nguphap" | "nghe"`.

- [ ] **Step 2b: Sửa `AdminQuizSection.tsx` truyền `activeTab` đúng type mới**

`activeTab` hiện là `"nguphap" | "nghe" | "doc"` (dùng cho cả tab UI lẫn prop `category`). Sau khi Step 2 thu hẹp `category` xuống 2 giá trị, nhánh `{activeTab === "doc" ? ... : <AdminGrammarExerciseSection category={activeTab} />}` (Task 9) sẽ tự đúng type vì TypeScript narrow được `activeTab` xuống `"nguphap" | "nghe"` trong nhánh `else` — không cần sửa gì thêm, chỉ cần `npm run lint` xác nhận không còn lỗi type ở đây.

- [ ] **Step 3: `npm run lint`, xác nhận không còn lỗi type/unused-import**

- [ ] **Step 4: Chạy full test suite, xác nhận không vỡ test nào liên quan `grammarExerciseForm`/`AdminGrammarExerciseSection`**

Run: `npx tsx --test $(find src supabase -iname "*.test.ts" -o -iname "*.test.tsx" | grep -v node_modules)`
Expected: PASS toàn bộ (không test nào đụng trực tiếp code vừa xoá, vì code cũ chưa từng có test riêng).

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminGrammarExerciseSection.tsx
git commit -m "chore(admin): dọn code chết category=doc khỏi AdminGrammarExerciseSection"
```

---

## Task 11: Xác minh cuối + GitNexus + tổng kết

**Files:** không tạo/sửa file mới — chỉ chạy kiểm tra.

- [ ] **Step 1: `npm run lint` toàn repo**

Expected: PASS, 0 lỗi.

- [ ] **Step 2: Full test suite**

Run: `npx tsx --test $(find src supabase -iname "*.test.ts" -o -iname "*.test.tsx" | grep -v node_modules)`
Expected: PASS toàn bộ (bao gồm ~20+ test mới trong `readingExerciseForm.test.ts`).

- [ ] **Step 3: `mcp__gitnexus__detect_changes` (scope compare, base_ref main)**

Xem lại risk_level và các process bị ảnh hưởng — báo cáo cho user nếu có CRITICAL/HIGH ngoài dự kiến (dự kiến: breadth cao ở `AdminQuizSection`/`AdminGrammarExerciseSection` do đổi wiring, không phải thay đổi logic chấm điểm — Phase 6b chưa đụng tới `grammar-submit`).

- [ ] **Step 4: Ghi chú các việc không làm ở Phase 6a (để không quên khi làm 6b hoặc bản nâng cấp sau)**

Không code — chỉ liệt kê trong message cuối cùng gửi user:
- Sắp xếp (nhóm câu hỏi / câu hỏi con / nhận định) dùng nút mũi tên lên-xuống, không kéo-thả — riêng sắp xếp option A/B/C trong 1 câu hỏi con thì bỏ hẳn (Task 7 đã ghi chú lý do).
- Trang học viên làm bài + chấm điểm (Phase 6b).
- `npm run gen:types` qua Supabase CLI local — Task 1 dùng MCP thay thế vì sandbox không có `.env.local`/CLI.

- [ ] **Step 5: Test thủ công trên browser — liệt kê cho user tự làm (sandbox không có `.env.local`, không tự đăng nhập admin được)**

- Vào Admin → Bài tập → tab Đọc → tạo văn bản mới, paste ảnh, xem preview markdown.
- Tạo nhóm bài mới, thêm nhóm câu hỏi richtig_falsch: thêm/xoá/sửa/sắp xếp (mũi tên lên-xuống) nhận định, chọn Richtig/Falsch, lưu, mở lại xác nhận không mất dữ liệu lẫn thứ tự.
- Tạo nhóm câu hỏi multiple_choice: thêm/sắp xếp câu hỏi con, thêm ảnh, thêm/xoá option, chọn đáp án đúng, lưu, mở lại xác nhận đúng đáp án đã chọn (không lệch index sau khi xoá option ở giữa).
- Tạo ≥3 nhóm câu hỏi trong 1 nhóm bài, dùng mũi tên lên-xuống ở danh sách để đổi thứ tự, reload trang xác nhận thứ tự mới được giữ.
- Bấm Preview, xác nhận click Richtig/Falsch hoặc chọn option hoạt động (chỉ local, không lưu).
- Xoá 1 văn bản đang được nhóm câu hỏi tham chiếu → xác nhận nhóm câu hỏi đó biến mất khỏi danh sách (cascade).
- Publish/nháp nhóm bài qua badge trạng thái → xác nhận đổi trạng thái đúng.

- [ ] **Step 6: Push (chỉ khi user xác nhận)**

Không tự `git push` — theo Git Safety Protocol, hỏi user trước khi push loạt commit của plan này lên `origin/main`.
