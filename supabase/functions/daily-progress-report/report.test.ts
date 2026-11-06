import assert from "node:assert/strict";
import test from "node:test";
import {
  addCalendarDaysUtc,
  computeDailyProgressReport,
  defaultPlannedCompletionDate,
  earliestStudyDate,
  paceStartDate,
  resolveEnrollmentStart,
  vietnamCalendarDate,
  type DailyProgressReportInput,
} from "./report.ts";

const MS_PER_DAY = 86400000;
/** Ngày ISO N ngày sau `iso`, tính bằng cộng mốc thời gian thay vì cộng tay
 * theo lịch — tránh sai số khi N vắt qua ranh giới tháng. */
const daysAfter = (iso: string, n: number): string =>
  new Date(new Date(iso).getTime() + n * MS_PER_DAY).toISOString().slice(0, 10);

const baseInput = (overrides: Partial<DailyProgressReportInput> = {}): DailyProgressReportInput => ({
  reportDate: "2026-08-07",
  completedRequiredLessons: 40,
  totalRequiredLessons: 100, // actual = 40% chẵn — tránh số lẻ khi test biên chính xác
  levelStartedAt: "2026-06-08",
  plannedCompletionDate: daysAfter("2026-06-08", 60),
  subscriptionEndDate: "2026-08-17",
  ...overrides,
});

test("actual_progress tính đúng công thức completed/total", () => {
  const result = computeDailyProgressReport(baseInput());
  assert.equal(result.actualProgressPercentage, 40);
});

test("expected_progress tính đúng theo elapsed/planned days", () => {
  const startedAt = "2026-06-08";
  const result = computeDailyProgressReport(baseInput({
    levelStartedAt: startedAt,
    plannedCompletionDate: daysAfter(startedAt, 100),
    reportDate: daysAfter(startedAt, 60), // elapsed 60/100 ngày -> 60%
  }));
  assert.equal(result.expectedProgressPercentage, 60);
});

test("progress_gap = 5 chính xác -> attention (biên dưới)", () => {
  const startedAt = "2026-06-08";
  const result = computeDailyProgressReport(baseInput({
    levelStartedAt: startedAt,
    plannedCompletionDate: daysAfter(startedAt, 100),
    reportDate: daysAfter(startedAt, 45), // expected 45%, actual 40% -> gap 5
  }));
  assert.equal(result.expectedProgressPercentage, 45);
  assert.equal(result.progressGapPercentagePoint, 5);
  assert.equal(result.progressStatus, "attention");
});

test("progress_gap ngay dưới 5 -> on_track", () => {
  const startedAt = "2026-06-08";
  const result = computeDailyProgressReport(baseInput({
    levelStartedAt: startedAt,
    plannedCompletionDate: daysAfter(startedAt, 100),
    reportDate: daysAfter(startedAt, 44), // expected 44%, actual 40% -> gap 4
  }));
  assert.equal(result.progressGapPercentagePoint, 4);
  assert.equal(result.progressStatus, "on_track");
});

test("progress_gap = 10 chính xác -> behind (biên dưới)", () => {
  const startedAt = "2026-06-08";
  const result = computeDailyProgressReport(baseInput({
    levelStartedAt: startedAt,
    plannedCompletionDate: daysAfter(startedAt, 100),
    reportDate: daysAfter(startedAt, 50), // expected 50%, actual 40% -> gap 10
  }));
  assert.equal(result.progressGapPercentagePoint, 10);
  assert.equal(result.progressStatus, "behind");
});

test("progress_gap ngay dưới 10 -> attention", () => {
  const startedAt = "2026-06-08";
  const result = computeDailyProgressReport(baseInput({
    levelStartedAt: startedAt,
    plannedCompletionDate: daysAfter(startedAt, 100),
    reportDate: daysAfter(startedAt, 49), // expected 49%, actual 40% -> gap 9
  }));
  assert.equal(result.progressGapPercentagePoint, 9);
  assert.equal(result.progressStatus, "attention");
});

test("insufficient_data khi total_required_lessons = 0", () => {
  const result = computeDailyProgressReport(baseInput({ completedRequiredLessons: 0, totalRequiredLessons: 0 }));
  assert.equal(result.generationStatus, "insufficient_data");
  assert.equal(result.progressStatus, null);
});

test("insufficient_data khi thiếu levelStartedAt/plannedCompletionDate", () => {
  const result = computeDailyProgressReport(baseInput({ levelStartedAt: null, plannedCompletionDate: null }));
  assert.equal(result.generationStatus, "insufficient_data");
  assert.equal(result.expectedProgressPercentage, null);
  // actual_progress vẫn tính được vì có completed/total
  assert.equal(result.actualProgressPercentage, 40);
});

test("insufficient_data khi planned_level_days <= 0", () => {
  const result = computeDailyProgressReport(baseInput({
    levelStartedAt: "2026-08-07",
    plannedCompletionDate: "2026-08-07", // 0 ngày
  }));
  assert.equal(result.generationStatus, "insufficient_data");
});

test("package_remaining_days không âm khi subscription đã hết hạn", () => {
  const result = computeDailyProgressReport(baseInput({ subscriptionEndDate: "2026-01-01" }));
  assert.equal(result.packageRemainingDays, 0);
});

test("package_remaining_days null khi không có subscriptionEndDate", () => {
  const result = computeDailyProgressReport(baseInput({ subscriptionEndDate: null }));
  assert.equal(result.packageRemainingDays, null);
});

