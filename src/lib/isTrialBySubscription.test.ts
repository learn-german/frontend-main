import assert from "node:assert/strict";
import test from "node:test";
import {
  addCalendarDaysIso,
  isExpiredBySubscription,
  isTrialBySubscription,
  subscriptionDaysRemaining,
} from "./isTrialBySubscription";

const TODAY = "2026-09-04";

test("null → trial", () => {
  assert.equal(isTrialBySubscription(null, TODAY), true);
});

test("empty / whitespace → trial", () => {
  assert.equal(isTrialBySubscription("", TODAY), true);
  assert.equal(isTrialBySubscription("   ", TODAY), true);
});

test("past date → NOT trial", () => {
  assert.equal(isTrialBySubscription("2026-09-03", TODAY), false);
});

test("today → not trial", () => {
  assert.equal(isTrialBySubscription("2026-09-04", TODAY), false);
});

test("future date → not trial", () => {
  assert.equal(isTrialBySubscription("2026-12-31", TODAY), false);
});

test("past date → expired", () => {
  assert.equal(isExpiredBySubscription("2026-09-03", TODAY), true);
});

test("null → not expired", () => {
  assert.equal(isExpiredBySubscription(null, TODAY), false);
});

test("today → not expired", () => {
  assert.equal(isExpiredBySubscription("2026-09-04", TODAY), false);
});

test("days remaining: active", () => {
  assert.equal(subscriptionDaysRemaining("2026-09-14", TODAY), 10);
});

test("days remaining: trial / expired → null", () => {
  assert.equal(subscriptionDaysRemaining(null, TODAY), null);
  assert.equal(subscriptionDaysRemaining("2026-09-03", TODAY), null);
});

test("addCalendarDaysIso +90", () => {
  assert.equal(addCalendarDaysIso("2026-09-04", 90), "2026-12-03");
});
