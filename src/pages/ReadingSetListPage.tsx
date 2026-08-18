import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, Loader2, RotateCcw, ArrowRight } from "lucide-react";
import { Button } from "../components/DesignSystem";
import { ExercisePageHeader } from "../components/ExercisePageHeader";
import { MarkdownBlock } from "../components/MarkdownBlock";
import { Lesson } from "../lib/appTypes";
import { useExerciseSets, type ExerciseSet } from "../lib/hooks/useExerciseSets";
import { useExerciseSetAttempt, useExerciseSetAttempts } from "../lib/hooks/useExerciseSetAttempt";
import { useExerciseSetDraft } from "../lib/hooks/useExerciseSetDraft";
import { useExerciseSetDrafts } from "../lib/hooks/useExerciseSetDrafts";
import { useNonEmptyReadingSetIds } from "../lib/hooks/useNonEmptyReadingSetIds";
import { useReadingSetPassageCounts } from "../lib/hooks/useReadingSetPassageCounts";
import { readingSetTypeTag } from "../lib/readingSetView";
import {
  useReadingQuestionGroups,
  type ReadingQuestionGroupPublic,
} from "../lib/hooks/useReadingQuestionGroups";
import { buildReadingCarouselScreens, itemKey, type ReadingCarouselScreen } from "../lib/readingScreens";
import { useMediaPlaybackUrl } from "../lib/hooks/useMediaPlaybackUrl";
import { pickHydrateSource } from "../lib/exerciseSetDraftLogic";
import { computeSetStatus, SET_STATUS_LABEL, SET_STATUS_BADGE_CLASS, type SetStatus } from "../lib/exerciseSetStatus";
import { supabase } from "../lib/supabase";
import { showToast } from "../lib/toast";

interface ReadingSetListPageProps {
  lesson: Lesson;
  onBackToLesson: () => void;
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
}

interface ReadingResult {
  score: number;
  total: number;
  correct: number;
  isPassed: boolean;
  revealed: boolean;
  xpEarned: number;
  bestScore: number;
  attemptCount: number;
  lessonQuizScore: number;
  itemResults: Record<string, boolean>;
  correctAnswers?: Record<string, string>;
  explanations?: Record<string, string>;
}

const SubQuestionImage: React.FC<{ lessonId: string; imageKey: string }> = ({ lessonId, imageKey }) => {
  const { url, loading, error } = useMediaPlaybackUrl(lessonId, "image", imageKey);
  if (loading) return <div className="rounded-lg bg-slate-100 animate-pulse w-full h-32 my-1" />;
  if (error || !url) return null;
  return <img src={url} alt="" className="rounded-lg max-w-full my-1" />;
};

