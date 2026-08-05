import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, Loader2, RotateCcw, Headphones } from "lucide-react";
import { Button } from "../components/DesignSystem";
import { ExercisePageHeader } from "../components/ExercisePageHeader";
import { MultipleChoiceOptions } from "../components/MultipleChoiceOptions";
import { GrammarExercise, Lesson } from "../lib/appTypes";
import { useExerciseSets, type ExerciseSet } from "../lib/hooks/useExerciseSets";
import { useExerciseSetAttempt, useExerciseSetAttempts } from "../lib/hooks/useExerciseSetAttempt";
import { useExerciseSetDraft } from "../lib/hooks/useExerciseSetDraft";
import { useExerciseSetDrafts } from "../lib/hooks/useExerciseSetDrafts";
import { useNonEmptySetIds } from "../lib/hooks/useNonEmptySetIds";
import { useGrammarExercises } from "../lib/hooks/useGrammarExercises";
import { useMediaPlaybackUrl } from "../lib/hooks/useMediaPlaybackUrl";
import { pickHydrateSource } from "../lib/exerciseSetDraftLogic";
import { computeSetStatus, SET_STATUS_LABEL, SET_STATUS_BADGE_CLASS, type SetStatus } from "../lib/exerciseSetStatus";
import { joinBlankAnswers, splitBlankAnswers, serializeMatching, parseMatching } from "../lib/quizAnswerCodec";
import { supabase } from "../lib/supabase";
import { showToast } from "../lib/toast";

interface QuizSetListPageProps {
  lesson: Lesson;
  category: "nghe" | "doc";
  onBackToLesson: () => void;
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
}

interface QuizResult {
  score: number;
  total: number;
  correct: number;
  isPassed: boolean;
  revealed: boolean;
  xpEarned: number;
  bestScore: number;
  attemptCount: number;
  lessonQuizScore: number;
  blankResults: Record<string, boolean[]>;
  choiceResults: Record<string, boolean>;
  exerciseResults: Record<string, boolean>;
  correctAnswers?: Record<string, string>;
  explanations?: Record<string, string>;
}

const QUIZ_TYPE_LABELS: Record<string, string> = {
  multiple_choice: "Trắc nghiệm",
  text_fill_blank: "Điền vào chỗ trống",
  matching: "Ghép cặp",
};

function countBlankTokens(promptText: string): number {
  return (promptText.match(/\{\{blank\}\}/g) ?? []).length;
}

