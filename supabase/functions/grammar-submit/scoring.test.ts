import assert from "node:assert/strict";
import test from "node:test";
import { computeGrammarScore, type ScorableGrammarExercise } from "./scoring.ts";

const translation = (over: Partial<ScorableGrammarExercise> = {}): ScorableGrammarExercise => ({
  id: "t1",
  type: "translation",
  correct_answer: "Ich lerne Deutsch",
  acceptable_answers: null,
  classification_items: null,
  blanks: null,
  options: null,
  ...over,
});

test("translation: matches the primary correct_answer", () => {
  const r = computeGrammarScore([translation()], { t1: "ich lerne deutsch." });
  assert.equal(r.correct, 1);
  assert.equal(r.total, 1);
});

test("translation: matches any acceptable alternative", () => {
  const ex = translation({ acceptable_answers: ["Ich studiere Deutsch", "Ich lerne die deutsche Sprache"] });
  const r = computeGrammarScore([ex], { t1: "Ich studiere Deutsch" });
  assert.equal(r.correct, 1);
});

test("translation: an unrelated answer is wrong", () => {
  const ex = translation({ acceptable_answers: ["Ich studiere Deutsch"] });
  const r = computeGrammarScore([ex], { t1: "Ich spiele Fußball" });
  assert.equal(r.correct, 0);
});

test("translation: empty/absent acceptable_answers still grades against correct_answer only", () => {
  const r = computeGrammarScore([translation({ acceptable_answers: [] })], { t1: "Ich lerne Deutsch" });
  assert.equal(r.correct, 1);
});

const fill = (over: Partial<ScorableGrammarExercise> = {}): ScorableGrammarExercise => ({
  id: "f1",
  type: "fill_in_the_blank",
  correct_answer: null,
  acceptable_answers: null,
  classification_items: null,
  blanks: [{ acceptedAnswers: ["lerne"] }],
  options: null,
  ...over,
});

test("fill: accepts a configured answer independent of a word bank", () => {
  const r = computeGrammarScore([fill()], { f1: JSON.stringify(["LERNE"]) });
  assert.deepEqual(r, {
    correct: 1,
    total: 1,
    score: 100,
    blankResults: { f1: [true] },
    choiceResults: {},
    exerciseResults: { f1: true },
  });
});

test("fill: accepts alternatives and collapses whitespace", () => {
  const ex = fill({ blanks: [{ acceptedAnswers: ["in der Schule", "zu Hause"] }] });
  const r = computeGrammarScore([ex], { f1: JSON.stringify(["  IN   DER schule "]) });
  assert.deepEqual(r.blankResults.f1, [true]);
});

test("fill: does not fold German Unicode", () => {
  const ex = fill({ blanks: [{ acceptedAnswers: ["für"] }] });
  const r = computeGrammarScore([ex], { f1: JSON.stringify(["fur"]) });
  assert.deepEqual(r.blankResults.f1, [false]);
});

test("fill: grades every blank independently", () => {
  const ex = fill({
    blanks: [
      { acceptedAnswers: ["Das"] },
      { acceptedAnswers: ["der"] },
      { acceptedAnswers: ["teuer"] },
    ],
  });
  const r = computeGrammarScore([ex], { f1: JSON.stringify(["das", "die", "teuer"]) });
  assert.deepEqual(r, {
    correct: 2,
    total: 3,
    score: 67,
    blankResults: { f1: [true, false, true] },
    choiceResults: {},
    exerciseResults: { f1: false },
  });
});

test("fill: missing entries and invalid JSON are wrong without crashing", () => {
  const ex = fill({ blanks: [{ acceptedAnswers: ["a"] }, { acceptedAnswers: ["b"] }] });
  assert.deepEqual(computeGrammarScore([ex], { f1: JSON.stringify(["a"]) }).blankResults.f1, [true, false]);
  assert.deepEqual(computeGrammarScore([ex], { f1: "not-json" }).blankResults.f1, [false, false]);
});

test("fill: parsed non-arrays and non-string entries are wrong without crashing", () => {
  const ex = fill({ blanks: [{ acceptedAnswers: ["a"] }, { acceptedAnswers: ["b"] }] });
  for (const answer of ["null", "{}", JSON.stringify("a")]) {
    assert.deepEqual(computeGrammarScore([ex], { f1: answer }).blankResults.f1, [false, false]);
  }
  assert.deepEqual(computeGrammarScore([ex], { f1: JSON.stringify(["a", 2]) }).blankResults.f1, [true, false]);
});