const ReadingMcSlide: React.FC<{
  lesson: Lesson;
  question: ReadingQuestionGroupPublic["subQuestions"][number];
  picked: string | undefined;
  onAnswer: (value: string) => void;
  passageMarkdown?: string;
  passageLabel?: string;
}> = ({ lesson, question, picked, onAnswer, passageMarkdown, passageLabel }) => {
  const letters = question.options.map((_, i) => String.fromCharCode(65 + i));
  const questionLabel = question.question.trim() || `Đáp án: ${letters.join(", ")}?`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      {passageMarkdown && (
        <div className="space-y-2">
          {passageLabel && (() => {
            const match = passageLabel.match(/(\d+)$/);
            const num = match?.[1];
            return (
              <span className="flex items-center gap-2 text-xs font-bold text-slate-500">
                {num && (
                  <span className="w-[22px] h-[22px] rounded-md bg-orange-50 text-orange-500 text-[11px] font-black flex items-center justify-center shrink-0">
                    {num}
                  </span>
                )}
                {passageLabel}
              </span>
            );
          })()}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <MarkdownBlock content={passageMarkdown} lessonId={lesson.id} large />
          </div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Chọn đáp án</p>
        </div>
      )}
      {question.text_snippet && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <MarkdownBlock content={question.text_snippet} lessonId={lesson.id} />
        </div>
      )}
      {question.image_key && <SubQuestionImage lessonId={lesson.id} imageKey={question.image_key} />}
      <p className="text-sm font-medium text-slate-700">{questionLabel}</p>
      <div className="flex flex-col gap-2">
        {question.options.map((opt, oi) => {
          const optKey = String(oi);
          const selected = picked === optKey;
          return (
            <button
              key={oi}
              type="button"
              onClick={() => onAnswer(optKey)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-[13.5px] rounded-xl border transition-colors ${
                selected ? "border-orange-500 bg-orange-50" : "border-slate-200 bg-white"
              } text-slate-700`}
            >
              <span
                className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                  selected ? "border-orange-500 bg-orange-500" : "border-slate-300"
                }`}
              />
              <span className={`w-4 text-center text-[11px] font-extrabold ${selected ? "text-orange-600" : "text-slate-400"}`}>
                {String.fromCharCode(65 + oi)}
              </span>
              <span>{opt}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const ReadingRfSummarySlide: React.FC<{
  items: { key: string; text: string }[];
  answersByKey: Record<string, string>;
  onAnswer: (key: string, value: string) => void;
}> = ({ items, answersByKey, onAnswer }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
    <h4 className="text-sm font-display font-bold text-slate-900">Đúng / Sai</h4>
    <div className="space-y-2">
      {items.map((item) => {
        const picked = answersByKey[item.key];
        return (
          <div key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
            <p className="text-sm text-slate-700 flex-1">{item.text}</p>
            <div className="flex items-center gap-1.5 shrink-0">
              {(["richtig", "falsch"] as const).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => onAnswer(item.key, val)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors ${
                    picked === val ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-500 border-slate-200"
                  }`}
                >
                  {val === "richtig" ? "Richtig" : "Falsch"}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const ReadingGroupBody: React.FC<{
  lesson: Lesson;
  group: ReadingQuestionGroupPublic;
  passageText: string;
  answersByKey: Record<string, string>;
  onAnswer: (key: string, value: string) => void;
  itemResults?: Record<string, boolean>;
  revealed: boolean;
  correctAnswers?: Record<string, string>;
  explanation?: string;
}> = ({ lesson, group, passageText, answersByKey, onAnswer, itemResults, revealed, correctAnswers, explanation }) => (
  <div className="space-y-3">
    {group.title && <p className="text-sm font-display font-bold text-slate-800">{group.title}</p>}
    {group.questionIntro && <p className="text-xs text-slate-500">{group.questionIntro}</p>}
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
      <MarkdownBlock content={passageText} lessonId={lesson.id} large />
    </div>

    {group.questionType === "richtig_falsch" && group.statements.map((s, i) => {
      const key = itemKey(group.id, i);
      const picked = answersByKey[key];
      const result = itemResults?.[key];
      return (
        <div
          key={key}
          className={`flex items-center gap-2 p-2.5 rounded-xl border ${
            result === true ? "border-green-300 bg-green-50" : result === false ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"
          }`}
        >
          <span className="flex-1 text-sm text-slate-700">{s.text}</span>
          {(["richtig", "falsch"] as const).map((val) => (
            <button
              key={val}
              type="button"
              disabled={itemResults !== undefined}
              onClick={() => onAnswer(key, val)}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors disabled:cursor-default ${
                picked === val ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-500 border-slate-200"
              }`}
            >
              {val === "richtig" ? "Richtig" : "Falsch"}
            </button>
          ))}
          {revealed && correctAnswers && (
            <span className="text-[11px] text-slate-400">Đáp án: {correctAnswers[key] === "richtig" ? "Richtig" : "Falsch"}</span>
          )}
        </div>
      );
    })}

    {group.questionType === "multiple_choice" && group.subQuestions.map((q, qi) => {
      const key = itemKey(group.id, qi);
      const picked = answersByKey[key];
      const result = itemResults?.[key];
      return (
        <div key={key} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
          {q.text_snippet && <p className="text-xs text-slate-500">{q.text_snippet}</p>}
          {q.image_key && <SubQuestionImage lessonId={lesson.id} imageKey={q.image_key} />}
          <p className={`text-sm font-medium ${result === true ? "text-green-700" : result === false ? "text-red-700" : "text-slate-700"}`}>
            {q.question}
          </p>
          <div className="space-y-1">
            {q.options.map((opt, oi) => {
              const optKey = String(oi);
              const isPicked = picked === optKey;
              const isCorrectOpt = revealed && correctAnswers?.[key] === optKey;
              return (
                <button
                  key={oi}
                  type="button"
                  disabled={itemResults !== undefined}
                  onClick={() => onAnswer(key, optKey)}
                  className={`w-full text-left px-3 py-1.5 text-sm rounded-lg border transition-colors disabled:cursor-default ${
                    isCorrectOpt
                      ? "bg-green-50 border-green-400 text-green-700"
                      : isPicked
                        ? result === false
                          ? "bg-red-50 border-red-400 text-red-700"
                          : "bg-orange-50 border-orange-400 text-orange-700"
                        : "bg-white border-slate-200 text-slate-700"
                  }`}
                >
                  {String.fromCharCode(65 + oi)}. {opt}
                </button>
              );
            })}
          </div>
        </div>
      );
    })}

    {revealed && explanation && (
      <div className="text-xs bg-sky-50 border border-sky-200 text-sky-800 rounded-xl p-3">{explanation}</div>
    )}
  </div>
);

const ReadingExerciseSetBody: React.FC<{
  lesson: Lesson;
  set: { id: string; title: string };
  passageCount: number;
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
  onCollapse: () => void;
  onAttemptUpdate: (status: { isPassed: boolean; attemptCount: number }) => void;
  onDraftSaved: (hasDraft: boolean) => void;
}> = ({ lesson, set, passageCount, onSetFinished, onCollapse, onAttemptUpdate, onDraftSaved }) => {
  const { groups, passagesById, loading: groupsLoading, error: groupsError } = useReadingQuestionGroups(set.id);
  const { attempt, loading: attemptLoading } = useExerciseSetAttempt(set.id);
  const { draft, loading: draftLoading, saveDraft, deleteDraft } = useExerciseSetDraft(set.id);

  const [answersByKey, setAnswersByKey] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ReadingResult | null>(null);
  const [retrying, setRetrying] = useState(false);
  const submissionIdRef = React.useRef(crypto.randomUUID());
  const [currentScreenIndex, setCurrentScreenIndex] = useState(0);

  const hydrateSource = pickHydrateSource(draft !== null, attempt !== null);
  const sortedGroups = useMemo(
    () =>
      [...groups].sort((a, b) => {
        const passageA = passagesById[a.passageId]?.orderIndex ?? 0;
        const passageB = passagesById[b.passageId]?.orderIndex ?? 0;
        if (passageA !== passageB) return passageA - passageB;
        return a.orderIndex - b.orderIndex;
      }),
    [groups, passagesById],
  );
  const groupsById = useMemo(
    () => Object.fromEntries(groups.map((group) => [group.id, group] as const)),
    [groups],
  );

  React.useEffect(() => {
    if (retrying || groups.length === 0 || draftLoading || hydrateSource !== "attempt" || !attempt) return;
    setResult({
      score: attempt.score,
      total: attempt.total,
      correct: Math.round((attempt.score / 100) * attempt.total),
      isPassed: attempt.isPassed,
      revealed: attempt.revealed,
      xpEarned: 0,
      bestScore: attempt.bestScore,
      attemptCount: attempt.attemptCount,
      lessonQuizScore: 0,
      itemResults: attempt.exerciseResults,
    });
    setAnswersByKey(attempt.answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, retrying, groups, hydrateSource, draftLoading]);

  React.useEffect(() => {
    if (retrying || groups.length === 0 || hydrateSource !== "draft" || !draft) return;
    setAnswersByKey(draft.answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, retrying, groups, hydrateSource]);

  const built = useMemo(
    () => buildReadingCarouselScreens(groups, passagesById, passageCount),
    [groups, passagesById, passageCount],
  );
  const screens: ReadingCarouselScreen[] = built.ok ? built.screens : [];
  const currentScreen = screens[currentScreenIndex];
  const isLastScreen = screens.length > 0 && currentScreenIndex === screens.length - 1;
  const currentAnswered = !currentScreen
    ? false
    : currentScreen.kind === "single_rf_summary"
      ? currentScreen.items.every((item) => !!answersByKey[item.key])
      : !!answersByKey[currentScreen.key];

  React.useEffect(() => {
    setCurrentScreenIndex(0);
  }, [set.id]);

  React.useEffect(() => {
    if (screens.length === 0) {
      setCurrentScreenIndex(0);
      return;
    }
    setCurrentScreenIndex((prev) => Math.min(prev, screens.length - 1));
  }, [screens.length]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    const { data, error } = await supabase.functions.invoke("reading-submit", {
      body: { set_id: set.id, submission_id: submissionIdRef.current, answers: answersByKey },
    });
    setSubmitting(false);
    if (error || !data) {
      setSubmitError("Không thể nộp bài. Vui lòng thử lại.");
      return;
    }
    const res = data as ReadingResult;
    setResult(res);
    onAttemptUpdate({ isPassed: res.isPassed, attemptCount: res.attemptCount });
    deleteDraft();
    onDraftSaved(false);
    onSetFinished(res.lessonQuizScore, res.xpEarned);
  };

  const handleRetry = () => {
    submissionIdRef.current = crypto.randomUUID();
    setAnswersByKey({});
    setResult(null);
    setSubmitError(null);
    setRetrying(true);
    setCurrentScreenIndex(0);
  };

  const awaitingHydration = hydrateSource === "attempt" && !retrying && groups.length > 0 && result === null;

  if (groupsLoading || attemptLoading || draftLoading || awaitingHydration) {
    return (
      <div className="flex items-center justify-center min-h-32">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (groupsError || groups.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-500">Bài tập cho phần này chưa được soạn.</p>
      </div>
    );
  }

  if (result) {
    const { score, total, correct, isPassed, revealed, xpEarned } = result;
    return (
      <div
        id="quiz-result-card"
        className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200/60 p-6 sm:p-10 shadow-sm text-center space-y-6 animate-in zoom-in duration-300"
      >
        <div className="space-y-2">
          {isPassed ? (
            <div className="w-20 h-20 bg-green-50 border-2 border-green-200 rounded-full flex items-center justify-center mx-auto text-4xl animate-bounce">🎉</div>
          ) : (
            <div className="w-20 h-20 bg-rose-50 border-2 border-rose-200 rounded-full flex items-center justify-center mx-auto text-4xl">😟</div>
          )}
          <h2 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight leading-normal">
            {isPassed ? "Xuất sắc! Bạn đã vượt qua!" : "Cố gắng chút nữa nhé!"}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto font-sans leading-normal">
            {isPassed
              ? "Tuyệt vời, bạn đã tiếp thu bài học cực tốt và sẵn sàng mở khóa các lớp thử thách tiếp theo!"
              : "Để hoàn thiện bài học, bạn cần đạt tối thiểu 80% điểm số. Đừng nản lòng nhé!"}
          </p>
        </div>

        <div className="p-6 bg-slate-50/50 rounded-2xl border border-slate-100 max-w-xs mx-auto">
          <span className="text-[10px] text-slate-400 font-display font-bold uppercase tracking-wider block">KẾT QUẢ ĐẠT ĐƯỢC</span>
          <div className="flex items-baseline justify-center gap-1.5 mt-1">
            <span className={`text-4xl md:text-5xl font-display font-black ${isPassed ? "text-green-600" : "text-rose-600"}`}>{score}%</span>
            <span className="text-sm font-bold text-slate-500">({correct}/{total} câu)</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Điểm cao nhất: <b className="text-slate-700">{result.bestScore}%</b> · Đã làm <b className="text-slate-700">{result.attemptCount}</b> lần
          </p>
          {xpEarned > 0 && (
            <span className="inline-block text-[10px] font-display font-bold px-2.5 py-0.5 rounded-full mt-2.5 uppercase bg-green-50 text-green-700">
              +{xpEarned} XP Tích lũy
            </span>
          )}
          {!isPassed && (
            <span className="inline-block text-[10px] font-display font-bold px-2.5 py-0.5 rounded-full mt-2.5 uppercase bg-rose-50 text-rose-700">
              Chưa đạt chuẩn 80%
            </span>
          )}
        </div>

        <div className="text-left space-y-3 pt-4 border-t border-slate-100">
          <h4 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest">
            {revealed ? "Giải thích từng bài:" : "Câu đúng / câu sai:"}
          </h4>
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {groups.flatMap((group) => {
              if (group.questionType === "richtig_falsch") {
                return group.statements.map((s, i) => {
                  const key = itemKey(group.id, i);
                  const correct = result.itemResults?.[key];
                  const chosen = answersByKey[key];
                  const correctAns = result.correctAnswers?.[key];
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[13px] ${
                        correct ? "border-green-200 bg-green-50 text-slate-700" : "border-red-300 bg-red-50 text-slate-700"
                      }`}
                    >
                      {correct
                        ? <CheckCircle2 className="w-[15px] h-[15px] text-green-600 shrink-0" />
                        : <span className="w-[15px] h-[15px] text-red-600 shrink-0 flex items-center justify-center font-black text-xs">✕</span>}
                      <span className="flex-1">
                        {s.text} — {chosen === "richtig" ? "Richtig" : chosen === "falsch" ? "Falsch" : "—"}
                      </span>
                      {!correct && correctAns && (
                        <span className="text-[11px] text-red-600 shrink-0">
                          Đáp án đúng: {correctAns === "richtig" ? "Richtig" : "Falsch"}
                        </span>
                      )}
                    </div>
                  );
                });
              }
              return group.subQuestions.map((q, qi) => {
                const key = itemKey(group.id, qi);
                const correct = result.itemResults?.[key];
                const chosen = answersByKey[key];
                const correctAns = result.correctAnswers?.[key];
                const chosenLabel = chosen !== undefined ? String.fromCharCode(65 + Number(chosen)) : "—";
                const optionText = chosen !== undefined ? q.options[Number(chosen)] : "";
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[13px] ${
                      correct ? "border-green-200 bg-green-50 text-slate-700" : "border-red-300 bg-red-50 text-slate-700"
                    }`}
                  >
                    {correct
                      ? <CheckCircle2 className="w-[15px] h-[15px] text-green-600 shrink-0" />
                      : <span className="w-[15px] h-[15px] text-red-600 shrink-0 flex items-center justify-center font-black text-xs">✕</span>}
                    <span className="flex-1">
                      {q.question} — {chosenLabel}. {optionText}
                    </span>
                    {!correct && correctAns && (
                      <span className="text-[11px] text-red-600 shrink-0">
                        Đáp án đúng: {String.fromCharCode(65 + Number(correctAns))}
                      </span>
                    )}
                  </div>
                );
              });
            })}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={handleRetry}>
            <RotateCcw className="w-4 h-4 mr-2" /> Làm lại bài Test
          </Button>
          {isPassed && (
            <Button variant="primary" className="flex-1" onClick={onCollapse}>
              Tiếp tục
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (built.ok === false) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-500">{built.error}</p>
      </div>
    );
  }

  if (!currentScreen) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-500">Bài tập cho phần này chưa được soạn.</p>
      </div>
    );
  }

  const handleSaveDraft = async () => {
    const { error } = await saveDraft(answersByKey);
    if (error) {
      showToast("Không thể lưu, vui lòng thử lại.", "warning");
      return;
    }
    showToast("Đã lưu bài làm dở.", "success");
    onDraftSaved(true);
  };

  const isMultiPassage = built.layout === "multi_passage";
  const slideShare = screens.length > 0 ? 100 / screens.length : 100;
  const introText = sortedGroups[0]?.questionIntro?.trim() ?? "";
  const singlePassageId = screens[0]?.passageId ?? sortedGroups[0]?.passageId ?? "";

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {isMultiPassage ? (
        <>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            CÂU {currentScreenIndex + 1}/{screens.length}
          </span>
          {introText && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-600">
              <span className="font-bold">Yêu cầu: </span>
              {introText}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Văn bản</span>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <MarkdownBlock content={passagesById[singlePassageId]?.textDe ?? ""} lessonId={lesson.id} large />
            </div>
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            CÂU {currentScreenIndex + 1}/{screens.length}
          </span>
        </>
      )}

      <div className="overflow-hidden w-full">
        <div
          className="flex transition-transform duration-300"
          style={{
            width: `${screens.length * 100}%`,
            transform: `translateX(-${currentScreenIndex * slideShare}%)`,
          }}
        >
          {screens.map((screen) => {
            const slideStyle = { width: `${slideShare}%`, flex: "0 0 auto" as const };

            if (screen.kind === "multi_passage") {
              const group = groupsById[screen.groupId];
              const question = group?.subQuestions[0];
              if (!group || !question) {
                return (
                  <div key={`${screen.passageId}:${screen.slideIndex}`} style={slideStyle}>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-sm text-slate-500">Cấu trúc câu hỏi chưa hợp lệ.</p>
                    </div>
                  </div>
                );
              }
              const passageOrder = passagesById[screen.passageId]?.orderIndex ?? screen.slideIndex;
              return (
                <div key={screen.key} style={slideStyle}>
                  <ReadingMcSlide
                    lesson={lesson}
                    question={question}
                    picked={answersByKey[screen.key]}
                    onAnswer={(value) => setAnswersByKey((prev) => ({ ...prev, [screen.key]: value }))}
                    passageMarkdown={passagesById[screen.passageId]?.textDe ?? ""}
                    passageLabel={`Văn bản ${passageOrder + 1}`}
                  />
                </div>
              );
            }

            if (screen.kind === "single_mc") {
              const group = groupsById[screen.groupId];
              const question = group?.subQuestions[screen.questionIndex];
              if (!group || !question) {
                return (
                  <div key={screen.key} style={slideStyle}>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <p className="text-sm text-slate-500">Cấu trúc câu hỏi chưa hợp lệ.</p>
                    </div>
                  </div>
                );
              }
              return (
                <div key={screen.key} style={slideStyle}>
                  <ReadingMcSlide
                    lesson={lesson}
                    question={question}
                    picked={answersByKey[screen.key]}
                    onAnswer={(value) => setAnswersByKey((prev) => ({ ...prev, [screen.key]: value }))}
                  />
                </div>
              );
            }

            return (
              <div key={`${screen.passageId}:${screen.slideIndex}`} style={slideStyle}>
                <ReadingRfSummarySlide
                  items={screen.items}
                  answersByKey={answersByKey}
                  onAnswer={(key, value) => setAnswersByKey((prev) => ({ ...prev, [key]: value }))}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 pt-1">
        {screens.map((screen, index) => (
          <button
            key={`dot:${screen.passageId}:${screen.slideIndex}`}
            type="button"
            aria-label={`Đi tới câu ${index + 1}`}
            onClick={() => setCurrentScreenIndex(index)}
            className={`h-2 w-2 rounded-full transition-colors ${index === currentScreenIndex ? "bg-orange-500" : "bg-slate-200"}`}
          />
        ))}
      </div>

      {submitError && <p className="text-sm text-red-500 text-center">{submitError}</p>}

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={handleSaveDraft}>
          Lưu
        </Button>
        <Button
          variant="secondary"
          disabled={currentScreenIndex === 0}
          onClick={() => setCurrentScreenIndex((i) => Math.max(0, i - 1))}
        >
          Quay lại
        </Button>
        {isLastScreen ? (
          <Button variant="primary" disabled={!currentAnswered || submitting} onClick={handleSubmit}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Nộp bài
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={!currentAnswered}
            onClick={() => setCurrentScreenIndex((i) => Math.min(screens.length - 1, i + 1))}
          >
            Tiếp theo <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        )}
      </div>
    </div>
  );
};

const SetRow: React.FC<{
  lesson: Lesson;
  set: ExerciseSet;
  orderNumber: number;
  passageCount: number;
  status: SetStatus;
  isExpanded: boolean;
  onToggle: () => void;
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
  onAttemptUpdate: (status: { isPassed: boolean; attemptCount: number }) => void;
  onDraftSaved: (hasDraft: boolean) => void;
}> = ({ lesson, set, orderNumber, passageCount, status, isExpanded, onToggle, onSetFinished, onAttemptUpdate, onDraftSaved }) => {
  const typeTag = readingSetTypeTag(passageCount);

  return (
  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-slate-50">
      {isExpanded ? <ChevronDown className="h-5 w-5 text-slate-400 shrink-0" /> : <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" />}
      <span className="flex-1 text-base font-display font-black text-slate-900">Bài {orderNumber}</span>
      {typeTag && (
        <span className="text-[10.5px] font-bold text-slate-500 border border-slate-200 rounded-full px-2 py-0.5 shrink-0">
          {typeTag}
        </span>
      )}
      <span className="ml-auto flex items-center gap-2 shrink-0">
        {status === "passed" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
        <span className={`text-[10px] font-display font-bold uppercase px-2 py-0.5 rounded-full ${SET_STATUS_BADGE_CLASS[status]}`}>
          {SET_STATUS_LABEL[status]}
        </span>
      </span>
    </button>
    {isExpanded && (
      <div className="border-t border-slate-100 p-4">
        <ReadingExerciseSetBody
          lesson={lesson}
          set={{ id: set.id, title: set.title }}
          passageCount={passageCount}
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

export const ReadingSetListPage: React.FC<ReadingSetListPageProps> = ({ lesson, onBackToLesson, onSetFinished }) => {
  const { sets: allSets, loading: setsLoading } = useExerciseSets();
  const candidateSets = useMemo(
    () =>
      allSets
        .filter((s) => s.lessonId === lesson.id && s.category === "doc" && s.status === "published")
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [allSets, lesson.id],
  );
  const candidateSetIds = useMemo(() => candidateSets.map((s) => s.id), [candidateSets]);
  const { attemptsBySetId, loading: attemptsLoading, updateAttempt } = useExerciseSetAttempts(candidateSetIds);
  const { draftSetIds, loading: draftsLoading, markDraftSaved } = useExerciseSetDrafts(candidateSetIds);
  const { nonEmptySetIds, loading: nonEmptyLoading } = useNonEmptyReadingSetIds(candidateSetIds);
  const { passageCountBySetId, loading: passageCountsLoading } = useReadingSetPassageCounts(candidateSetIds);
  const lessonSets = useMemo(() => candidateSets.filter((s) => nonEmptySetIds.has(s.id)), [candidateSets, nonEmptySetIds]);
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);
  const title = "Bài tập đọc";

  if (setsLoading || attemptsLoading || draftsLoading || nonEmptyLoading || passageCountsLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <ExercisePageHeader title={title} onBackToLesson={onBackToLesson} />
        <div className="flex items-center justify-center min-h-64">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (lessonSets.length === 0) {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <ExercisePageHeader title={title} onBackToLesson={onBackToLesson} />
        <div className="text-center py-12">
          <p className="text-slate-500">{title} cho bài học này chưa được soạn.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <ExercisePageHeader title={title} onBackToLesson={onBackToLesson} />
      <div className="space-y-3">
        {lessonSets.map((set, index) => (
          <SetRow
            key={set.id}
            lesson={lesson}
            set={set}
            orderNumber={index + 1}
            passageCount={passageCountBySetId.get(set.id) ?? 0}
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
