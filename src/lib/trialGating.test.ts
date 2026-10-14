import assert from "node:assert/strict";
import test from "node:test";
import {
  capTrialLessonStatuses,
  getTrialLessonLimit,
  trialDeepLinkDecision,
  getUnlockedLevels,
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

test("tutor never trial/expired/locked", () => {
  assert.equal(isTrialAccess("tutor", null, TODAY), false);
  assert.equal(isExpiredAccess("tutor", "2026-09-01", TODAY), false);
  assert.equal(isFeatureLocked("tutor", null, "leaderboard", TODAY), false);
  assert.equal(isFeatureLocked("tutor", null, "meetings", TODAY), false);
});

test("admin unlocks every level regardless of profile", () => {
  assert.deepEqual(getUnlockedLevels("admin", null, [], TODAY), ["A1", "A2", "B1", "B2"]);
  assert.deepEqual(getUnlockedLevels("admin", "2026-09-01", ["A1"], TODAY), ["A1", "A2", "B1", "B2"]);
});

test("tutor unlocks every level regardless of profile", () => {
  assert.deepEqual(getUnlockedLevels("tutor", null, [], TODAY), ["A1", "A2", "B1", "B2"]);
  assert.deepEqual(getUnlockedLevels("tutor", "2026-09-01", ["A1"], TODAY), ["A1", "A2", "B1", "B2"]);
});

test("trial unlocks only A1; paid user keeps profile levels", () => {
  assert.deepEqual(getUnlockedLevels("user", null, ["A1", "A2"], TODAY), ["A1"]);
  assert.deepEqual(getUnlockedLevels("user", "2026-12-31", ["A1", "A2"], TODAY), ["A1", "A2"]);
});

test("null end → trial access", () => {
  assert.equal(isTrialAccess("user", null, TODAY), true);
  assert.equal(isTrialAccess("trial", null, TODAY), true);
  assert.equal(isExpiredAccess("user", null, TODAY), false);
  assert.equal(isFeatureLocked("user", null, "meetings", TODAY), true);
  assert.equal(isFeatureLocked("user", null, "packages", TODAY), false);
});

test("past end → expired, not trial", () => {
  assert.equal(isTrialAccess("user", "2026-09-01", TODAY), false);
  assert.equal(isExpiredAccess("user", "2026-09-01", TODAY), true);
  assert.equal(isEffectivelyTrial("user", "2026-09-01", TODAY), false);
  assert.equal(isFeatureLocked("user", "2026-09-01", "help", TODAY), true);
  assert.equal(isFeatureLocked("user", "2026-09-01", "meetings", TODAY), true);
  assert.equal(isFeatureLocked("user", "2026-09-01", "packages", TODAY), true);
});

test("future end → neither", () => {
  assert.equal(isTrialAccess("user", "2026-12-31", TODAY), false);
  assert.equal(isExpiredAccess("user", "2026-12-31", TODAY), false);
  assert.equal(isFeatureLocked("user", "2026-12-31", "packages", TODAY), false);
  assert.equal(isFeatureLocked("user", "2026-12-31", "meetings", TODAY), false);
});

test("stale JWT role=trial with future end does not lock meetings/help", () => {
  // Gating follows subscription_end_date, not JWT role label.
  assert.equal(isFeatureLocked("trial", "2026-12-31", "meetings", TODAY), false);
  assert.equal(isFeatureLocked("trial", "2026-12-31", "help", TODAY), false);
});

test("stale JWT role=trial with active end → not locked", () => {
  assert.equal(isTrialAccess("trial", "2026-12-31", TODAY), false);
  assert.equal(isExpiredAccess("trial", "2026-12-31", TODAY), false);
  assert.equal(isFeatureLocked("trial", "2026-12-31", "leaderboard", TODAY), false);
});

test("trial keeps the first 3 sequential statuses and locks the rest", () => {
  assert.equal(getTrialLessonLimit(), 3);
  const ids = ["l1", "l2", "l3", "l4"];
  const capped = capTrialLessonStatuses(ids, {
    l1: "completed",
    l2: "current",
    l3: "locked",
    l4: "current",
  });
  assert.deepEqual(capped, {
    l1: "completed",
    l2: "current",
    l3: "locked",
    l4: "locked",
  });
});

test("trial deep link waits while the catalog is still empty", () => {
  assert.equal(trialDeepLinkDecision("a1-l24", [], []), "wait");
  assert.equal(trialDeepLinkDecision("a1-l24", ["a1-l24", "a1-l2", "a1-l3", "a1-l4"], ["a1-l24", "a1-l2", "a1-l3", "a1-l4"]), "allow");
  assert.equal(trialDeepLinkDecision("a1-l4", ["a1-l24", "a1-l2", "a1-l3", "a1-l4"], ["a1-l24", "a1-l2", "a1-l3", "a1-l4"]), "block");
  assert.equal(trialDeepLinkDecision("a2-l1", ["a1-l24"], ["a1-l24", "a2-l1"]), "block");
});

test("isSubscriptionExpired calendar past", () => {
  assert.equal(isSubscriptionExpired("2026-09-03", TODAY), true);
  assert.equal(isSubscriptionExpired(null, TODAY), false);
});
