export interface StudyWorkload {
  levels: string[];
  missing_levels: string[];
  total_lessons: number;
  completed_lessons: number;
  remaining_lessons: number;
  remaining_days: number | null;
  lessons_per_day: number | null;
  daily_lesson_target: number | null;
  deadline_date: string | null;
}
export interface LearningPaceReport {
  generation_status: 'success' | 'insufficient_data' | 'empty' | 'error';
  report_date?: string;
  study_workload?: StudyWorkload;
}

export function summarizeLearningPace(report: LearningPaceReport | null) {
  const workload = report?.study_workload;
  if (!workload || report?.generation_status === 'error' || !Array.isArray(workload.levels) || !workload.levels.length || !Array.isArray(workload.missing_levels)) return null;
  if (![workload.total_lessons,workload.completed_lessons,workload.remaining_lessons].every(value => Number.isInteger(value) && value >= 0) ||
      workload.completed_lessons > workload.total_lessons || workload.remaining_lessons !== workload.total_lessons-workload.completed_lessons ||
      (workload.remaining_days !== null && (!Number.isInteger(workload.remaining_days) || workload.remaining_days < 0))) return null;
  if (!workload.total_lessons && !workload.missing_levels.length) return null;
  const state = workload.missing_levels.length ? 'missing_levels' : workload.remaining_lessons === 0 ? 'complete' : workload.remaining_days === null ? 'no_deadline' : workload.remaining_days === 0 ? 'expired' : 'ready';
  if (state === 'ready' && (typeof workload.lessons_per_day !== 'number' || !Number.isFinite(workload.lessons_per_day) || workload.lessons_per_day <= 0 ||
      !Number.isInteger(workload.daily_lesson_target) || workload.daily_lesson_target! <= 0)) return null;
  return { ...workload, state } as const;
}
