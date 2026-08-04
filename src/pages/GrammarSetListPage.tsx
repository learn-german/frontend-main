import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";
import { ExercisePageHeader } from "../components/ExercisePageHeader";
import { useExerciseSets, type ExerciseSet } from "../lib/hooks/useExerciseSets";
import { useExerciseSetAttempts } from "../lib/hooks/useExerciseSetAttempt";
import { useGrammarExercises } from "../lib/hooks/useGrammarExercises";
import { groupGrammarExercises } from "../lib/grammarExerciseGroups";
import { GrammarExerciseSetBody, GRAMMAR_TYPE_LABELS } from "./GrammarExercisePage";

interface GrammarSetListPageProps {
  lessonId: string;
  onBackToLesson: () => void;
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
}

// 1 hàng = 1 set. Set nào chỉ có đúng 1 nhóm câu hỏi thì nhãn hàng lấy
// thẳng loại + số câu của nhóm đó, đánh số "Bài N" liên tục theo vị trí
// trong lesson (không còn "Bài tập N" bọc ngoài). Set nhiều nhóm (hiếm)
// vẫn dùng title set + mở ra accordion nhóm con như cũ.
// ponytail: mỗi hàng tự fetch câu hỏi của set mình (N request nhỏ thay vì
// gộp 1 query) — đơn giản, đủ nhanh với vài set/lesson; gộp query nếu N lớn.
const SetRow: React.FC<{
  set: ExerciseSet;
  orderNumber: number;
  isPassed: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
  onAttemptUpdate: (status: { isPassed: boolean; attemptCount: number }) => void;
}> = ({ set, orderNumber, isPassed, isExpanded, onToggle, onSetFinished, onAttemptUpdate }) => {
  const { exercises, loading } = useGrammarExercises(set.id);
  const groups = useMemo(() => groupGrammarExercises(exercises), [exercises]);
  const singleGroup = groups.length === 1 ? groups[0] : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-slate-50"
      >
        {isExpanded ? (
          <ChevronDown className="h-5 w-5 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" />
        )}
        <span className="text-base font-display font-black text-slate-900">Bài {orderNumber}</span>
        {loading ? (
          <Loader2 className="h-4 w-4 text-slate-300 animate-spin" />
        ) : singleGroup ? (
          <>
            <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700">
              {GRAMMAR_TYPE_LABELS[singleGroup.type]}
            </span>
            <span className="text-xs text-slate-400">{singleGroup.exercises.length} câu</span>
          </>
        ) : (
          <span className="flex-1 text-sm text-slate-500">{set.title}</span>
        )}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {isPassed && <CheckCircle2 className="h-5 w-5 text-green-600" />}
          <span
            className={`text-[10px] font-display font-bold uppercase px-2 py-0.5 rounded-full ${
              isPassed ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
            }`}
          >
            {isPassed ? "Đã đạt" : "Chưa làm"}
          </span>
        </span>
      </button>
      {isExpanded && (
        <div className="border-t border-slate-100 p-4">
          <GrammarExerciseSetBody
            set={{ id: set.id, title: set.title }}
            onSetFinished={onSetFinished}
            onCollapse={onToggle}
            onAttemptUpdate={onAttemptUpdate}
          />
        </div>
      )}
    </section>
  );
};

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
  const { attemptsBySetId, loading: attemptsLoading, updateAttempt } = useExerciseSetAttempts(setIds);
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
        {lessonSets.map((set, index) => (
          <SetRow
            key={set.id}
            set={set}
            orderNumber={index + 1}
            isPassed={attemptsBySetId[set.id]?.isPassed ?? false}
            isExpanded={expandedSetId === set.id}
            onToggle={() => setExpandedSetId((prev) => (prev === set.id ? null : set.id))}
            onSetFinished={onSetFinished}
            onAttemptUpdate={(status) => updateAttempt(set.id, status)}
          />
        ))}
      </div>
    </div>
  );
};