test("fill: malformed blanks are ignored defensively", () => {
  for (const blanks of [null, [], [{}], [{ acceptedAnswers: null }]] as unknown as ScorableGrammarExercise["blanks"][]) {
    const r = computeGrammarScore([fill({ blanks })], { f1: JSON.stringify(["a"]) });
    assert.equal(r.correct, 0);
    assert.deepEqual(r.blankResults.f1, blanks && blanks.length > 0 ? [false] : []);
  }
});

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

test("multiple_choice: giá trị answer không phải chuỗi (vd. number) bị tính sai, không throw", () => {
  // body.answers không được validate ở index.ts — client có thể gửi number thay vì string.
  // Ép kiểu qua đúng entry point (Record<string, string>) như request thật sự sẽ đi qua.
  const answers = { c1: 2 } as unknown as Record<string, string>;
  assert.doesNotThrow(() => computeGrammarScore([choice()], answers));
  const r = computeGrammarScore([choice()], answers);
  assert.equal(r.correct, 0);
  assert.deepEqual(r.choiceResults, { c1: false });
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

const reorder = (over: Partial<ScorableGrammarExercise> = {}): ScorableGrammarExercise => ({
  id: "w1",
  type: "word_reorder",
  correct_answer: "Ich lerne Deutsch",
  acceptable_answers: null,
  classification_items: null,
  blanks: null,
  options: null,
  ...over,
});

const classify = (over: Partial<ScorableGrammarExercise> = {}): ScorableGrammarExercise => ({
  id: "c1",
  type: "classification",
  correct_answer: null,
  acceptable_answers: null,
  classification_items: [
    { item: "der Tisch", group: "maskulin" },
    { item: "die Lampe", group: "feminin" },
  ],
  blanks: null,
  options: null,
  ...over,
});

test("exerciseResults: loại text được chấm đúng/sai theo từng bài", () => {
  const r = computeGrammarScore([reorder()], { w1: "Ich lerne Deutsch" });
  assert.equal(r.exerciseResults.w1, true);

  const wrong = computeGrammarScore([reorder()], { w1: "Deutsch lerne Ich" });
  assert.equal(wrong.exerciseResults.w1, false);
});

test("exerciseResults: translation chấp nhận acceptable_answers", () => {
  const ex = translation({ acceptable_answers: ["Ich studiere Deutsch"] });
  const r = computeGrammarScore([ex], { t1: "Ich studiere Deutsch" });
  assert.equal(r.exerciseResults.t1, true);
});

test("exerciseResults: classification chỉ true khi mọi item đúng", () => {
  const allRight = computeGrammarScore([classify()], {
    c1: "der Tisch:maskulin|die Lampe:feminin",
  });
  assert.equal(allRight.exerciseResults.c1, true);
  assert.equal(allRight.correct, 2);

  const partial = computeGrammarScore([classify()], {
    c1: "der Tisch:maskulin|die Lampe:maskulin",
  });
  assert.equal(partial.exerciseResults.c1, false);
  assert.equal(partial.correct, 1);
});

test("exerciseResults: fill_in_the_blank chỉ true khi mọi blank đúng", () => {
  const ex = fill();
  const results = computeGrammarScore([ex], { f1: JSON.stringify(["ein", "eine"]) });
  assert.equal(results.exerciseResults.f1, results.blankResults.f1.every(Boolean));
});

test("exerciseResults: multiple_choice khớp choiceResults", () => {
  const ex: ScorableGrammarExercise = {
    id: "m1",
    type: "multiple_choice",
    correct_answer: "1",
    acceptable_answers: null,
    classification_items: null,
    blanks: null,
    options: ["a", "b", "c"],
  };
  const r = computeGrammarScore([ex], { m1: "1" });
  assert.equal(r.exerciseResults.m1, true);
  assert.equal(r.exerciseResults.m1, r.choiceResults.m1);
});

test("exerciseResults: có key cho mọi bài được chấm", () => {
  const r = computeGrammarScore([translation(), reorder(), classify()], {});
  assert.deepEqual(Object.keys(r.exerciseResults).sort(), ["c1", "t1", "w1"]);
});
