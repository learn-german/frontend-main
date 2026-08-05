import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";
import { ExercisePageHeader } from "../components/ExercisePageHeader";
import { useExerciseSets, type ExerciseSet } from "../lib/hooks/useExerciseSets";
import { useExerciseSetAttempts } from "../lib/hooks/useExerciseSetAttempt";
import { useExerciseSetDrafts } from "../lib/hooks/useExerciseSetDrafts";
import { useNonEmptySetIds } from "../lib/hooks/useNonEmptySetIds";
import { useGrammarExercises } from "../lib/hooks/useGrammarExercises";
import { groupGrammarExercises } from "../lib/grammarExerciseGroups";
import { computeSetStatus, SET_STATUS_LABEL, SET_STATUS_BADGE_CLASS, type SetStatus } from "../lib/exerciseSetStatus";
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
  status: SetStatus;
  isExpanded: boolean;
  onToggle: () => void;
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
  onAttemptUpdate: (status: { isPassed: boolean; attemptCount: number }) => void;
  onDraftSaved: (hasDraft: boolean) => void;
}> = ({ set, orderNumber, status, isExpanded, onToggle, onSetFinished, onAttemptUpdate, onDraftSaved }) => {
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
        ) : null}
        <span className="ml-auto flex items-center gap-2 shrink-0">
          {status === "passed" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
          <span
            className={`text-[10px] font-display font-bold uppercase px-2 py-0.5 rounded-full ${SET_STATUS_BADGE_CLASS[status]}`}
          >
            {SET_STATUS_LABEL[status]}
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
            onDraftSaved={onDraftSaved}
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
  const candidateSets = useMemo(
    () =>
      allSets
        .filter((s) => s.lessonId === lessonId && s.category === "nguphap" && s.status === "published")
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [allSets, lessonId],
  );
  const candidateSetIds = useMemo(() => candidateSets.map((s) => s.id), [candidateSets]);
  const { attemptsBySetId, loading: attemptsLoading, updateAttempt } = useExerciseSetAttempts(candidateSetIds);
  const { draftSetIds, loading: draftsLoading, markDraftSaved } = useExerciseSetDrafts(candidateSetIds);
  const { nonEmptySetIds, loading: nonEmptyLoading } = useNonEmptySetIds(candidateSetIds);
  const lessonSets = useMemo(
    () => candidateSets.filter((s) => nonEmptySetIds.has(s.id)),
    [candidateSets, nonEmptySetIds],
  );
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);

  if (setsLoading || attemptsLoading || draftsLoading || nonEmptyLoading) {
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
            status={computeSetStatus(attemptsBySetId[set.id], draftSetIds.has(set.id))}
            isExpanded={expandedSetId === set.id}
            onToggle={() => setExpandedSetId((prev) => (prev === set.id ? null : set.id))}
            onSetFinished={onSetFinished}
            onAttemptUpdate={(status) => updateAttempt(set.id, status)}
            onDraftSaved={(hasDraft) => markDraftSaved(set.id, hasDraft)}
          />
        ))}
      </div>
    </div>
  );
};
