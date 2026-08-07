import assert from "node:assert/strict";
import test from "node:test";
import { computeDailyProgressReport, type DailyProgressReportInput } from "./report.ts";

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
