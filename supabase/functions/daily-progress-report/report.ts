export interface DailyProgressReportInput {
  reportDate: string;
  completedRequiredLessons: number;
  totalRequiredLessons: number;
  levelStartedAt: string | null;
  plannedCompletionDate: string | null;
  subscriptionEndDate: string | null;
  baselineCompletedLessons?: number;
}

export interface DailyProgressReportResult {
  actualProgressPercentage: number;
  expectedProgressPercentage: number | null;
  progressGapPercentagePoint: number | null;
  progressStatus: "on_track" | "attention" | "behind" | null;
  packageRemainingDays: number | null;
  generationStatus: "success" | "insufficient_data";
}

const MS_PER_DAY = 86400000;
const clamp = (n: number): number => Math.max(0, Math.min(100, n));

export function vietnamCalendarDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function calendarTime(value: string | null): number {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
}

/** Số ngày kế hoạch theo level. Giữ đồng bộ với AdminUsersSection.PLANNED_LEVEL_DAYS. */
export const PLANNED_LEVEL_DAYS: Record<string, number> = { A1: 90, A2: 90, B1: 90, B2: 90 };

export function addCalendarDaysUtc(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00.000Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Ngày sớm nhất user đụng tới level — mốc "bắt đầu học bài đầu tiên".
 * null khi chưa có lesson_progress nào trong level. */
export function earliestStudyDate(completedAts: (string | null | undefined)[]): string | null {
  const dates = completedAts.filter((v): v is string => !!v && Number.isFinite(Date.parse(v)))
    .map((v) => vietnamCalendarDate(new Date(v))).sort();
  return dates[0] ?? null;
}

export function defaultPlannedCompletionDate(startedAtIso: string, level: string): string {
  return addCalendarDaysUtc(startedAtIso, PLANNED_LEVEL_DAYS[level] ?? 90);
}

/** Mốc tiến độ kỳ vọng. User đã trả phí: tính từ ngày chuyển role user,
 *  không lấy ngày học lúc còn trial. Chưa có mốc đó thì giữ ngày học đầu. */
export function paceStartDate(
  studyStart: string | null,
  paidStartedAt: string | null,
  reportDate: string,
): string {
  if (paidStartedAt) return paidStartedAt.slice(0, 10);
  return studyStart ?? reportDate;
}

/** null = giữ started_at đang lưu. */
export function resolveEnrollmentStart(
  existingStartedAt: string | null,
  studyStartedAt: string,
  paidStartedAt: string | null,
): string | null {
  if (!existingStartedAt) return paidStartedAt ?? studyStartedAt;
  if (paidStartedAt && existingStartedAt < paidStartedAt) return paidStartedAt;
  if (!paidStartedAt && existingStartedAt > studyStartedAt) return studyStartedAt;
  return null;
}

function computeRemainingDays(subscriptionEndDate: string | null, reportDate: string): number | null {
  if (!subscriptionEndDate) return null;
  const diffDays = (calendarTime(subscriptionEndDate) - calendarTime(reportDate)) / MS_PER_DAY;
  return Number.isFinite(diffDays) ? Math.max(0, diffDays) : null;
}

export function computeDailyProgressReport(input: DailyProgressReportInput): DailyProgressReportResult {
  const packageRemainingDays = computeRemainingDays(input.subscriptionEndDate, input.reportDate);

  const baseline = input.baselineCompletedLessons ?? 0;
  if (!Number.isInteger(input.totalRequiredLessons) || input.totalRequiredLessons <= 0 ||
      !Number.isInteger(input.completedRequiredLessons) || input.completedRequiredLessons < 0 ||
      input.completedRequiredLessons > input.totalRequiredLessons ||
      !Number.isInteger(baseline) || baseline < 0 || baseline > input.completedRequiredLessons) {
    return {
      actualProgressPercentage: 0,
      expectedProgressPercentage: null,
      progressGapPercentagePoint: null,
      progressStatus: null,
      packageRemainingDays,
      generationStatus: "insufficient_data",
    };
  }

  const actualProgressPercentage = clamp((input.completedRequiredLessons / input.totalRequiredLessons) * 100);

  if (!input.levelStartedAt || !input.plannedCompletionDate) {
    return {
      actualProgressPercentage,
      expectedProgressPercentage: null,
      progressGapPercentagePoint: null,
      progressStatus: null,
      packageRemainingDays,
      generationStatus: "insufficient_data",
    };
  }

  const startedAtMs = calendarTime(input.levelStartedAt);
  const plannedCompletionMs = calendarTime(input.plannedCompletionDate);
  const reportDateMs = calendarTime(input.reportDate);
  const plannedLevelDays = (plannedCompletionMs - startedAtMs) / MS_PER_DAY;

  if (![startedAtMs, plannedCompletionMs, reportDateMs].every(Number.isFinite) ||
      plannedLevelDays <= 0 || reportDateMs < startedAtMs) {
    return {
      actualProgressPercentage,
      expectedProgressPercentage: null,
      progressGapPercentagePoint: null,
      progressStatus: null,
      packageRemainingDays,
      generationStatus: "insufficient_data",
    };
  }

  const elapsedDays = (reportDateMs - startedAtMs) / MS_PER_DAY;
  const ratio = Math.min(1, Math.max(0, elapsedDays / plannedLevelDays));
  const expectedProgressPercentage = ((baseline + (input.totalRequiredLessons - baseline) * ratio) / input.totalRequiredLessons) * 100;
  const progressGapPercentagePoint = expectedProgressPercentage - actualProgressPercentage;
  const progressStatus: "on_track" | "attention" | "behind" =
    progressGapPercentagePoint < 5 ? "on_track" : progressGapPercentagePoint < 10 ? "attention" : "behind";

  return {
    actualProgressPercentage,
    expectedProgressPercentage,
    progressGapPercentagePoint,
    progressStatus,
    packageRemainingDays,
    generationStatus: "success",
  };
}
