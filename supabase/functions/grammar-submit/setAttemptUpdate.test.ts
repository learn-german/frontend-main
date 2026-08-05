import assert from "node:assert/strict";
import test from "node:test";
import { computeSetAttemptUpdate, type ExistingSetAttempt } from "./setAttemptUpdate.ts";

const XP = 30;

test("lần đầu đúng 4/5 (80%) thì pass, không reveal, được XP", () => {
  const r = computeSetAttemptUpdate(null, 4, 5, XP);
  assert.deepEqual(r, {
    score: 80, bestScore: 80, attemptCount: 1,
    isPassed: true, revealed: false, xpEarned: XP,
  });
});

test("lần đầu đúng 5/5 (100%) thì pass và reveal ngay, được XP", () => {
  const r = computeSetAttemptUpdate(null, 5, 5, XP);
  assert.deepEqual(r, {
    score: 100, bestScore: 100, attemptCount: 1,
    isPassed: true, revealed: true, xpEarned: XP,
  });
});

test("lần đầu đúng 3/5 (60%) thì chưa đạt, không reveal, không XP", () => {
  const r = computeSetAttemptUpdate(null, 3, 5, XP);
  assert.deepEqual(r, {
    score: 60, bestScore: 60, attemptCount: 1,
    isPassed: false, revealed: false, xpEarned: 0,
  });
});

test("lần 4 đúng 4/5 (80%) thì pass, không reveal, cho tiếp tục", () => {
  const existing: ExistingSetAttempt = {
    bestScore: 60, attemptCount: 3, isPassed: false, revealed: false,
  };
  const r = computeSetAttemptUpdate(existing, 4, 5, XP);
  assert.equal(r.attemptCount, 4);
  assert.equal(r.isPassed, true);
  assert.equal(r.revealed, false);
  assert.equal(r.xpEarned, XP);
});

test("lần 5 đúng 3/5 (60%) thì chưa đạt nhưng reveal (đủ 5 lần), không cho tiếp tục", () => {
  const existing: ExistingSetAttempt = {
    bestScore: 60, attemptCount: 4, isPassed: false, revealed: false,
  };
  const r = computeSetAttemptUpdate(existing, 3, 5, XP);
  assert.equal(r.attemptCount, 5);
  assert.equal(r.isPassed, false);
  assert.equal(r.revealed, true);
  assert.equal(r.xpEarned, 0);
});

test("lần 6 đúng 4/5 (80%) thì pass, lời giải vẫn mở (đã reveal từ lần 5), cho tiếp tục", () => {
  const existing: ExistingSetAttempt = {
    bestScore: 60, attemptCount: 5, isPassed: false, revealed: true,
  };
  const r = computeSetAttemptUpdate(existing, 4, 5, XP);
  assert.equal(r.attemptCount, 6);
  assert.equal(r.isPassed, true);
  assert.equal(r.revealed, true);
  assert.equal(r.xpEarned, XP);
});

test("đã pass rồi, làm lại điểm thấp hơn: best_score không hạ, isPassed vẫn giữ true (sticky), không mất XP thêm", () => {
  const existing: ExistingSetAttempt = {
    bestScore: 90, attemptCount: 1, isPassed: true, revealed: false,
  };
  const r = computeSetAttemptUpdate(existing, 2, 5, XP);
  assert.equal(r.bestScore, 90);
  assert.equal(r.isPassed, true);
  assert.equal(r.xpEarned, 0);
});

test("isPassed sticky: từng đạt 80% ở lần 1, lần 2 rớt xuống 40% thì vẫn tính là đã Pass", () => {
  const existing: ExistingSetAttempt = {
    bestScore: 80, attemptCount: 1, isPassed: true, revealed: false,
  };
  const r = computeSetAttemptUpdate(existing, 2, 5, XP);
  assert.equal(r.score, 40);
  assert.equal(r.bestScore, 80);
  assert.equal(r.isPassed, true);
  assert.equal(r.xpEarned, 0, "không thưởng XP lại vì đã Pass từ trước");
});

test("77.78% (7/9) không được làm tròn thành pass — BR-02", () => {
  const r = computeSetAttemptUpdate(null, 7, 9, XP);
  assert.equal(r.score, 78);
  assert.equal(r.isPassed, false);
});
