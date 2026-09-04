import assert from "node:assert/strict";
import test from "node:test";
import { isTrialBySubscription } from "./isTrialBySubscription";

const TODAY = "2026-09-04";

test("null → trial", () => {
  assert.equal(isTrialBySubscription(null, TODAY), true);
});

test("empty / whitespace → trial", () => {
  assert.equal(isTrialBySubscription("", TODAY), true);
  assert.equal(isTrialBySubscription("   ", TODAY), true);
});

test("past date → trial", () => {
  assert.equal(isTrialBySubscription("2026-09-03", TODAY), true);
});

test("today → not trial", () => {
  assert.equal(isTrialBySubscription("2026-09-04", TODAY), false);
});

test("future date → not trial", () => {
  assert.equal(isTrialBySubscription("2026-12-31", TODAY), false);
});
