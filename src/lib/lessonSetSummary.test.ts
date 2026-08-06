import assert from "node:assert/strict";
import test from "node:test";
import { summarizeAttempts } from "./lessonSetSummary";

test("chưa có attempt nào -> null", () => {
  assert.equal(summarizeAttempts(["s1", "s2"], []), null);
});

test("đếm đúng passedCount/totalCount theo set không rỗng", () => {
  const r = summarizeAttempts(
    ["s1", "s2", "s3"],
    [
      { set_id: "s1", is_passed: true, score: 100, submitted_at: "2026-08-01T10:00:00Z" },
      { set_id: "s2", is_passed: false, score: 60, submitted_at: "2026-08-02T10:00:00Z" },
    ],
  );
  assert.equal(r?.passedCount, 1);
  assert.equal(r?.totalCount, 3);
});

test("attempt của set không nằm trong nonEmptySetIds bị bỏ qua", () => {
  const r = summarizeAttempts(
    ["s1"],
    [
      { set_id: "s1", is_passed: true, score: 100, submitted_at: "2026-08-01T10:00:00Z" },
      { set_id: "phantom", is_passed: true, score: 100, submitted_at: "2026-08-03T10:00:00Z" },
    ],
  );
  assert.equal(r?.totalCount, 1);
  assert.equal(r?.latestScore, 100);
  assert.equal(r?.latestSubmittedAt, "2026-08-01T10:00:00Z");
});

test("latestScore/latestSubmittedAt lấy từ attempt có submitted_at lớn nhất, không phải phần tử cuối mảng", () => {
  const r = summarizeAttempts(
    ["s1", "s2"],
    [
      { set_id: "s2", is_passed: true, score: 100, submitted_at: "2026-08-05T09:00:00Z" },
      { set_id: "s1", is_passed: false, score: 40, submitted_at: "2026-08-05T15:00:00Z" },
    ],
  );
  assert.equal(r?.latestScore, 40);
  assert.equal(r?.latestSubmittedAt, "2026-08-05T15:00:00Z");
});
