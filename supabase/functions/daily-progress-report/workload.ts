import { computeCompletedLessons, type LessonProgressRow, type LessonQuizFlags } from './completion.ts';

export const LEVEL_ORDER = ['A1', 'A2', 'B1', 'B2'];

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

export function computeStudyWorkload({ unlockedLevels, lessonsByLevel, progress, subscriptionEndDate, reportDate }: {
  unlockedLevels: string[];
  lessonsByLevel: ReadonlyMap<string, LessonQuizFlags[]>;
  progress: LessonProgressRow[];
  subscriptionEndDate: string | null;
  reportDate: string;
}): StudyWorkload {
  const levels = [...new Set(unlockedLevels)].sort((a, b) => {
    const rank = (level: string) => LEVEL_ORDER.indexOf(level) < 0 ? LEVEL_ORDER.length : LEVEL_ORDER.indexOf(level);
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  const missingLevels = levels.filter((level) => !lessonsByLevel.get(level)?.length);
  const lessons = levels.flatMap((level) => lessonsByLevel.get(level) ?? []);
  const completedLessons = computeCompletedLessons(lessons, progress).length;
  const remainingLessons = lessons.length - completedLessons;
  const deadlineDate = subscriptionEndDate?.slice(0, 10) ?? null;
  const dayDifference = deadlineDate
    ? (Date.parse(`${deadlineDate}T00:00:00Z`) - Date.parse(`${reportDate}T00:00:00Z`)) / 86400000
    : NaN;
  const remainingDays = Number.isFinite(dayDifference) ? Math.max(0, dayDifference) : null;
  const lessonsPerDay = missingLevels.length > 0 ? null
    : remainingLessons === 0 ? 0
    : remainingDays !== null && remainingDays > 0 ? remainingLessons / remainingDays : null;

  return {
    levels,
    missing_levels: missingLevels,
    total_lessons: lessons.length,
    completed_lessons: completedLessons,
    remaining_lessons: remainingLessons,
    remaining_days: remainingDays,
    lessons_per_day: lessonsPerDay,
    daily_lesson_target: lessonsPerDay === null ? null : Math.ceil(lessonsPerDay),
    deadline_date: deadlineDate,
  };
}
