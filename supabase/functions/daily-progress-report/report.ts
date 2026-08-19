export interface DailyProgressReportInput {
  reportDate: string;
  completedRequiredLessons: number;
  totalRequiredLessons: number;
  levelStartedAt: string | null;
  plannedCompletionDate: string | null;
  subscriptionEndDate: string | null;
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

/** Số ngày kế hoạch theo level. Giữ đồng bộ với AdminUsersSection.PLANNED_LEVEL_DAYS. */
export const PLANNED_LEVEL_DAYS: Record<string, number> = { A1: 90, A2: 90, B1: 90, B2: 90 };

export function addCalendarDaysUtc(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00.000Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function defaultPlannedCompletionDate(startedAtIso: string, level: string): string {
  return addCalendarDaysUtc(startedAtIso, PLANNED_LEVEL_DAYS[level] ?? 90);
}

function computeRemainingDays(subscriptionEndDate: string | null, reportDate: string): number | null {
  if (!subscriptionEndDate) return null;
  const diffDays = (new Date(subscriptionEndDate).getTime() - new Date(reportDate).getTime()) / MS_PER_DAY;
  return Math.max(0, Math.round(diffDays));
}

export function computeDailyProgressReport(input: DailyProgressReportInput): DailyProgressReportResult {
  const packageRemainingDays = computeRemainingDays(input.subscriptionEndDate, input.reportDate);

  if (input.totalRequiredLessons <= 0) {
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

  const startedAtMs = new Date(input.levelStartedAt).getTime();
  const plannedCompletionMs = new Date(input.plannedCompletionDate).getTime();
  const reportDateMs = new Date(input.reportDate).getTime();
  const plannedLevelDays = (plannedCompletionMs - startedAtMs) / MS_PER_DAY;

  if (plannedLevelDays <= 0) {
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
  const expectedProgressPercentage = clamp((elapsedDays / plannedLevelDays) * 100);
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
