import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "./DesignSystem";

interface ExercisePageHeaderProps {
  title: string;
  subtitle?: string;
  levelBadge?: string;
  lessonTitle?: string;
  progress?: { current: number; total: number };
  onBackToLesson: () => void;
}

export const ExercisePageHeader = ({
  title,
  subtitle,
  levelBadge,
  lessonTitle,
  progress,
  onBackToLesson,
}: ExercisePageHeaderProps) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="space-y-1">
      <h2 className="text-xl font-display font-black text-slate-900">{title}</h2>
      {(levelBadge || lessonTitle) && (
        <div className="flex items-center gap-2 flex-wrap">
          {levelBadge && (
            <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 text-[10px] font-display font-bold uppercase tracking-wider text-orange-700">
              {levelBadge}
            </span>
          )}
          {lessonTitle && (
            <span className="text-sm font-medium text-slate-600">{lessonTitle}</span>
          )}
        </div>
      )}
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
    <div className="flex items-center gap-4 flex-wrap sm:justify-end">
      {progress && progress.total > 0 && (
        <div className="min-w-[140px] space-y-1">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-display font-bold uppercase tracking-wider text-slate-400">
              Tiến độ bài học
            </span>
            <span className="text-xs font-bold text-slate-700">
              {progress.current}/{progress.total}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-orange-500 transition-all"
              style={{
                width: `${Math.min(100, Math.round((progress.current / progress.total) * 100))}%`,
              }}
            />
          </div>
        </div>
      )}
      <Button id="btn-exercise-back-to-lesson" variant="secondary" onClick={onBackToLesson}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Trở về bài học
      </Button>
    </div>
  </div>
);
