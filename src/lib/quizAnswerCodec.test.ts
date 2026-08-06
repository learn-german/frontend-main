import assert from "node:assert/strict";
import test from "node:test";
import { joinBlankAnswers, splitBlankAnswers, serializeMatching, parseMatching, countBlankTokens } from "./quizAnswerCodec";

test("joinBlankAnswers: ghép và trim từng ô", () => {
  assert.equal(joinBlankAnswers([" bin ", "Bin"]), "bin|Bin");
});

test("splitBlankAnswers: tách đúng số ô, thiếu thì điền rỗng", () => {
  assert.deepEqual(splitBlankAnswers("bin|falsch", 2), ["bin", "falsch"]);
  assert.deepEqual(splitBlankAnswers("bin", 2), ["bin", ""]);
  assert.deepEqual(splitBlankAnswers("", 2), ["", ""]);
});

test("serializeMatching: sort theo de để ổn định", () => {
  assert.equal(
    serializeMatching({ "die Lampe": "cái đèn", "der Tisch": "cái bàn" }),
    "der Tisch:cái bàn|die Lampe:cái đèn",
  );
});

test("parseMatching: tách map de->vi, bỏ qua cặp hỏng", () => {
  assert.deepEqual(parseMatching("der Tisch:cái bàn|die Lampe:cái đèn"), {
    "der Tisch": "cái bàn",
    "die Lampe": "cái đèn",
  });
  assert.deepEqual(parseMatching(""), {});
  assert.deepEqual(parseMatching("hỏng"), {});
});

test("countBlankTokens: đếm đúng số {{blank}} trong prompt", () => {
  assert.equal(countBlankTokens("Ich {{blank}} und du {{blank}}."), 2);
  assert.equal(countBlankTokens("Không có ô trống."), 0);
});
