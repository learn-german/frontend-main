import React, { useState, useMemo } from "react";
import { Loader2, RotateCcw, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { Button } from "../components/DesignSystem";
import { showToast } from "../lib/toast";
import { GrammarExerciseHint } from "../components/GrammarExerciseHint";
import { ExerciseAnswerInput, SubmittedAnswer, ExerciseResultReview } from "../components/ExerciseAnswerInput";
import { GrammarExercise } from "../lib/appTypes";
import { useGrammarExercises } from "../lib/hooks/useGrammarExercises";
import { groupGrammarExercises } from "../lib/grammarExerciseGroups";
import {
  applyChipToBlank,
  applyTypedBlankAnswer,
  countBlankMarkers,
  findBlankTarget,
  getUsedWordIndexes,
  type BlankAssignments,
  type BlankFocus,
} from "../lib/grammarFillInBlank";
import { supabase } from "../lib/supabase";
import { parseAnswer, parseAnswersIntoFormState, serializeAnswer, type ParsedAnswer } from "../lib/grammarAnswerCodec";
import { useExerciseSetAttempt } from "../lib/hooks/useExerciseSetAttempt";
import { useExerciseSetDraft } from "../lib/hooks/useExerciseSetDraft";
import { pickHydrateSource } from "../lib/exerciseSetDraftLogic";

interface GrammarExerciseSetBodyProps {
  set: { id: string; title: string };
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
  onCollapse: () => void;
  /** Cập nhật badge "Đã đạt"/"Chưa làm" ở danh sách set ngay sau khi nộp bài. */
  onAttemptUpdate?: (status: { isPassed: boolean; attemptCount: number }) => void;
  /** Cập nhật badge "Đang làm" ở danh sách set ngay sau khi Lưu/Nộp bài. */
  onDraftSaved?: (hasDraft: boolean) => void;
}

interface GrammarResult {
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
  classificationResults: Record<string, boolean[]>;
  correctAnswers?: Record<string, string>;
  explanations?: Record<string, string>;
}

export const GRAMMAR_TYPE_LABELS: Record<GrammarExercise["type"], string> = {
  word_reorder: "Sắp xếp từ",
  error_correction: "Sửa câu sai",
  translation: "Dịch",
  sentence_transformation: "Biến đổi câu",
  guided_sentence_writing: "Viết câu gợi ý",
  classification: "Phân loại",
  fill_in_the_blank: "Điền vào ô trống",
  multiple_choice: "Trắc nghiệm",
  text_fill_blank: "Điền vào chỗ trống",
  matching: "Ghép cặp",
};

const GRAMMAR_TYPE_INSTRUCTIONS: Record<GrammarExercise["type"], string> = {
  word_reorder: "Sắp xếp các từ sau thành câu đúng:",
  error_correction: "Sửa câu sau cho đúng:",
  translation: "Dịch câu sau sang tiếng Đức:",
  sentence_transformation: "Biến đổi câu sau theo yêu cầu:",
  guided_sentence_writing: "Viết câu hoàn chỉnh từ dữ liệu gợi ý sau:",
  classification: "Phân loại các item sau vào đúng nhóm:",
  fill_in_the_blank: "Điền từ thích hợp vào từng ô trống:",
  multiple_choice: "Chọn một đáp án đúng cho mỗi câu:",
  text_fill_blank: "Điền vào chỗ trống:",
  matching: "Ghép cặp từ tương ứng:",
};

export const GrammarExerciseSetBody: React.FC<GrammarExerciseSetBodyProps> = ({
  set,
  onSetFinished,
  onCollapse,
  onAttemptUpdate,
  onDraftSaved,
}) => {
  const { exercises, loading: exercisesLoading, error: exercisesError } = useGrammarExercises(set.id);
  const { attempt, loading: attemptLoading } = useExerciseSetAttempt(set.id);
  const { draft, loading: draftLoading, saveDraft, deleteDraft } = useExerciseSetDraft(set.id);

  const groups = useMemo(() => groupGrammarExercises(exercises), [exercises]);
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());

  const [selectedTokensByExercise, setSelectedTokensByExercise] = useState<Record<string, string[]>>({});
  const [textAnswerByExercise, setTextAnswerByExercise] = useState<Record<string, string>>({});
  const [itemGroupsByExercise, setItemGroupsByExercise] = useState<Record<string, Record<string, string>>>({});
  const [blankAnswersByExercise, setBlankAnswersByExercise] = useState<Record<string, string[]>>({});
  const [blankAssignments, setBlankAssignments] = useState<BlankAssignments>({});
  const [focusedBlank, setFocusedBlank] = useState<BlankFocus | null>(null);
  const [choiceByExercise, setChoiceByExercise] = useState<Record<string, number>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<GrammarResult | null>(null);

  // Single source of truth for the results card's submitted-answer echo, for
  // both the live-submit path and the post-refresh hydrate path. Keyed by
  // exercise id, wire-format strings exactly as sent to / read from the server.
  const [submittedAnswerSnapshot, setSubmittedAnswerSnapshot] = useState<Record<string, string>>({});

  // Set when the learner hits "Làm lại": keeps the hydrate effect from pouring
  // the saved attempt back into the form they just cleared.
  const [retrying, setRetrying] = useState(false);

  // Sinh 1 lần khi mount hoặc khi bấm "Làm lại" — giữ nguyên cho mọi lần
  // bấm "Nộp bài" trong cùng 1 lượt làm, để server nhận diện double-click/
  // retry qua đúng submission_id và không tăng attempt_count sai.
  const submissionIdRef = React.useRef(crypto.randomUUID());

  // Draft luôn thắng nếu tồn tại — học viên đang làm dở quan trọng hơn kết
  // quả đã nộp trước đó (xem exerciseSetDraftLogic.ts).
  const hydrateSource = pickHydrateSource(draft !== null, attempt !== null);

  React.useEffect(() => {
    // draftLoading: chờ draft load xong trước khi tin hydrateSource === "attempt"
    // — draft và attempt fetch độc lập, không có gì đảm bảo thứ tự resolve. Nếu
    // attempt resolve trước, hydrateSource tạm thời báo "attempt" (draft vẫn null
    // vì chưa load xong) và effect này set result — nhưng khi draft load xong
    // ngay sau đó và hoá ra tồn tại, hydrateSource đổi thành "draft" mà không có
    // gì tự xoá result đã set, kẹt ở card kết quả cũ thay vì form đang làm dở.
    if (retrying || exercises.length === 0 || draftLoading || hydrateSource !== "attempt" || !attempt) return;

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
      classificationResults: attempt.classificationResults,
      // correctAnswers/explanations không hydrate lại từ đây — chỉ set này
      // nhận được lúc submit thật (revealed=true tại thời điểm đó). Nếu học
      // viên rời trang rồi quay lại sau khi đã revealed, phần dưới ẩn card
      // giải thích thay vì hiện field rỗng — chấp nhận được, ưu tiên không
      // lưu correct_answer ra localStorage/state ngoài phiên submit gốc.
    });

    const parsed = parseAnswersIntoFormState(exercises, attempt.answers);
    setTextAnswerByExercise(parsed.textAnswers);
    setBlankAnswersByExercise(parsed.blankAnswers);
    setItemGroupsByExercise(parsed.itemGroups);
    setChoiceByExercise(parsed.choices);
    setSelectedTokensByExercise(parsed.selectedTokens);
    setSubmittedAnswerSnapshot(attempt.answers ?? {});
  }, [attempt, retrying, exercises, hydrateSource, draftLoading]);

  React.useEffect(() => {
    if (retrying || exercises.length === 0 || hydrateSource !== "draft" || !draft) return;

    const parsed = parseAnswersIntoFormState(exercises, draft.answers);
    setTextAnswerByExercise(parsed.textAnswers);
    setBlankAnswersByExercise(parsed.blankAnswers);
    setItemGroupsByExercise(parsed.itemGroups);
    setChoiceByExercise(parsed.choices);
    setSelectedTokensByExercise(parsed.selectedTokens);
  }, [draft, retrying, exercises, hydrateSource]);

  const toggleToken = (exerciseId: string, token: string, tokenIdx: number) => {
    const key = `${tokenIdx}:${token}`;
    setSelectedTokensByExercise((prev) => {
      const current = prev[exerciseId] ?? [];
      const next = current.includes(key) ? current.filter((t) => t !== key) : [...current, key];
      return { ...prev, [exerciseId]: next };
    });
  };

  const getParsedAnswerFor = (exercise: GrammarExercise): ParsedAnswer => {
    if (exercise.type === "word_reorder") {
      const tokens = selectedTokensByExercise[exercise.id] ?? [];
      return { kind: "text", value: tokens.map((t) => t.split(":").slice(1).join(":")).join(" ") };
    }
    if (exercise.type === "classification") {
      return { kind: "groups", values: itemGroupsByExercise[exercise.id] ?? {} };
    }
    if (exercise.type === "fill_in_the_blank") {
      const blankCount = countBlankMarkers(exercise.promptText ?? "");
      return {
        kind: "blanks",
        values: blankAnswersByExercise[exercise.id] ?? Array(blankCount).fill(""),
      };
    }
    if (exercise.type === "multiple_choice") {
      return { kind: "choice", index: choiceByExercise[exercise.id] };
    }
    return { kind: "text", value: textAnswerByExercise[exercise.id] ?? "" };
  };

  const getAnswerStringFor = (exercise: GrammarExercise): string =>
    serializeAnswer(exercise, getParsedAnswerFor(exercise));

  /** Text-typed submitted answer for the results card, read from the one
   * snapshot shared by the live-submit and hydrate-after-refresh paths. */
  const getSubmittedTextFor = (exercise: GrammarExercise): string => {
    const raw = submittedAnswerSnapshot[exercise.id];
    if (raw === undefined) return "";
    const parsed = parseAnswer(exercise, raw);
    return parsed.kind === "text" ? parsed.value : "";
  };

  const allAnswered = exercises.every((exercise) => getAnswerStringFor(exercise) !== "");

  const collectAllAnswers = (): Record<string, string> =>
    Object.fromEntries(exercises.map((exercise) => [exercise.id, getAnswerStringFor(exercise)]));

  // Autosave draft debounce — chỉ chạy khi chưa có kết quả (chưa nộp/chưa
  // hydrate từ attempt), tránh ghi đè draft sau khi đã nộp bài xong.
  React.useEffect(() => {
    if (result !== null || exercises.length === 0) return;
    const timer = setTimeout(() => {
      saveDraft(collectAllAnswers()).then(({ error }) => {
        if (!error) onDraftSaved?.(true);
      });
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTokensByExercise, textAnswerByExercise, itemGroupsByExercise, blankAnswersByExercise, choiceByExercise, result]);

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

    const res = data as GrammarResult;
    setResult(res);
    setSubmittedAnswerSnapshot(finalAnswers);
    onAttemptUpdate?.({ isPassed: res.isPassed, attemptCount: res.attemptCount });
    deleteDraft();
    onDraftSaved?.(false);
    // Report rollup theo cả lesson (không phải điểm riêng set này) — khớp
    // đúng giá trị server vừa ghi vào lesson_progress.quiz_score, để state
    // optimistic phía client (Roadmap/Dashboard) không lệch server.
    onSetFinished(res.lessonQuizScore, res.xpEarned);
  };

  const handleRetry = () => {
    submissionIdRef.current = crypto.randomUUID();
    setExpandedGroupKeys(new Set());
    setSelectedTokensByExercise({});
    setTextAnswerByExercise({});
    setItemGroupsByExercise({});
    setBlankAnswersByExercise({});
    setBlankAssignments({});
    setFocusedBlank(null);
    setChoiceByExercise({});
    setResult(null);
    setSubmitError(null);
    setRetrying(true);
  };

  // Mirrors the attempt-hydrate effect's own guard exactly: true only when
  // that effect is guaranteed to run and set `result` next. Draft hydrate
  // never sets `result`, so it never needs this wait.
  const awaitingHydration =
    hydrateSource === "attempt" && !retrying && exercises.length > 0 && result === null;

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
        <p className="text-slate-500">Bài tập ngữ pháp cho bài học này chưa được soạn.</p>
      </div>
    );
  }

  if (result) {
    const { score, total, correct, isPassed, revealed, xpEarned } = result;

    return (
      <div
        id="grammar-result-card"
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
            {groups.map((group, groupIndex) => (
              <div key={group.key} className="space-y-1.5">
                <p className="text-xs font-display font-bold text-slate-700">
                  Bài {groupIndex + 1}: {GRAMMAR_TYPE_LABELS[group.type]}
                </p>
                {group.exercises.map((ex, childIndex) => (
                  <ExerciseResultReview
                    key={ex.id}
                    exercise={ex}
                    numberLabel={`${groupIndex + 1}.${childIndex + 1}`}
                    revealed={revealed}
                    submittedText={getSubmittedTextFor(ex)}
                    exerciseCorrect={result.exerciseResults?.[ex.id]}
                    correctAnswerRaw={result.correctAnswers?.[ex.id]}
                    userGroups={itemGroupsByExercise[ex.id] ?? {}}
                    classificationResults={result.classificationResults?.[ex.id]}
                    blankValues={blankAnswersByExercise[ex.id] ?? []}
                    blankResults={result.blankResults?.[ex.id]}
                    selectedChoice={choiceByExercise[ex.id]}
                    choiceResult={result.choiceResults?.[ex.id]}
                    matchedPairs={{}}
                    explanation={result.explanations?.[ex.id]}
                  />
                ))}
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

  // Nội dung 1 nhóm câu hỏi (hint, hướng dẫn, word bank, danh sách câu) —
  // dùng chung cho cả 2 cách hiển thị bên dưới: nếu set chỉ có 1 nhóm, nội
  // dung này hiện thẳng ra ngoài (khỏi bấm thêm 1 lần nữa); nếu set có nhiều
  // nhóm, mỗi nhóm vẫn là 1 accordion con như cũ.
  const renderGroupContent = (group: (typeof groups)[number], groupIndex: number) => {
    const wordBank = group.exercises[0]?.wordBank;
    const groupExerciseIds = new Set(group.exercises.map((exercise) => exercise.id));
    const groupAssignments = Object.fromEntries(
      Object.entries(blankAssignments).filter(([key]) => groupExerciseIds.has(key.slice(0, key.lastIndexOf(":")))),
    );
    const usedWordIndexes = getUsedWordIndexes(groupAssignments);

    return (
      <div className="space-y-3">
        <GrammarExerciseHint hint={group.exercises[0]?.hint} groupKey={group.key} />
        <p className="text-sm text-slate-500">{GRAMMAR_TYPE_INSTRUCTIONS[group.type]}</p>
        {group.type === "fill_in_the_blank" && wordBank && (
          <div className="flex flex-wrap gap-2 rounded-xl border border-orange-100 bg-orange-50/50 p-3">
            {wordBank.words.map((word, wordIndex) => {
              const used = usedWordIndexes.has(wordIndex);
              const disabled = wordBank.mode === "single_use" && used;
              return (
                <button
                  key={`${wordIndex}:${word}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const answersWithDefaults = Object.fromEntries(group.exercises.map((exercise) => [
                      exercise.id,
                      blankAnswersByExercise[exercise.id]
                        ?? Array(countBlankMarkers(exercise.promptText ?? "")).fill(""),
                    ]));
                    const target = findBlankTarget(
                      group.exercises.map((exercise) => exercise.id),
                      answersWithDefaults,
                      focusedBlank,
                    );
                    if (!target) return;
                    const next = applyChipToBlank(
                      { ...blankAnswersByExercise, ...answersWithDefaults },
                      blankAssignments,
                      target,
                      wordIndex,
                      word,
                      wordBank.mode,
                    );
                    setBlankAnswersByExercise(next.answers);
                    setBlankAssignments(next.assignments);
                    setFocusedBlank(target);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                    used
                      ? "border-orange-200 bg-orange-100 text-orange-500 opacity-60"
                      : "border-orange-300 bg-white text-orange-700 hover:bg-orange-100"
                  } disabled:cursor-not-allowed`}
                >
                  {word}
                </button>
              );
            })}
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {group.exercises.map((exercise, childIndex) => (
            <ExerciseAnswerInput
              key={exercise.id}
              exercise={exercise}
              numberLabel={`${groupIndex + 1}.${childIndex + 1}`}
              selectedTokens={selectedTokensByExercise[exercise.id] ?? []}
              onToggleToken={(token, tokenIdx) => toggleToken(exercise.id, token, tokenIdx)}
              onClearTokens={() => setSelectedTokensByExercise((prev) => ({ ...prev, [exercise.id]: [] }))}
              textAnswer={textAnswerByExercise[exercise.id] ?? ""}
              onTextAnswerChange={(value) => setTextAnswerByExercise((prev) => ({ ...prev, [exercise.id]: value }))}
              itemGroups={itemGroupsByExercise[exercise.id] ?? {}}
              onItemGroupChange={(item, itemGroup) => setItemGroupsByExercise((prev) => ({
                ...prev,
                [exercise.id]: { ...(prev[exercise.id] ?? {}), [item]: itemGroup },
              }))}
              blankAnswers={blankAnswersByExercise[exercise.id]
                ?? Array(countBlankMarkers(exercise.promptText ?? "")).fill("")}
              onBlankFocus={(blankIndex) => setFocusedBlank({ exerciseId: exercise.id, blankIndex })}
              onBlankAnswerChange={(blankIndex, value) => {
                const target = { exerciseId: exercise.id, blankIndex };
                const answersWithDefaults = {
                  ...blankAnswersByExercise,
                  [exercise.id]: blankAnswersByExercise[exercise.id]
                    ?? Array(countBlankMarkers(exercise.promptText ?? "")).fill(""),
                };
                const next = applyTypedBlankAnswer(answersWithDefaults, blankAssignments, target, value);
                setBlankAnswersByExercise(next.answers);
                setBlankAssignments(next.assignments);
              }}
              selectedChoice={choiceByExercise[exercise.id]}
              onSelectChoice={(index) =>
                setChoiceByExercise((prev) => ({ ...prev, [exercise.id]: index }))
              }
              choiceResult={result?.choiceResults?.[exercise.id]}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="space-y-3">
        {groups.length === 1 ? (
          renderGroupContent(groups[0], 0)
        ) : (
          groups.map((group, groupIndex) => {
            const isExpanded = expandedGroupKeys.has(group.key);
            const isComplete = group.exercises.every((exercise) => getAnswerStringFor(exercise) !== "");
            return (
              <section key={group.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setExpandedGroupKeys((previous) => {
                    const next = new Set(previous);
                    if (next.has(group.key)) next.delete(group.key);
                    else next.add(group.key);
                    return next;
                  })}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-slate-50"
                >
                  {isExpanded ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
                  <span className="text-base font-display font-black text-slate-900">Bài {groupIndex + 1}</span>
                  <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700">{GRAMMAR_TYPE_LABELS[group.type]}</span>
                  <span className="text-xs text-slate-400">{group.exercises.length} câu</span>
                  {isComplete && <CheckCircle2 className="ml-auto h-5 w-5 text-green-500" />}
                </button>
                {isExpanded && (
                  <div className="border-t border-slate-100 p-4">
                    {renderGroupContent(group, groupIndex)}
                  </div>
                )}
              </section>
            );
          })
        )}
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
            onDraftSaved?.(true);
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
