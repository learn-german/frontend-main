import React, { useState, useMemo } from "react";
import { Loader2, ArrowRight, RotateCcw, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { Button } from "../components/DesignSystem";
import { ExercisePageHeader } from "../components/ExercisePageHeader";
import { GrammarExerciseHint } from "../components/GrammarExerciseHint";
import { MultipleChoiceOptions } from "../components/MultipleChoiceOptions";
import { Lesson, GrammarExercise } from "../lib/appTypes";
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
import { serializeAnswer, type ParsedAnswer } from "../lib/grammarAnswerCodec";

interface GrammarExercisePageProps {
  lesson: Lesson;
  onQuizFinished: (scorePercentage: number, xpEarned: number) => void;
  onNavigateHome: () => void;
  onNextLesson: () => void;
  onBackToLesson: () => void;
}

interface GrammarResult {
  score: number;
  total: number;
  passed: boolean;
  xp_earned: number;
  blankResults: Record<string, boolean[]>;
  choiceResults: Record<string, boolean>;
}

const GRAMMAR_TYPE_LABELS: Record<GrammarExercise["type"], string> = {
  word_reorder: "Sắp xếp từ",
  error_correction: "Sửa câu sai",
  translation: "Dịch",
  sentence_transformation: "Biến đổi câu",
  guided_sentence_writing: "Viết câu gợi ý",
  classification: "Phân loại",
  fill_in_the_blank: "Điền vào ô trống",
  multiple_choice: "Trắc nghiệm",
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
};

/** Auto-growing answer box so long answers stay fully visible instead of scrolling out of a one-line input. */
const TextAnswerField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}> = ({ value, onChange, placeholder }) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      rows={2}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
      className="w-full resize-none overflow-hidden break-words px-2.5 py-2 text-xs leading-relaxed border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
      placeholder={placeholder}
    />
  );
};

