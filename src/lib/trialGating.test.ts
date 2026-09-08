import assert from "node:assert/strict";
import test from "node:test";
import {
  isEffectivelyTrial,
  isExpiredAccess,
  isFeatureLocked,
  isSubscriptionExpired,
  isTrialAccess,
} from "./trialGating";

const TODAY = "2026-09-04";

test("admin never trial/expired/locked", () => {
  assert.equal(isTrialAccess("admin", null, TODAY), false);
  assert.equal(isExpiredAccess("admin", "2026-09-01", TODAY), false);
  assert.equal(isFeatureLocked("admin", null, "leaderboard", TODAY), false);
  assert.equal(isFeatureLocked("admin", null, "meetings", TODAY), false);
});

test("null end → trial access", () => {
  assert.equal(isTrialAccess("user", null, TODAY), true);
  assert.equal(isTrialAccess("trial", null, TODAY), true);
  assert.equal(isExpiredAccess("user", null, TODAY), false);
  assert.equal(isFeatureLocked("user", null, "meetings", TODAY), true);
});

test("past end → expired, not trial", () => {
  assert.equal(isTrialAccess("user", "2026-09-01", TODAY), false);
  assert.equal(isExpiredAccess("user", "2026-09-01", TODAY), true);
  assert.equal(isEffectivelyTrial("user", "2026-09-01", TODAY), false);
  assert.equal(isFeatureLocked("user", "2026-09-01", "help", TODAY), true);
  assert.equal(isFeatureLocked("user", "2026-09-01", "meetings", TODAY), true);
});

test("future end → neither", () => {
  assert.equal(isTrialAccess("user", "2026-12-31", TODAY), false);
  assert.equal(isExpiredAccess("user", "2026-12-31", TODAY), false);
  assert.equal(isFeatureLocked("user", "2026-12-31", "packages", TODAY), false);
  assert.equal(isFeatureLocked("user", "2026-12-31", "meetings", TODAY), false);
});

test("trial role locks meetings even with future end", () => {
  assert.equal(isFeatureLocked("trial", "2026-12-31", "meetings", TODAY), true);
  assert.equal(isFeatureLocked("trial", "2026-12-31", "help", TODAY), true);
});

test("stale JWT role=trial with active end → not locked", () => {
  assert.equal(isTrialAccess("trial", "2026-12-31", TODAY), false);
  assert.equal(isExpiredAccess("trial", "2026-12-31", TODAY), false);
  assert.equal(isFeatureLocked("trial", "2026-12-31", "leaderboard", TODAY), false);
});

test("isSubscriptionExpired calendar past", () => {
  assert.equal(isSubscriptionExpired("2026-09-03", TODAY), true);
  assert.equal(isSubscriptionExpired(null, TODAY), false);
});
