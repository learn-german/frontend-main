import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "./DesignSystem";

interface ExercisePageHeaderProps {
  title: string;
  subtitle?: string;
  onBackToLesson: () => void;
}

export const ExercisePageHeader = ({
  title,
  subtitle,
  onBackToLesson,
}: ExercisePageHeaderProps) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="space-y-1">
      <h2 className="text-xl font-display font-black text-slate-900">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
    <Button id="btn-exercise-back-to-lesson" variant="secondary" onClick={onBackToLesson}>
      <ArrowLeft className="mr-2 h-4 w-4" /> Trở về bài học
    </Button>
  </div>
);
