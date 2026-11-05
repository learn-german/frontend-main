export interface LearningPaceReport {
  generation_status: 'success' | 'insufficient_data' | 'empty' | 'error';
  report_date?: string;
  level_id?: string;
  completed_required_lessons?: number;
  total_required_lessons?: number;
  actual_progress_percentage?: number;
  expected_progress_percentage?: number | null;
}

export function summarizeLearningPace(report: LearningPaceReport | null) {
  const actual = report?.actual_progress_percentage;
  const expected = report?.expected_progress_percentage;
  if (report?.generation_status !== 'success' || typeof actual !== 'number' || typeof expected !== 'number' ||
      !Number.isFinite(actual) || !Number.isFinite(expected) || actual < 0 || actual > 100 || expected < 0 || expected > 100) return null;
  const difference = actual - expected;
  const status = difference > 0 ? 'ahead' : difference > -5 ? 'on_track' : difference > -10 ? 'attention' : 'behind';
  return { actual, expected, difference, status } as const;
}
