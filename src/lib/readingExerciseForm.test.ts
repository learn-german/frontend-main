import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyReadingForm,
  addStatement,
  removeStatement,
  setStatementText,
  setStatementAnswer,
  moveStatement,
  addSubQuestion,
  removeSubQuestion,
  setSubQuestionField,
  setSubQuestionOptions,
  moveSubQuestion,
  validateReadingForm,
  buildReadingPayload,
  parseReadingRow,
  type ReadingQuestionGroupForm,
} from "./readingExerciseForm";
import { addOption } from "./grammarMultipleChoice";

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
  let form: ReadingQuestionGroupForm = { ...createEmptyReadingForm(), passageId: "p1", questionType: "multiple_choice" as const };
  form = addSubQuestion(form);
  const id = form.subQuestions[0].id;
  form = setSubQuestionField(form, id, "question", "Was ist das?");
  form = setSubQuestionOptions(form, id, { options: ["A", "B", "C"], correctIndex: -1 });
  assert.equal(validateReadingForm(form), "Mỗi câu hỏi cần đủ phương án và đáp án đúng.");
});

test("validateReadingForm: multiple_choice đủ điều kiện thì không lỗi", () => {
  let form: ReadingQuestionGroupForm = { ...createEmptyReadingForm(), passageId: "p1", questionType: "multiple_choice" as const };
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
  let form: ReadingQuestionGroupForm = { ...createEmptyReadingForm(), passageId: "p1", questionType: "multiple_choice" as const };
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
