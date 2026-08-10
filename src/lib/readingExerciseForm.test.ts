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
