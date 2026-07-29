import assert from "node:assert/strict";
import test from "node:test";
import { computeAttemptUpdate } from "./attemptUpdate.ts";

const XP = 30;
const PASS = 80;

test("lần đầu pass thì được XP", () => {
  const r = computeAttemptUpdate(null, 90, XP, PASS);
  assert.deepEqual(r, { best_score: 90, attempt_count: 1, xp_earned: XP });
});

test("lần đầu fail thì không XP", () => {
  const r = computeAttemptUpdate(null, 50, XP, PASS);
  assert.deepEqual(r, { best_score: 50, attempt_count: 1, xp_earned: 0 });
});

test("fail lần 1 rồi pass lần 2 vẫn được XP", () => {
  const r = computeAttemptUpdate({ best_score: 50, attempt_count: 1 }, 90, XP, PASS);
  assert.deepEqual(r, { best_score: 90, attempt_count: 2, xp_earned: XP });
});

test("đã pass rồi thì pass lại không được XP nữa", () => {
  const r = computeAttemptUpdate({ best_score: 90, attempt_count: 1 }, 100, XP, PASS);
  assert.deepEqual(r, { best_score: 100, attempt_count: 2, xp_earned: 0 });
});

test("làm lại điểm thấp hơn không hạ best_score và không mất XP", () => {
  const r = computeAttemptUpdate({ best_score: 90, attempt_count: 1 }, 50, XP, PASS);
  assert.deepEqual(r, { best_score: 90, attempt_count: 2, xp_earned: 0 });
});

test("đúng ngưỡng pass được tính là pass", () => {
  const r = computeAttemptUpdate(null, PASS, XP, PASS);
  assert.equal(r.xp_earned, XP);
});