/** Click-để-ghép: chọn 1 từ Đức + 1 nghĩa Việt, khớp đúng thì khoá lại. Xáo trộn 1 lần khi mount (useMemo theo `pairs`, không đổi lại giữa các lần render). */
const MatchingExercise: React.FC<{
  pairs: { de: string; vi: string }[];
  matched: Record<string, string>;
  onMatch: (de: string, vi: string) => void;
}> = ({ pairs, matched, onMatch }) => {
  const [selectedDe, setSelectedDe] = useState("");
  const [selectedVi, setSelectedVi] = useState("");
  const shuffledDe = useMemo(() => [...pairs.map((p) => p.de)].sort(() => Math.random() - 0.5), [pairs]);
  const shuffledVi = useMemo(() => [...pairs.map((p) => p.vi)].sort(() => Math.random() - 0.5), [pairs]);

  React.useEffect(() => {
    if (!selectedDe || !selectedVi) return;
    onMatch(selectedDe, selectedVi);
    setSelectedDe("");
    setSelectedVi("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDe, selectedVi]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        {shuffledDe.map((de) => {
          const isMatched = !!matched[de];
          return (
            <button
              key={de}
              type="button"
              disabled={isMatched}
              onClick={() => setSelectedDe(de)}
              className={`w-full rounded-lg border px-2 py-1.5 text-xs font-bold text-center transition-colors ${
                isMatched
                  ? "bg-green-50 border-green-200 text-green-700 opacity-60 cursor-not-allowed"
                  : selectedDe === de
                    ? "border-orange-500 bg-orange-50 text-orange-700"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {de}
            </button>
          );
        })}
      </div>
      <div className="space-y-1.5">
        {shuffledVi.map((vi) => {
          const isMatched = Object.values(matched).includes(vi);
          return (
            <button
              key={vi}
              type="button"
              disabled={isMatched}
              onClick={() => setSelectedVi(vi)}
              className={`w-full rounded-lg border px-2 py-1.5 text-xs font-semibold text-center transition-colors ${
                isMatched
                  ? "bg-green-50 border-green-200 text-green-700 opacity-60 cursor-not-allowed"
                  : selectedVi === vi
                    ? "border-orange-500 bg-orange-50 text-orange-700"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {vi}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const QuizExerciseSetBody: React.FC<{
  lesson: Lesson;
  set: { id: string; title: string };
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
  onCollapse: () => void;
  onAttemptUpdate: (status: { isPassed: boolean; attemptCount: number }) => void;
  onDraftSaved: (hasDraft: boolean) => void;
}> = ({ lesson, set, onSetFinished, onCollapse, onAttemptUpdate, onDraftSaved }) => {
  const { exercises, loading: exercisesLoading, error: exercisesError } = useGrammarExercises(set.id);
  const { attempt, loading: attemptLoading } = useExerciseSetAttempt(set.id);
  const { draft, loading: draftLoading, saveDraft, deleteDraft } = useExerciseSetDraft(set.id);

  const [choiceByExercise, setChoiceByExercise] = useState<Record<string, number>>({});
  const [blankValuesByExercise, setBlankValuesByExercise] = useState<Record<string, string[]>>({});
  const [matchedPairsByExercise, setMatchedPairsByExercise] = useState<Record<string, Record<string, string>>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [retrying, setRetrying] = useState(false);
  const submissionIdRef = React.useRef(crypto.randomUUID());

  const hydrateSource = pickHydrateSource(draft !== null, attempt !== null);

  const applyAnswers = (answers: Record<string, string>) => {
    const choices: Record<string, number> = {};
    const blanks: Record<string, string[]> = {};
    const matches: Record<string, Record<string, string>> = {};
    for (const exercise of exercises) {
      const raw = answers[exercise.id] ?? "";
      if (exercise.type === "multiple_choice") {
        if (/^\d+$/.test(raw)) choices[exercise.id] = Number(raw);
      } else if (exercise.type === "text_fill_blank") {
        blanks[exercise.id] = splitBlankAnswers(raw, countBlankTokens(exercise.promptText ?? ""));
      } else if (exercise.type === "matching") {
        matches[exercise.id] = parseMatching(raw);
      }
    }
    setChoiceByExercise(choices);
    setBlankValuesByExercise(blanks);
    setMatchedPairsByExercise(matches);
  };

  React.useEffect(() => {
    if (retrying || exercises.length === 0 || hydrateSource !== "attempt" || !attempt) return;
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
      blankResults: attempt.blankResults,
      choiceResults: attempt.choiceResults,
      exerciseResults: attempt.exerciseResults,
    });
    applyAnswers(attempt.answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, retrying, exercises, hydrateSource]);

  React.useEffect(() => {
    if (retrying || exercises.length === 0 || hydrateSource !== "draft" || !draft) return;
    applyAnswers(draft.answers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, retrying, exercises, hydrateSource]);

  const getAnswerStringFor = (exercise: GrammarExercise): string => {
    if (exercise.type === "multiple_choice") {
      const index = choiceByExercise[exercise.id];
      return index === undefined ? "" : String(index);
    }
    if (exercise.type === "text_fill_blank") {
      const count = countBlankTokens(exercise.promptText ?? "");
      const values = blankValuesByExercise[exercise.id] ?? Array(count).fill("");
      if (values.length === 0 || values.some((v) => !v.trim())) return "";
      return joinBlankAnswers(values);
    }
    if (exercise.type === "matching") {
      const pairs = matchedPairsByExercise[exercise.id] ?? {};
      const total = exercise.matchingPairs?.length ?? 0;
      if (total === 0 || Object.keys(pairs).length < total) return "";
      return serializeMatching(pairs);
    }
    return "";
  };

  const allAnswered = exercises.every((exercise) => getAnswerStringFor(exercise) !== "");
  const collectAllAnswers = (): Record<string, string> =>
    Object.fromEntries(exercises.map((exercise) => [exercise.id, getAnswerStringFor(exercise)]));

  React.useEffect(() => {
    if (result !== null || exercises.length === 0) return;
    const timer = setTimeout(() => { saveDraft(collectAllAnswers()); }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choiceByExercise, blankValuesByExercise, matchedPairsByExercise, result]);

  const handleSubmit = async () => {
    const finalAnswers = collectAllAnswers();
    setSubmitting(true);
    setSubmitError(null);
    const { data, error } = await supabase.functions.invoke("grammar-submit", {
      body: { set_id: set.id, submission_id: submissionIdRef.current, answers: finalAnswers },
    });
    setSubmitting(false);
    if (error || !data) {
      setSubmitError("Không thể nộp bài. Vui lòng thử lại.");
      return;
    }
    const res = data as QuizResult;
    setResult(res);
    onAttemptUpdate({ isPassed: res.isPassed, attemptCount: res.attemptCount });
    deleteDraft();
    onDraftSaved(false);
    onSetFinished(res.lessonQuizScore, res.xpEarned);
  };

  const handleRetry = () => {
    submissionIdRef.current = crypto.randomUUID();
    setChoiceByExercise({});
    setBlankValuesByExercise({});
    setMatchedPairsByExercise({});
    setResult(null);
    setSubmitError(null);
    setRetrying(true);
  };

  const firstExercise = exercises[0];
  const clip = firstExercise?.audioClipId
    ? lesson.listeningClips.find((c) => c.id === firstExercise.audioClipId)
    : undefined;
  const passage = firstExercise?.readingPassageId
    ? lesson.readingPassages.find((p) => p.id === firstExercise.readingPassageId)
    : undefined;
  const audioPlayback = useMediaPlaybackUrl(lesson.id, "audio", clip?.r2Key, clip?.id);

  const awaitingHydration = hydrateSource === "attempt" && !retrying && exercises.length > 0 && result === null;

  if (exercisesLoading || attemptLoading || draftLoading || awaitingHydration) {
    return (
      <div className="flex items-center justify-center min-h-32">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (exercisesError || exercises.length === 0) {
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
            <div className="w-20 h-20 bg-green-50 border-2 border-green-200 rounded-full flex items-center justify-center mx-auto text-4xl animate-bounce">
              🎉
            </div>
          ) : (
            <div className="w-20 h-20 bg-rose-50 border-2 border-rose-200 rounded-full flex items-center justify-center mx-auto text-4xl">
              😟
            </div>
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
          <span className="text-[10px] text-slate-400 font-display font-bold uppercase tracking-wider block">
            KẾT QUẢ ĐẠT ĐƯỢC
          </span>
          <div className="flex items-baseline justify-center gap-1.5 mt-1">
            <span className={`text-4xl md:text-5xl font-display font-black ${isPassed ? "text-green-600" : "text-rose-600"}`}>
              {score}%
            </span>
            <span className="text-sm font-bold text-slate-500">({correct}/{total} câu)</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            Điểm cao nhất: <b className="text-slate-700">{result.bestScore}%</b> · Đã làm{" "}
            <b className="text-slate-700">{result.attemptCount}</b> lần
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
            {revealed ? "Giải thích từng câu hỏi:" : "Câu đúng / câu sai:"}
          </h4>
          <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
            {exercises.map((ex, index) => (
              <div key={ex.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/40 text-xs">
                <p className="font-display font-bold text-slate-800 leading-tight mb-1 whitespace-pre-wrap">
                  Câu {index + 1} · {QUIZ_TYPE_LABELS[ex.type] ?? ex.type}
                </p>
                {ex.type === "multiple_choice" && (
                  <div className="mb-2">
                    <MultipleChoiceOptions
                      options={ex.options ?? []}
                      selectedIndex={choiceByExercise[ex.id]}
                      onSelect={() => {}}
                      exerciseId={ex.id}
                      result={result.choiceResults?.[ex.id]}
                      correctIndex={revealed ? Number(result.correctAnswers?.[ex.id]) : undefined}
                    />
                  </div>
                )}
                {ex.type === "text_fill_blank" && (
                  // ponytail: server chưa trả correctAnswers cho type này (thiếu
                  // prompt_text trong select của grammar-submit) — chỉ tô đúng/sai,
                  // chưa hiện được đáp án đúng cụ thể. Thêm prompt_text + extractBlanks
                  // vào deriveCorrectAnswers nếu cần đủ.
                  <div className="mb-2 text-xs leading-9 text-slate-700">
                    {(ex.promptText ?? "").split("{{blank}}").map((segment, i, segments) => (
                      <React.Fragment key={`${i}:${segment}`}>
                        <span className="whitespace-pre-wrap">{segment}</span>
                        {i < segments.length - 1 && (
                          <span
                            className={`mx-1 inline-block min-w-20 rounded-md border px-2 py-1 text-center font-bold ${
                              result.blankResults?.[ex.id]?.[i]
                                ? "border-green-300 bg-green-50 text-green-700"
                                : "border-red-300 bg-red-50 text-red-700"
                            }`}
                          >
                            {(blankValuesByExercise[ex.id] ?? [])[i] || "—"}
                          </span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                )}
                {ex.type === "matching" && (
                  <div className="mb-2 space-y-1">
                    {(ex.matchingPairs ?? []).map((pair) => {
                      const userVi = matchedPairsByExercise[ex.id]?.[pair.de];
                      const isRight = userVi === pair.vi;
                      const correctPairs = revealed ? parseMatching(result.correctAnswers?.[ex.id] ?? "") : {};
                      return (
                        <div key={pair.de} className="flex items-center gap-2 text-xs">
                          <span className="flex-1 text-slate-700">{pair.de}</span>
                          <span
                            className={`rounded-md border px-2 py-1 font-bold ${
                              isRight
                                ? "border-green-300 bg-green-50 text-green-700"
                                : "border-red-300 bg-red-50 text-red-700"
                            }`}
                          >
                            {userVi ?? "—"}
                          </span>
                          {revealed && !isRight && correctPairs[pair.de] && (
                            <span className="rounded-md border border-green-300 bg-green-50 px-2 py-1 font-bold text-green-700">
                              {correctPairs[pair.de]}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {result.explanations?.[ex.id] && (
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    <b>Giải thích:</b> {result.explanations[ex.id]}
                  </p>
                )}
              </div>
            ))}
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

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {clip && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Headphones className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-display font-bold text-slate-800">Luyện nghe</span>
          </div>
          {audioPlayback.loading && <p className="text-xs text-slate-400">Đang tải...</p>}
          {audioPlayback.url && (
            <audio controls src={audioPlayback.url} className="w-full rounded-xl">
              Trình duyệt không hỗ trợ audio.
            </audio>
          )}
          {audioPlayback.error && (
            <p className="text-xs text-red-500">Không tải được audio: {audioPlayback.error}</p>
          )}
        </div>
      )}

      {passage && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">🇩🇪 Đoạn văn</span>
          <p className="text-sm text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">{passage.textDe}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {exercises.map((exercise, index) => (
          <div key={exercise.id} className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2">
            <span className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-wider">
              Câu {index + 1} · {QUIZ_TYPE_LABELS[exercise.type] ?? exercise.type}
            </span>
            {exercise.type === "multiple_choice" && (
              <MultipleChoiceOptions
                options={exercise.options ?? []}
                selectedIndex={choiceByExercise[exercise.id]}
                onSelect={(idx) => setChoiceByExercise((prev) => ({ ...prev, [exercise.id]: idx }))}
                exerciseId={exercise.id}
              />
            )}
            {exercise.type === "text_fill_blank" && (
              <p className="text-xs leading-9 text-slate-700">
                {(exercise.promptText ?? "").split("{{blank}}").map((segment, i, segments) => (
                  <React.Fragment key={`${i}:${segment}`}>
                    <span className="whitespace-pre-wrap">{segment}</span>
                    {i < segments.length - 1 && (
                      <input
                        type="text"
                        value={(blankValuesByExercise[exercise.id] ?? [])[i] ?? ""}
                        onChange={(e) => {
                          const count = countBlankTokens(exercise.promptText ?? "");
                          const current = blankValuesByExercise[exercise.id] ?? Array(count).fill("");
                          const next = [...current];
                          next[i] = e.target.value;
                          setBlankValuesByExercise((prev) => ({ ...prev, [exercise.id]: next }));
                        }}
                        className="mx-1 inline-block w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                      />
                    )}
                  </React.Fragment>
                ))}
              </p>
            )}
            {exercise.type === "matching" && (
              <MatchingExercise
                pairs={exercise.matchingPairs ?? []}
                matched={matchedPairsByExercise[exercise.id] ?? {}}
                onMatch={(de, vi) => {
                  const correct = (exercise.matchingPairs ?? []).find((p) => p.de === de && p.vi === vi);
                  if (!correct) return;
                  setMatchedPairsByExercise((prev) => ({
                    ...prev,
                    [exercise.id]: { ...(prev[exercise.id] ?? {}), [de]: vi },
                  }));
                }}
              />
            )}
          </div>
        ))}
      </div>

      {submitError && <p className="text-sm text-red-500 text-center">{submitError}</p>}

      <div className="flex justify-end gap-3">
        <Button
          variant="secondary"
          onClick={async () => {
            const { error } = await saveDraft(collectAllAnswers());
            if (error) {
              showToast("Không thể lưu, vui lòng thử lại.", "warning");
              return;
            }
            showToast("Đã lưu bài làm dở.", "success");
            onDraftSaved(true);
          }}
        >
          Lưu
        </Button>
        <Button variant="primary" disabled={!allAnswered || submitting} onClick={handleSubmit}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Nộp bài
        </Button>
      </div>
    </div>
  );
};

const SetRow: React.FC<{
  lesson: Lesson;
  set: ExerciseSet;
  orderNumber: number;
  status: SetStatus;
  isExpanded: boolean;
  onToggle: () => void;
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
  onAttemptUpdate: (status: { isPassed: boolean; attemptCount: number }) => void;
  onDraftSaved: (hasDraft: boolean) => void;
}> = ({ lesson, set, orderNumber, status, isExpanded, onToggle, onSetFinished, onAttemptUpdate, onDraftSaved }) => (
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
      <span className="flex-1 text-base font-display font-black text-slate-900">Bài {orderNumber}</span>
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
        <QuizExerciseSetBody
          lesson={lesson}
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

export const QuizSetListPage: React.FC<QuizSetListPageProps> = ({
  lesson,
  category,
  onBackToLesson,
  onSetFinished,
}) => {
  const { sets: allSets, loading: setsLoading } = useExerciseSets();
  const candidateSets = useMemo(
    () =>
      allSets
        .filter((s) => s.lessonId === lesson.id && s.category === category && s.status === "published")
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [allSets, lesson.id, category],
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
  const title = category === "nghe" ? "Bài tập nghe" : "Bài tập đọc";

  if (setsLoading || attemptsLoading || draftsLoading || nonEmptyLoading) {
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
