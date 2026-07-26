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
  ...over,
});

test("fill: accepts a configured answer independent of a word bank", () => {
  const r = computeGrammarScore([fill()], { f1: JSON.stringify(["LERNE"]) });
  assert.deepEqual(r, { correct: 1, total: 1, score: 100, blankResults: { f1: [true] } });
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
  assert.deepEqual(r, { correct: 2, total: 3, score: 67, blankResults: { f1: [true, false, true] } });
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
