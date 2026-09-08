const VN_TZ = "Asia/Ho_Chi_Minh";

/** Calendar YYYY-MM-DD in Vietnam time. */
export function vnCalendarDateIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Whole calendar days between two ISO dates (`later - earlier`). */
export function daysBetween(earlierIso: string, laterIso: string): number {
  const a = Date.UTC(
    Number(earlierIso.slice(0, 4)),
    Number(earlierIso.slice(5, 7)) - 1,
    Number(earlierIso.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(laterIso.slice(0, 4)),
    Number(laterIso.slice(5, 7)) - 1,
    Number(laterIso.slice(8, 10)),
  );
  return Math.round((b - a) / 86_400_000);
}

/**
 * Authoritative client mirror of record_learning_activity streak math.
 * gap 0 → keep; gap 1|2 → +1; gap ≥3 → 1; no last → 1.
 */
export function computeNewStreak(
  lastActivityDate: string | null,
  today: string,
  currentStreak: number,
): number {
  if (!lastActivityDate) return 1;
  const gap = daysBetween(lastActivityDate, today);
  if (gap === 0) return currentStreak;
  if (gap === 1 || gap === 2) return currentStreak + 1;
  return 1;
}

/** Monday (YYYY-MM-DD) of the Mon–Sun week containing `isoDate`. */
export function mondayOfWeekContaining(isoDate: string): string {
  const utc = new Date(
    Date.UTC(
      Number(isoDate.slice(0, 4)),
      Number(isoDate.slice(5, 7)) - 1,
      Number(isoDate.slice(8, 10)),
    ),
  );
  const day = utc.getUTCDay(); // 0=Sun … 6=Sat
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  utc.setUTCDate(utc.getUTCDate() + offsetToMonday);
  return utc.toISOString().slice(0, 10);
}

/** Length-7 Mon→Sun activity flags for the week starting at `weekMonday`. */
export function buildWeekActivity(activityDates: string[], weekMonday: string): boolean[] {
  const set = new Set(activityDates);
  const out: boolean[] = [];
  const base = new Date(
    Date.UTC(
      Number(weekMonday.slice(0, 4)),
      Number(weekMonday.slice(5, 7)) - 1,
      Number(weekMonday.slice(8, 10)),
    ),
  );
  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    out.push(set.has(d.toISOString().slice(0, 10)));
  }
  return out;
}
