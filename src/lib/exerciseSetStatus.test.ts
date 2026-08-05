import assert from "node:assert/strict";
import test from "node:test";
import { computeSetStatus } from "./exerciseSetStatus";

test("chưa có draft, chưa có attempt → not_started", () => {
  assert.equal(computeSetStatus(undefined, false), "not_started");
});

test("có draft, chưa có attempt → in_progress", () => {
  assert.equal(computeSetStatus(undefined, true), "in_progress");
});

test("có attempt chưa đạt, không draft → failed", () => {
  assert.equal(computeSetStatus({ isPassed: false }, false), "failed");
});

test("có attempt chưa đạt VÀ có draft → in_progress (draft thắng)", () => {
  assert.equal(computeSetStatus({ isPassed: false }, true), "in_progress");
});

test("có attempt đã đạt → passed, bất kể draft", () => {
  assert.equal(computeSetStatus({ isPassed: true }, false), "passed");
  assert.equal(computeSetStatus({ isPassed: true }, true), "passed");
});