const ExerciseCard: React.FC<{
  exercise: GrammarExercise;
  numberLabel: string;
  selectedTokens: string[];
  onToggleToken: (token: string, tokenIdx: number) => void;
  onClearTokens: () => void;
  textAnswer: string;
  onTextAnswerChange: (value: string) => void;
  itemGroups: Record<string, string>;
  onItemGroupChange: (item: string, group: string) => void;
  blankAnswers: string[];
  onBlankFocus: (blankIndex: number) => void;
  onBlankAnswerChange: (blankIndex: number, value: string) => void;
  blankResults?: boolean[];
  selectedChoice: number | undefined;
  onSelectChoice: (index: number) => void;
  choiceResult?: boolean;
}> = ({
  exercise,
  numberLabel,
  selectedTokens,
  onToggleToken,
  onClearTokens,
  textAnswer,
  onTextAnswerChange,
  itemGroups,
  onItemGroupChange,
  blankAnswers,
  onBlankFocus,
  onBlankAnswerChange,
  blankResults,
  selectedChoice,
  onSelectChoice,
  choiceResult,
}) => {
  const letter = numberLabel;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2">
      {exercise.type === "word_reorder" && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-display font-bold text-slate-400 shrink-0">{letter}</span>
            {(exercise.tokens ?? []).map((token, i) => {
              const key = `${i}:${token}`;
              const selected = selectedTokens.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => onToggleToken(token, i)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
                    selected
                      ? "bg-orange-50 border-orange-300 text-orange-700"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {token}
                </button>
              );
            })}
          </div>
          <div className="min-h-[2.5rem] p-2.5 bg-slate-50/50 rounded-lg border border-dashed border-slate-200 text-xs font-medium text-slate-800">
            {selectedTokens.length > 0
              ? selectedTokens.map((t) => t.split(":").slice(1).join(":")).join(" ")
              : "Câu của bạn sẽ hiện ở đây..."}
          </div>
          {selectedTokens.length > 0 && (
            <button onClick={onClearTokens} className="text-[11px] font-bold text-slate-400 hover:text-slate-600">
              Xóa hết
            </button>
          )}
        </>
      )}

      {exercise.type === "error_correction" && (
        <>
          <p className="text-xs bg-red-50 text-red-700 rounded-lg px-2.5 py-2">
            <span className="font-bold text-red-400">{letter}</span> {exercise.promptText}
          </p>
          <TextAnswerField value={textAnswer} onChange={onTextAnswerChange} placeholder="Nhập câu đúng..." />
        </>
      )}

      {exercise.type === "translation" && (
        <>
          <p className="text-xs bg-slate-50 text-slate-700 rounded-lg px-2.5 py-2">
            <span className="font-bold text-slate-400">{letter}</span> {exercise.promptText}
          </p>
          <TextAnswerField value={textAnswer} onChange={onTextAnswerChange} placeholder="Nhập câu tiếng Đức..." />
        </>
      )}

      {exercise.type === "sentence_transformation" && (
        <>
          <p className="text-xs bg-slate-50 text-slate-700 rounded-lg px-2.5 py-2">
            <span className="font-bold text-slate-400">{letter}</span> {exercise.promptText}
          </p>
          {exercise.transformationHint && (
            <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 uppercase">
              Yêu cầu: {exercise.transformationHint}
            </span>
          )}
          <TextAnswerField value={textAnswer} onChange={onTextAnswerChange} placeholder="Nhập câu sau khi biến đổi..." />
        </>
      )}

      {exercise.type === "guided_sentence_writing" && (
        <>
          <p className="text-xs bg-slate-50 text-slate-700 rounded-lg px-2.5 py-2">
            <span className="font-bold text-slate-400">{letter}</span> {exercise.promptText}
          </p>
          <TextAnswerField value={textAnswer} onChange={onTextAnswerChange} placeholder="Viết câu hoàn chỉnh..." />
        </>
      )}

      {exercise.type === "classification" && (
        <>
          <span className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-wider">{letter}</span>
          <div className="space-y-1.5">
            {(exercise.classificationItems ?? []).map((item) => (
              <div key={item} className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-800 flex-1">{item}</span>
                <select
                  value={itemGroups[item] ?? ""}
                  onChange={(e) => onItemGroupChange(item, e.target.value)}
                  className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                >
                  <option value="">-- Chọn nhóm --</option>
                  {(exercise.classificationGroups ?? []).map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </>
      )}

      {exercise.type === "fill_in_the_blank" && (
        <div className="text-xs leading-9 text-slate-700">
          <span className="mr-1 font-bold text-slate-400">{letter}</span>
          {(exercise.promptText ?? "").split("___").map((segment, index, segments) => (
            <React.Fragment key={`${index}:${segment}`}>
              <span className="whitespace-pre-wrap">{segment}</span>
              {index < segments.length - 1 && (
                <input
                  type="text"
                  value={blankAnswers[index] ?? ""}
                  onFocus={() => onBlankFocus(index)}
                  onChange={(event) => onBlankAnswerChange(index, event.target.value)}
                  className={`mx-1 inline-block w-28 rounded-lg border px-2 py-1.5 text-center text-xs focus:outline-none focus:ring-2 ${
                    blankResults?.[index] === true
                      ? "border-green-400 bg-green-50 text-green-800 focus:ring-green-500/20"
                      : blankResults?.[index] === false
                        ? "border-red-400 bg-red-50 text-red-800 focus:ring-red-500/20"
                        : "border-slate-200 bg-white focus:border-orange-500 focus:ring-orange-500/20"
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {exercise.type === "multiple_choice" && (
        <>
          <p className="text-xs bg-slate-50 text-slate-700 rounded-lg px-2.5 py-2">
            <span className="font-bold text-slate-400">{letter}</span> {exercise.promptText}
          </p>
          <MultipleChoiceOptions
            options={exercise.options ?? []}
            selectedIndex={selectedChoice}
            onSelect={onSelectChoice}
            exerciseId={exercise.id}
            result={choiceResult}
          />
        </>
      )}
    </div>
  );
};

export const GrammarExercisePage: React.FC<GrammarExercisePageProps> = ({
  lesson,
  onQuizFinished,
  onNavigateHome,
  onNextLesson,
  onBackToLesson,
}) => {
  const { exercises, loading: exercisesLoading, error: exercisesError } = useGrammarExercises(lesson.id);

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

  const allAnswered = exercises.every((exercise) => getAnswerStringFor(exercise) !== "");

  const collectAllAnswers = (): Record<string, string> =>
    Object.fromEntries(exercises.map((exercise) => [exercise.id, getAnswerStringFor(exercise)]));

  const handleSubmit = async () => {
    const finalAnswers = collectAllAnswers();

    setSubmitting(true);
    setSubmitError(null);

    const { data, error } = await supabase.functions.invoke("grammar-submit", {
      body: { lesson_id: lesson.id, answers: finalAnswers },
    });

    setSubmitting(false);

    if (error || !data) {
      setSubmitError("Không thể nộp bài. Vui lòng thử lại.");
      return;
    }

    const res = data as GrammarResult;
    setResult(res);
    onQuizFinished(res.score, res.xp_earned);
  };

  const handleRetry = () => {
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
  };

  if (exercisesLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-8">
        <ExercisePageHeader title="Bài tập ngữ pháp" onBackToLesson={onBackToLesson} />
        <div className="flex items-center justify-center min-h-64">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (exercisesError || exercises.length === 0) {
    return (
      <div className="max-w-5xl mx-auto space-y-8">
        <ExercisePageHeader title="Bài tập ngữ pháp" onBackToLesson={onBackToLesson} />
        <div className="text-center py-12">
          <p className="text-slate-500">Bài tập ngữ pháp cho bài học này chưa được soạn.</p>
        </div>
      </div>
    );
  }

  if (result) {
    const { score, total, passed, xp_earned } = result;
    const correctCount = Math.round((score / 100) * total);

    return (
      <div className="max-w-5xl mx-auto space-y-8">
        <ExercisePageHeader title="Bài tập ngữ pháp" onBackToLesson={onBackToLesson} />
        <div
          id="grammar-result-card"
          className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200/60 p-6 sm:p-10 shadow-sm text-center space-y-6 animate-in zoom-in duration-300"
        >
        <div className="space-y-2">
          {passed ? (
            <div className="w-20 h-20 bg-green-50 border-2 border-green-200 rounded-full flex items-center justify-center mx-auto text-4xl animate-bounce">
              🎉
            </div>
          ) : (
            <div className="w-20 h-20 bg-rose-50 border-2 border-rose-200 rounded-full flex items-center justify-center mx-auto text-4xl">
              😟
            </div>
          )}
          <h2 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight leading-normal">
            {passed ? "Xuất sắc! Bạn đã vượt qua!" : "Cố gắng chút nữa nhé!"}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto font-sans leading-normal">
            {passed
              ? "Tuyệt vời, bạn đã tiếp thu bài học cực tốt và sẵn sàng mở khóa các lớp thử thách tiếp theo!"
              : "Để hoàn thiện bài học, bạn cần đạt tối thiểu 80% điểm số. Đừng nản lòng nhé!"}
          </p>
        </div>

        <div className="p-6 bg-slate-50/50 rounded-2xl border border-slate-100 max-w-xs mx-auto">
          <span className="text-[10px] text-slate-400 font-display font-bold uppercase tracking-wider block">
            KẾT QUẢ ĐẠT ĐƯỢC
          </span>
          <div className="flex items-baseline justify-center gap-1.5 mt-1">
            <span className={`text-4xl md:text-5xl font-display font-black ${passed ? "text-green-600" : "text-rose-600"}`}>
              {score}%
            </span>
            <span className="text-sm font-bold text-slate-500">({correctCount}/{total} câu)</span>
          </div>
          {xp_earned > 0 && (
            <span className="inline-block text-[10px] font-display font-bold px-2.5 py-0.5 rounded-full mt-2.5 uppercase bg-green-50 text-green-700">
              +{xp_earned} XP Tích lũy
            </span>
          )}
          {!passed && (
            <span className="inline-block text-[10px] font-display font-bold px-2.5 py-0.5 rounded-full mt-2.5 uppercase bg-rose-50 text-rose-700">
              Chưa đạt chuẩn 80%
            </span>
          )}
        </div>

        <div className="text-left space-y-3 pt-4 border-t border-slate-100">
          <h4 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest">
            Giải thích từng câu hỏi:
          </h4>
          <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
            {groups.map((group, groupIndex) => (
              <div key={group.key} className="space-y-1.5">
                <p className="text-xs font-display font-bold text-slate-700">
                  Bài {groupIndex + 1}: {GRAMMAR_TYPE_LABELS[group.type]}
                </p>
                {group.exercises.map((ex, childIndex) => (
                  <div key={ex.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/40 text-xs">
                    <p className="font-display font-bold text-slate-800 leading-tight mb-1 whitespace-pre-wrap">
                      {groupIndex + 1}.{childIndex + 1} {ex.promptText ?? "Phân loại"}
                    </p>
                    {ex.type === "fill_in_the_blank" && (
                      <div className="mb-2 text-xs leading-9 text-slate-700">
                        {(ex.promptText ?? "").split("___").map((segment, index, segments) => (
                          <React.Fragment key={`${index}:${segment}`}>
                            <span className="whitespace-pre-wrap">{segment}</span>
                            {index < segments.length - 1 && (
                              <span className={`mx-1 inline-block min-w-20 rounded-md border px-2 py-1 text-center font-bold ${
                                result.blankResults?.[ex.id]?.[index]
                                  ? "border-green-300 bg-green-50 text-green-700"
                                  : "border-red-300 bg-red-50 text-red-700"
                              }`}>
                                {blankAnswersByExercise[ex.id]?.[index] ?? "—"}
                              </span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                    {ex.type === "multiple_choice" && (
                      <div className="mb-2">
                        <MultipleChoiceOptions
                          options={ex.options ?? []}
                          selectedIndex={choiceByExercise[ex.id]}
                          onSelect={() => {}}
                          exerciseId={ex.id}
                          result={result.choiceResults?.[ex.id]}
                        />
                      </div>
                    )}
                    <p className="text-slate-500 text-[11px] leading-relaxed">
                      <b>Giải thích:</b> {ex.explanation}
                    </p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={handleRetry}>
            <RotateCcw className="w-4 h-4 mr-2" /> Làm lại bài Test
          </Button>
          {passed ? (
            <Button variant="primary" className="flex-1" onClick={onNextLesson}>
              Học bài tiếp theo <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button variant="ghost" className="flex-1 text-slate-500" onClick={onNavigateHome}>
              Quay về Lộ trình
            </Button>
          )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300">
      <ExercisePageHeader
        title="Bài tập ngữ pháp"
        subtitle="Bấm vào bài để hiển thị các câu."
        onBackToLesson={onBackToLesson}
      />

      <div className="space-y-3">
        {groups.map((group, groupIndex) => {
          const isExpanded = expandedGroupKeys.has(group.key);
          const isComplete = group.exercises.every((exercise) => getAnswerStringFor(exercise) !== "");
          const wordBank = group.exercises[0]?.wordBank;
          const groupExerciseIds = new Set(group.exercises.map((exercise) => exercise.id));
          const groupAssignments = Object.fromEntries(
            Object.entries(blankAssignments).filter(([key]) => groupExerciseIds.has(key.slice(0, key.lastIndexOf(":")))),
          );
          const usedWordIndexes = getUsedWordIndexes(groupAssignments);
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
                <div className="space-y-3 border-t border-slate-100 p-4">
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
                      <ExerciseCard
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
              )}
            </section>
          );
        })}
      </div>

      {submitError && <p className="text-sm text-red-500 text-center">{submitError}</p>}

      <div className="flex justify-end">
        <Button variant="primary" disabled={!allAnswered || submitting} onClick={handleSubmit}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Nộp bài
        </Button>
      </div>
    </div>
  );
};
