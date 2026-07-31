import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";
import { ExercisePageHeader } from "../components/ExercisePageHeader";
import { useExerciseSets } from "../lib/hooks/useExerciseSets";
import { useExerciseSetAttempts } from "../lib/hooks/useExerciseSetAttempt";
import { GrammarExerciseSetBody } from "./GrammarExercisePage";

interface GrammarSetListPageProps {
  lessonId: string;
  onBackToLesson: () => void;
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
}

export const GrammarSetListPage: React.FC<GrammarSetListPageProps> = ({
  lessonId,
  onBackToLesson,
  onSetFinished,
}) => {
  const { sets: allSets, loading: setsLoading } = useExerciseSets();
  const lessonSets = useMemo(
    () =>
      allSets
        .filter((s) => s.lessonId === lessonId && s.category === "nguphap" && s.status === "published")
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [allSets, lessonId],
  );
  const setIds = useMemo(() => lessonSets.map((s) => s.id), [lessonSets]);
  const { attemptsBySetId, loading: attemptsLoading } = useExerciseSetAttempts(setIds);
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);

  if (setsLoading || attemptsLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <ExercisePageHeader title="Bài tập ngữ pháp" onBackToLesson={onBackToLesson} />
        <div className="flex items-center justify-center min-h-64">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (lessonSets.length === 0) {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <ExercisePageHeader title="Bài tập ngữ pháp" onBackToLesson={onBackToLesson} />
        <div className="text-center py-12">
          <p className="text-slate-500">Bài tập ngữ pháp cho bài học này chưa được soạn.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <ExercisePageHeader title="Bài tập ngữ pháp" onBackToLesson={onBackToLesson} />
      <div className="space-y-3">
        {lessonSets.map((set) => {
          const status = attemptsBySetId[set.id];
          const isPassed = status?.isPassed ?? false;
          const isExpanded = expandedSetId === set.id;

          return (
            <section
              key={set.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => setExpandedSetId(isExpanded ? null : set.id)}
                className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-slate-50"
              >
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-slate-400 shrink-0" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" />
                )}
                <span className="flex-1 font-display font-bold text-sm text-slate-800">{set.title}</span>
                {isPassed && <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />}
                <span
                  className={`text-[10px] font-display font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                    isPassed ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
                  }`}
                >
                  {isPassed ? "Đã đạt" : "Chưa làm"}
                </span>
              </button>
              {isExpanded && (
                <div className="border-t border-slate-100 p-4">
                  <GrammarExerciseSetBody
                    set={{ id: set.id, title: set.title }}
                    onSetFinished={onSetFinished}
                    onCollapse={() => setExpandedSetId(null)}
                  />
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};