test("package_remaining_days tính đúng số ngày còn lại", () => {
  const result = computeDailyProgressReport(baseInput({ reportDate: "2026-08-07", subscriptionEndDate: "2026-08-17" }));
  assert.equal(result.packageRemainingDays, 10);
});

test("defaultPlannedCompletionDate A1 = 90 ngày UTC", () => {
  assert.equal(addCalendarDaysUtc("2026-08-19", 90), "2026-11-17");
  assert.equal(defaultPlannedCompletionDate("2026-08-19", "A1"), "2026-11-17");
  assert.equal(defaultPlannedCompletionDate("2026-08-19", "A2"), "2026-11-17");
});

test("earliestStudyDate lấy ngày sớm nhất và bỏ qua completed_at rỗng", () => {
  assert.equal(
    earliestStudyDate([undefined, "2026-08-19T02:00:00+00:00", null, "2026-07-04T23:30:00+00:00"]),
    "2026-07-05",
  );
  assert.equal(earliestStudyDate([]), null);
  assert.equal(earliestStudyDate([undefined, null]), null);
});

test('Vietnam calendar rolls over at 17:00 UTC, independent of server timezone', () => {
  assert.equal(vietnamCalendarDate(new Date('2026-11-05T16:59:59Z')), '2026-11-05');
  assert.equal(vietnamCalendarDate(new Date('2026-11-05T17:00:00Z')), '2026-11-06');
});

test("expected_progress > 0 khi start_at là ngày học bài đầu tiên", () => {
  const startedAt = earliestStudyDate(["2026-07-20T01:00:00+00:00"])!;
  const result = computeDailyProgressReport(baseInput({
    levelStartedAt: startedAt,
    plannedCompletionDate: defaultPlannedCompletionDate(startedAt, "A1"), // 90 ngày
    reportDate: "2026-08-19", // elapsed 30/90 ngày
  }));
  assert.equal(Math.round(result.expectedProgressPercentage!), 33);
});

test("paceStartDate bỏ ngày học trial khi đã có ngày chuyển user", () => {
  assert.equal(paceStartDate("2026-07-04", "2026-10-08", "2026-10-08"), "2026-10-08");
  assert.equal(paceStartDate(null, null, "2026-10-08"), "2026-10-08");
  assert.equal(paceStartDate("2026-07-04", null, "2026-10-08"), "2026-07-04");
});

test("resolveEnrollmentStart đẩy mốc enrollment lên ngày chuyển user", () => {
  assert.equal(resolveEnrollmentStart("2026-07-04", "2026-07-04", "2026-10-08"), "2026-10-08");
  assert.equal(resolveEnrollmentStart("2026-10-08", "2026-07-04", "2026-10-08"), null);
  assert.equal(resolveEnrollmentStart("2026-06-01", "2026-07-04", null), null);
  assert.equal(resolveEnrollmentStart("2026-08-19", "2026-07-04", null), "2026-07-04");
  assert.equal(resolveEnrollmentStart(null, "2026-07-04", "2026-10-08"), "2026-10-08");
});

test('extension starts from fixed completed baseline (15/23, 45 days, day 10)', () => {
  const result = computeDailyProgressReport(baseInput({
    totalRequiredLessons: 23, completedRequiredLessons: 18, baselineCompletedLessons: 15,
    levelStartedAt: '2026-01-01', plannedCompletionDate: '2026-02-15', reportDate: '2026-01-11',
  }));
  assert.ok(Math.abs(result.expectedProgressPercentage! - 72.94685990338164) < 1e-10);
  assert.ok(Math.abs(result.progressGapPercentagePoint! + 5.31400966183575) < 1e-10);
  assert.equal(result.progressStatus, 'on_track');
});

test('early extension includes old remaining days and retains tolerance thresholds', () => {
  const result = computeDailyProgressReport(baseInput({
    totalRequiredLessons: 30, completedRequiredLessons: 14, baselineCompletedLessons: 10,
    levelStartedAt: '2026-03-02', plannedCompletionDate: '2026-05-01', reportDate: '2026-03-17',
  }));
  assert.equal(result.expectedProgressPercentage, 50);
  assert.ok(Math.abs(result.progressGapPercentagePoint! - 10 / 3) < 1e-10);
  assert.equal(result.progressStatus, 'on_track');
});

for (const [reportDate, expected] of [['2026-01-01', 50], ['2026-01-06', 75], ['2026-01-11', 100], ['2026-02-01', 100]] as const) {
  test(`baseline plan boundary ${reportDate}`, () => {
    const result = computeDailyProgressReport(baseInput({
      totalRequiredLessons: 20, completedRequiredLessons: 10, baselineCompletedLessons: 10,
      levelStartedAt: '2026-01-01', plannedCompletionDate: '2026-01-11', reportDate,
    }));
    assert.equal(result.expectedProgressPercentage, expected);
  });
}

for (const overrides of [
  { totalRequiredLessons: NaN }, { completedRequiredLessons: 101 },
  { baselineCompletedLessons: -1 }, { baselineCompletedLessons: 41 },
  { plannedCompletionDate: 'invalid' }, { reportDate: 'invalid' },
  { reportDate: '2026-02-30' }, { reportDate: '2026-01-01' },
]) {
  test(`invalid plan cannot report success: ${JSON.stringify(overrides)}`, () => {
    assert.equal(computeDailyProgressReport(baseInput(overrides)).generationStatus, 'insufficient_data');
  });
}
