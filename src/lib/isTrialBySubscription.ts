function localTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeEndDate(subscriptionEndDate: string | null): string | null {
  if (subscriptionEndDate == null) return null;
  const end = subscriptionEndDate.trim().slice(0, 10);
  return end || null;
}

/** Trial when subscription_end_date is missing (not when expired). */
export function isTrialBySubscription(
  subscriptionEndDate: string | null,
  today: string = localTodayIso(),
): boolean {
  return normalizeEndDate(subscriptionEndDate) == null;
}

export function isExpiredBySubscription(
  subscriptionEndDate: string | null,
  today: string = localTodayIso(),
): boolean {
  const end = normalizeEndDate(subscriptionEndDate);
  if (end == null) return false;
  return end < today;
}

/** Days left when active; null for trial or expired. */
export function subscriptionDaysRemaining(
  subscriptionEndDate: string | null,
  today: string = localTodayIso(),
): number | null {
  const end = normalizeEndDate(subscriptionEndDate);
  if (end == null || end < today) return null;
  const start = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const finish = Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10));
  return Math.round((finish - start) / 86_400_000);
}

export function addCalendarDaysIso(startIso: string, days: number): string {
  const base = startIso.trim().slice(0, 10);
  const d = new Date(Date.UTC(+base.slice(0, 4), +base.slice(5, 7) - 1, +base.slice(8, 10)));
  d.setUTCDate(d.getUTCDate() + days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Trial (null end) → today+days; otherwise extend the existing end date by days. */
export function extendSubscriptionEndDate(
  subscriptionEndDate: string | null,
  days: number,
  today: string = localTodayIso(),
): string {
  const end = normalizeEndDate(subscriptionEndDate);
  return addCalendarDaysIso(end ?? today, days);
}
