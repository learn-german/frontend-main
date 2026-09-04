import {
  isExpiredBySubscription,
  isTrialBySubscription,
} from "./isTrialBySubscription";

export type UserRole = "trial" | "user" | "admin";
export type LockedFeature = "leaderboard" | "help" | "packages";

const TRIAL_LESSON_LIMIT = 1;

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
  if (role === "admin") return false;
  if (role === "trial") return true;
  return isTrialBySubscription(subscriptionEndDate, today);
}

export function isExpiredAccess(
  role: UserRole,
  subscriptionEndDate: string | null,
  today?: string,
): boolean {
  if (role === "admin") return false;
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
  void feature;
  return (
    isTrialAccess(role, subscriptionEndDate, today) ||
    isExpiredAccess(role, subscriptionEndDate, today)
  );
}

export function getTrialLessonLimit(): number {
  return TRIAL_LESSON_LIMIT;
}
