import assert from "node:assert/strict";
import test from "node:test";
import {
  itemCount,
  passagesForSet,
  groupsForPassage,
  missingQuestionTypesForPassage,
  readingSetStats,
  isSingleQuestionPassage,
} from "./readingSetView";

test("itemCount: richtig_falsch đếm theo statements", () => {
  assert.equal(itemCount({ question_type: "richtig_falsch", statements: [{}, {}], sub_questions: null }), 2);
});

test("itemCount: multiple_choice đếm theo sub_questions", () => {
  assert.equal(itemCount({ question_type: "multiple_choice", statements: null, sub_questions: [{}, {}, {}] }), 3);
});

test("itemCount: mảng null coi là 0", () => {
  assert.equal(itemCount({ question_type: "richtig_falsch", statements: null, sub_questions: null }), 0);
});

test("passagesForSet: lọc đúng theo set_id, sort theo order_index", () => {
  const passages = [
    { id: "p2", set_id: "s1", order_index: 1 },
    { id: "p3", set_id: "s2", order_index: 0 },
    { id: "p1", set_id: "s1", order_index: 0 },
  ];
  const result = passagesForSet(passages, "s1");
  assert.deepEqual(result.map((p) => p.id), ["p1", "p2"]);
});

test("passagesForSet: set không có văn bản trả mảng rỗng", () => {
  assert.deepEqual(passagesForSet([{ id: "p1", set_id: "s1", order_index: 0 }], "s2"), []);
});

test("passagesForSet: set_id null không khớp bất kỳ set thật nào", () => {
  assert.deepEqual(passagesForSet([{ id: "p1", set_id: null, order_index: 0 }], "s1"), []);
});

test("groupsForPassage: lọc đúng theo passage_id, sort theo order_index", () => {
  const groups = [
    { id: "g2", passage_id: "p1", order_index: 1 },
    { id: "g3", passage_id: "p2", order_index: 0 },
    { id: "g1", passage_id: "p1", order_index: 0 },
  ];
  const result = groupsForPassage(groups, "p1");
  assert.deepEqual(result.map((g) => g.id), ["g1", "g2"]);
});

test("missingQuestionTypesForPassage: cả 2 loại chưa có -> trả cả 2", () => {
  assert.deepEqual(missingQuestionTypesForPassage([], "p1"), ["multiple_choice", "richtig_falsch"]);
});

test("missingQuestionTypesForPassage: đã có richtig_falsch -> chỉ còn multiple_choice", () => {
  const groups = [{ passage_id: "p1", question_type: "richtig_falsch" as const }];
  assert.deepEqual(missingQuestionTypesForPassage(groups, "p1"), ["multiple_choice"]);
});

test("missingQuestionTypesForPassage: nhóm của văn bản khác không ảnh hưởng", () => {
  const groups = [{ passage_id: "p2", question_type: "richtig_falsch" as const }];
  assert.deepEqual(missingQuestionTypesForPassage(groups, "p1"), ["multiple_choice", "richtig_falsch"]);
});

test("missingQuestionTypesForPassage: đủ cả 2 loại -> mảng rỗng", () => {
  const groups = [
    { passage_id: "p1", question_type: "richtig_falsch" as const },
    { passage_id: "p1", question_type: "multiple_choice" as const },
  ];
  assert.deepEqual(missingQuestionTypesForPassage(groups, "p1"), []);
});

test("readingSetStats: gộp đúng passageCount/typeCount/questionCount qua nhiều văn bản", () => {
  const passages = [{ set_id: "s1" }, { set_id: "s1" }, { set_id: "s2" }];
  const groups = [
    { set_id: "s1", question_type: "richtig_falsch" as const, statements: [{}, {}], sub_questions: null },
    { set_id: "s1", question_type: "multiple_choice" as const, statements: null, sub_questions: [{}] },
    { set_id: "s2", question_type: "richtig_falsch" as const, statements: [{}], sub_questions: null },
  ];
  const stats = readingSetStats(passages, groups, "s1");
  assert.deepEqual(stats, { passageCount: 2, typeCount: 2, questionCount: 3 });
});

test("readingSetStats: set không có gì -> toàn 0", () => {
  assert.deepEqual(readingSetStats([], [], "s1"), { passageCount: 0, typeCount: 0, questionCount: 0 });
});

test("isSingleQuestionPassage: đúng 1 nhóm multiple_choice 1 câu, title/intro rỗng -> true", () => {
  const groups = [
    { passage_id: "p1", question_type: "multiple_choice" as const, title: null, question_intro: null, sub_questions: [{}] },
  ];
  assert.equal(isSingleQuestionPassage("p1", groups), true);
});

test("isSingleQuestionPassage: passage không có nhóm nào -> false", () => {
  assert.equal(isSingleQuestionPassage("p1", []), false);
});

test("isSingleQuestionPassage: nhóm richtig_falsch -> false", () => {
  const groups = [
    { passage_id: "p1", question_type: "richtig_falsch" as const, title: null, question_intro: null, sub_questions: null },
  ];
  assert.equal(isSingleQuestionPassage("p1", groups), false);
});

test("isSingleQuestionPassage: nhóm multiple_choice nhưng 2 câu -> false", () => {
  const groups = [
    { passage_id: "p1", question_type: "multiple_choice" as const, title: null, question_intro: null, sub_questions: [{}, {}] },
  ];
  assert.equal(isSingleQuestionPassage("p1", groups), false);
});

test("isSingleQuestionPassage: có title -> false", () => {
  const groups = [
    { passage_id: "p1", question_type: "multiple_choice" as const, title: "AUFGABE 1", question_intro: null, sub_questions: [{}] },
  ];
  assert.equal(isSingleQuestionPassage("p1", groups), false);
});

test("isSingleQuestionPassage: có question_intro -> false", () => {
  const groups = [
    { passage_id: "p1", question_type: "multiple_choice" as const, title: null, question_intro: "Yêu cầu...", sub_questions: [{}] },
  ];
  assert.equal(isSingleQuestionPassage("p1", groups), false);
});

test("isSingleQuestionPassage: passage có 2 nhóm -> false", () => {
  const groups = [
    { passage_id: "p1", question_type: "multiple_choice" as const, title: null, question_intro: null, sub_questions: [{}] },
    { passage_id: "p1", question_type: "richtig_falsch" as const, title: null, question_intro: null, sub_questions: null },
  ];
  assert.equal(isSingleQuestionPassage("p1", groups), false);
});

test("isSingleQuestionPassage: nhóm của passage khác không ảnh hưởng", () => {
  const groups = [
    { passage_id: "p2", question_type: "multiple_choice" as const, title: null, question_intro: null, sub_questions: [{}] },
  ];
  assert.equal(isSingleQuestionPassage("p1", groups), false);
});
