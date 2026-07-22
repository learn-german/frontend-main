import assert from "node:assert/strict";
import test from "node:test";
import {
  GRAMMAR_EXERCISE_HINT_MAX_LENGTH,
  normalizeGrammarHint,
  validateGrammarHint,
} from "./grammarExerciseHint";

test("normalizes empty and whitespace-only hints to null", () => {
  assert.equal(normalizeGrammarHint(""), null);
  assert.equal(normalizeGrammarHint("  \n\t  "), null);
});

test("preserves significant multiline hint content exactly", () => {
  const hint = "  Nhớ chia động từ.\nKiểm tra vị trí của chủ ngữ.  ";

  assert.equal(normalizeGrammarHint(hint), hint);
});

test("accepts a hint with exactly 1,000 characters", () => {
  const hint = "a".repeat(GRAMMAR_EXERCISE_HINT_MAX_LENGTH);

  assert.equal(validateGrammarHint(hint), null);
});

test("rejects a hint over 1,000 characters with a clear message", () => {
  const hint = "a".repeat(GRAMMAR_EXERCISE_HINT_MAX_LENGTH + 1);

  assert.equal(validateGrammarHint(hint), "Gợi ý không được vượt quá 1.000 ký tự.");
});
