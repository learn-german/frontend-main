function localTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Trial when subscription_end_date is missing or strictly before today (calendar day). */
export function isTrialBySubscription(
  subscriptionEndDate: string | null,
  today: string = localTodayIso(),
): boolean {
  if (subscriptionEndDate == null) return true;
  const end = subscriptionEndDate.trim().slice(0, 10);
  if (!end) return true;
  return end < today;
}
