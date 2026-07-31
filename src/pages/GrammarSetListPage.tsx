import React, { useMemo } from "react";
import { CheckCircle2, Lock, Loader2 } from "lucide-react";
import { ExercisePageHeader } from "../components/ExercisePageHeader";
import { useExerciseSets } from "../lib/hooks/useExerciseSets";
import { useExerciseSetAttempts } from "../lib/hooks/useExerciseSetAttempt";

interface GrammarSetListPageProps {
  lessonId: string;
  onBackToLesson: () => void;
  onSelectSet: (setId: string) => void;
}

export const GrammarSetListPage: React.FC<GrammarSetListPageProps> = ({
  lessonId,
  onBackToLesson,
  onSelectSet,
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

  // Set đầu tiên chưa pass là set khả dụng; mọi set sau nó bị khóa. Đúng
  // BR-01: thứ tự chuyển bài tập theo order_index đã cấu hình.
  let unlockedFound = false;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <ExercisePageHeader title="Bài tập ngữ pháp" onBackToLesson={onBackToLesson} />
      <div className="space-y-3">
        {lessonSets.map((set) => {
          const status = attemptsBySetId[set.id];
          const isPassed = status?.isPassed ?? false;
          const isUnlocked = isPassed || !unlockedFound;
          if (isUnlocked && !isPassed) unlockedFound = true;

          return (
            <button
              key={set.id}
              type="button"
              disabled={!isUnlocked}
              onClick={() => isUnlocked && onSelectSet(set.id)}
              className={`w-full flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${
                isUnlocked
                  ? "border-slate-200 bg-white hover:border-orange-300 cursor-pointer"
                  : "border-slate-100 bg-slate-50 cursor-not-allowed opacity-60"
              }`}
            >
              {isPassed ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
              ) : isUnlocked ? (
                <div className="w-5 h-5 rounded-full border-2 border-orange-400 shrink-0" />
              ) : (
                <Lock className="w-5 h-5 text-slate-300 shrink-0" />
              )}
              <span className="flex-1 font-display font-bold text-sm text-slate-800">{set.title}</span>
              <span
                className={`text-[10px] font-display font-bold uppercase px-2 py-0.5 rounded-full ${
                  isPassed
                    ? "bg-green-50 text-green-700"
                    : isUnlocked
                      ? "bg-orange-50 text-orange-700"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {isPassed ? "Đã đạt" : isUnlocked ? "Cần làm" : "Khóa"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
