export type UserRole = "trial" | "user" | "admin";

export type LockedFeature = "leaderboard" | "help" | "packages";

const TRIAL_LESSON_LIMIT = 1;

export function isTrialUser(role: UserRole): boolean {
  return role === "trial";
}

export function isSubscriptionExpired(subscriptionEndDate: string | null): boolean {
  if (!subscriptionEndDate) return false;
  return new Date(subscriptionEndDate) < new Date();
}

export function isEffectivelyTrial(role: UserRole, subscriptionEndDate: string | null): boolean {
  if (role === "admin") return false;
  if (role === "trial") return true;
  return isSubscriptionExpired(subscriptionEndDate);
}

export function isFeatureLocked(role: UserRole, subscriptionEndDate: string | null, feature: LockedFeature): boolean {
  return isEffectivelyTrial(role, subscriptionEndDate);
}

export function getTrialLessonLimit(): number {
  return TRIAL_LESSON_LIMIT;
}
