import type { Level } from "./appTypes";
import {
  isExpiredBySubscription,
  isTrialBySubscription,
} from "./isTrialBySubscription";

export type UserRole = "trial" | "user" | "admin" | "tutor";
export type LockedFeature = "leaderboard" | "help" | "packages" | "meetings";

export const ALL_LEVELS: Level[] = ["A1", "A2", "B1", "B2"];

const TRIAL_LESSON_LIMIT = 3;

/** Admin and tutor bypass trial/expired/sequential locks in the learner app. */
export function hasStaffLearnerAccess(role: UserRole): boolean {
  return role === "admin" || role === "tutor";
}

export function isTrialUser(role: UserRole): boolean {
  return role === "trial";
}

export function isSubscriptionExpired(
  subscriptionEndDate: string | null,
  today?: string,
): boolean {
  return isExpiredBySubscription(subscriptionEndDate, today);
}

export function isTrialAccess(
  role: UserRole,
  subscriptionEndDate: string | null,
  today?: string,
): boolean {
  // Trial = null/empty subscription_end_date only (not JWT role).
  // Staff unlock sets end_date before the learner JWT refreshes role.
  if (hasStaffLearnerAccess(role)) return false;
  return isTrialBySubscription(subscriptionEndDate, today);
}

export function isExpiredAccess(
  role: UserRole,
  subscriptionEndDate: string | null,
  today?: string,
): boolean {
  if (hasStaffLearnerAccess(role)) return false;
  if (isTrialAccess(role, subscriptionEndDate, today)) return false;
  return isExpiredBySubscription(subscriptionEndDate, today);
}

/** Trial only — does NOT include expired. */
export function isEffectivelyTrial(
  role: UserRole,
  subscriptionEndDate: string | null,
  today?: string,
): boolean {
  return isTrialAccess(role, subscriptionEndDate, today);
}

export function isFeatureLocked(
  role: UserRole,
  subscriptionEndDate: string | null,
  feature: LockedFeature,
  today?: string,
): boolean {
  // Packages stay open for trial so learners can view course offers.
  if (feature === "packages" && isTrialAccess(role, subscriptionEndDate, today)) {
    return false;
  }
  return (
    isTrialAccess(role, subscriptionEndDate, today) ||
    isExpiredAccess(role, subscriptionEndDate, today)
  );
}

export function getTrialLessonLimit(): number {
  return TRIAL_LESSON_LIMIT;
}

/**
 * Fresh /quiz and /lesson loads render once before modules arrive, while the
 * loading flag is still false. An id missing from an empty catalog is "wait",
 * not "outside the first 3".
 */
export function trialDeepLinkDecision(
  lessonId: string,
  orderedIds: readonly string[],
  catalogIds: readonly string[],
): "allow" | "wait" | "block" {
  const lessonIndex = orderedIds.indexOf(lessonId);
  if (lessonIndex >= 0) {
    return lessonIndex < TRIAL_LESSON_LIMIT ? "allow" : "block";
  }
  return catalogIds.includes(lessonId) ? "block" : "wait";
}

/**
 * Inside the trial window, lesson N stays locked until lesson N-1 is completed.
 * Everything after the window stays locked even if earlier lessons are done.
 */
export function capTrialLessonStatuses(
  orderedIds: readonly string[],
  statuses: Record<string, "completed" | "current" | "locked">,
): Record<string, "completed" | "current" | "locked"> {
  const capped: Record<string, "completed" | "current" | "locked"> = {};
  orderedIds.forEach((id, idx) => {
    if (idx >= TRIAL_LESSON_LIMIT) {
      capped[id] = "locked";
      return;
    }
    const previousDone = idx === 0 || capped[orderedIds[idx - 1]] === "completed";
    if (!previousDone) capped[id] = "locked";
    else if (statuses[id] === "completed") capped[id] = "completed";
    else capped[id] = "current";
  });
  return capped;
}

/** Levels shown on the learner roadmap. Admin sees every level. */
export function getUnlockedLevels(
  role: UserRole,
  subscriptionEndDate: string | null,
  unlockedLevels: Level[],
  today?: string,
): Level[] {
  if (hasStaffLearnerAccess(role)) return ALL_LEVELS;
  if (isTrialAccess(role, subscriptionEndDate, today)) return ["A1"];
  return unlockedLevels;
}
