import assert from "node:assert/strict";
import test from "node:test";
import { serializeMatching, parseMatching } from "./quizAnswerCodec";

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
