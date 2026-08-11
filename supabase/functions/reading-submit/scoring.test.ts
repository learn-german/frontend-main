import assert from "node:assert/strict";
import test from "node:test";
import {
  itemKeys,
  projectAnswers,
  computeReadingScore,
  deriveCorrectAnswers,
  deriveExplanations,
  type ScorableReadingGroup,
} from "./scoring.ts";

const richtigFalschGroup = (over: Partial<ScorableReadingGroup> = {}): ScorableReadingGroup => ({
  id: "g1",
  question_type: "richtig_falsch",
  statements: [
    { correct_answer: "richtig" },
    { correct_answer: "falsch" },
  ],
  sub_questions: null,
  ...over,
});

const multipleChoiceGroup = (over: Partial<ScorableReadingGroup> = {}): ScorableReadingGroup => ({
  id: "g2",
  question_type: "multiple_choice",
  statements: null,
  sub_questions: [
    { correct_option_id: "1" },
    { correct_option_id: "0" },
  ],
  ...over,
});

test("itemKeys: richtig_falsch sinh đúng số key theo statements", () => {
  assert.deepEqual(itemKeys(richtigFalschGroup()), ["g1:0", "g1:1"]);
});

test("itemKeys: multiple_choice sinh đúng số key theo sub_questions", () => {
  assert.deepEqual(itemKeys(multipleChoiceGroup()), ["g2:0", "g2:1"]);
});

test("computeReadingScore: chấm đúng từng item, tổng hợp correct/total/score", () => {
  const groups = [richtigFalschGroup()];
  const result = computeReadingScore(groups, { "g1:0": "richtig", "g1:1": "richtig" });
  assert.equal(result.total, 2);
  assert.equal(result.correct, 1);
  assert.equal(result.score, 50);
  assert.deepEqual(result.itemResults, { "g1:0": true, "g1:1": false });
});

test("computeReadingScore: gộp điểm nhiều nhóm câu hỏi khác dạng trong 1 set", () => {
  const groups = [richtigFalschGroup(), multipleChoiceGroup()];
  const result = computeReadingScore(groups, {
    "g1:0": "richtig",
    "g1:1": "falsch",
    "g2:0": "1",
    "g2:1": "0",
  });
  assert.equal(result.total, 4);
  assert.equal(result.correct, 4);
  assert.equal(result.score, 100);
});

test("computeReadingScore: thiếu answer cho 1 item thì tính sai (không throw)", () => {
  const result = computeReadingScore([richtigFalschGroup()], { "g1:0": "richtig" });
  assert.equal(result.correct, 1);
  assert.equal(result.itemResults["g1:1"], false);
});

test("computeReadingScore: set rỗng (không nhóm nào) trả total=0, score=0", () => {
  const result = computeReadingScore([], {});
  assert.equal(result.total, 0);
  assert.equal(result.score, 0);
});

test("projectAnswers: chỉ giữ lại key hợp lệ suy từ groups đã load, bỏ key lạ", () => {
  const groups = [richtigFalschGroup()];
  const projected = projectAnswers(groups, { "g1:0": "richtig", "unknown-key": "richtig", "g1:1": "falsch" });
  assert.deepEqual(projected, { "g1:0": "richtig", "g1:1": "falsch" });
});

test("projectAnswers: ép giá trị không phải chuỗi thành chuỗi rỗng thay vì throw", () => {
  const groups = [richtigFalschGroup()];
  const projected = projectAnswers(groups, { "g1:0": 123 as unknown as string, "g1:1": null as unknown as string });
  assert.deepEqual(projected, { "g1:0": "", "g1:1": "" });
});

test("projectAnswers: cắt bớt giá trị dài quá mức thay vì lưu nguyên", () => {
  const groups = [richtigFalschGroup()];
  const projected = projectAnswers(groups, { "g1:0": "a".repeat(500), "g1:1": "falsch" });
  assert.equal(projected["g1:0"].length, 20);
});

test("projectAnswers: answers null/undefined không throw, trả rỗng cho mọi key hợp lệ", () => {
  const groups = [richtigFalschGroup()];
  assert.deepEqual(projectAnswers(groups, null), { "g1:0": "", "g1:1": "" });
  assert.deepEqual(projectAnswers(groups, undefined), { "g1:0": "", "g1:1": "" });
});

test("deriveCorrectAnswers: trả đúng đáp án theo khoá group:index cho cả 2 dạng", () => {
  const groups = [richtigFalschGroup(), multipleChoiceGroup()];
  assert.deepEqual(deriveCorrectAnswers(groups), {
    "g1:0": "richtig",
    "g1:1": "falsch",
    "g2:0": "1",
    "g2:1": "0",
  });
});

test("deriveExplanations: 1 explanation/nhóm, không phải theo item", () => {
  const groups = [{ id: "g1", explanation: "vì..." }, { id: "g2", explanation: null }];
  assert.deepEqual(deriveExplanations(groups), { g1: "vì...", g2: "" });
});
