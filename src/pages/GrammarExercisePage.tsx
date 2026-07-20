import React, { useState, useMemo } from "react";
import { Loader2, ArrowRight, RotateCcw } from "lucide-react";
import { Button, ProgressBar } from "../components/DesignSystem";
import { Lesson, GrammarExercise } from "../lib/appTypes";
import { useGrammarExercises } from "../lib/hooks/useGrammarExercises";
import { groupExercisesIntoPages } from "../lib/grammarExercisePaging";
import { supabase } from "../lib/supabase";

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
}

const GRAMMAR_TYPE_LABELS: Record<GrammarExercise["type"], string> = {
  word_reorder: "Sắp xếp từ",
  error_correction: "Sửa câu sai",
  translation: "Dịch",
  sentence_transformation: "Biến đổi câu",
  guided_sentence_writing: "Viết câu gợi ý",
  classification: "Phân loại",
};

const GRAMMAR_TYPE_INSTRUCTIONS: Record<GrammarExercise["type"], string> = {
  word_reorder: "Sắp xếp các từ sau thành câu đúng:",
  error_correction: "Sửa câu sau cho đúng:",
  translation: "Dịch câu sau sang tiếng Đức:",
  sentence_transformation: "Biến đổi câu sau theo yêu cầu:",
  guided_sentence_writing: "Viết câu hoàn chỉnh từ dữ liệu gợi ý sau:",
  classification: "Phân loại các item sau vào đúng nhóm:",
};

const ExerciseCard: React.FC<{
  exercise: GrammarExercise;
  subIndex: number;
  selectedTokens: string[];
  onToggleToken: (token: string, tokenIdx: number) => void;
  onClearTokens: () => void;
  textAnswer: string;
  onTextAnswerChange: (value: string) => void;
  itemGroups: Record<string, string>;
  onItemGroupChange: (item: string, group: string) => void;
}> = ({
  exercise,
  subIndex,
  selectedTokens,
  onToggleToken,
  onClearTokens,
  textAnswer,
  onTextAnswerChange,
  itemGroups,
  onItemGroupChange,
}) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2">
    <span className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-wider">{String.fromCharCode(97 + subIndex)})</span>

    {exercise.type === "word_reorder" && (
      <>
        <div className="flex flex-wrap gap-1.5">
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
        <p className="text-xs bg-red-50 text-red-700 rounded-lg px-2.5 py-2">{exercise.promptText}</p>
        <input
          type="text"
          value={textAnswer}
          onChange={(e) => onTextAnswerChange(e.target.value)}
          className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          placeholder="Nhập câu đúng..."
        />
      </>
    )}

    {exercise.type === "translation" && (
      <>
        <p className="text-xs bg-slate-50 text-slate-700 rounded-lg px-2.5 py-2">{exercise.promptText}</p>
        <input
          type="text"
          value={textAnswer}
          onChange={(e) => onTextAnswerChange(e.target.value)}
          className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          placeholder="Nhập câu tiếng Đức..."
        />
      </>
    )}

    {exercise.type === "sentence_transformation" && (
      <>
        <p className="text-xs bg-slate-50 text-slate-700 rounded-lg px-2.5 py-2">{exercise.promptText}</p>
        {exercise.transformationHint && (
          <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 uppercase">
            Yêu cầu: {exercise.transformationHint}
          </span>
        )}
        <input
          type="text"
          value={textAnswer}
          onChange={(e) => onTextAnswerChange(e.target.value)}
          className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          placeholder="Nhập câu sau khi biến đổi..."
        />
      </>
    )}

    {exercise.type === "guided_sentence_writing" && (
      <>
        <p className="text-xs bg-slate-50 text-slate-700 rounded-lg px-2.5 py-2">{exercise.promptText}</p>
        <input
          type="text"
          value={textAnswer}
          onChange={(e) => onTextAnswerChange(e.target.value)}
          className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          placeholder="Viết câu hoàn chỉnh..."
        />
      </>
    )}

    {exercise.type === "classification" && (
      <>
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
  </div>
);

export const GrammarExercisePage: React.FC<GrammarExercisePageProps> = ({
  lesson,
  onQuizFinished,
  onNavigateHome,
  onNextLesson,
}) => {
  const { exercises, loading: exercisesLoading, error: exercisesError } = useGrammarExercises(lesson.id);

  const pages = useMemo(() => groupExercisesIntoPages(exercises), [exercises]);

  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [selectedTokensByExercise, setSelectedTokensByExercise] = useState<Record<string, string[]>>({});
  const [textAnswerByExercise, setTextAnswerByExercise] = useState<Record<string, string>>({});
  const [itemGroupsByExercise, setItemGroupsByExercise] = useState<Record<string, Record<string, string>>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<GrammarResult | null>(null);

  const currentPage = pages[currentPageIdx] ?? [];
  const isLastPage = currentPageIdx === pages.length - 1;

  const toggleToken = (exerciseId: string, token: string, tokenIdx: number) => {
    const key = `${tokenIdx}:${token}`;
    setSelectedTokensByExercise((prev) => {
      const current = prev[exerciseId] ?? [];
      const next = current.includes(key) ? current.filter((t) => t !== key) : [...current, key];
      return { ...prev, [exerciseId]: next };
    });
  };

  const getAnswerStringFor = (exercise: GrammarExercise): string => {
    if (exercise.type === "word_reorder") {
      const tokens = selectedTokensByExercise[exercise.id] ?? [];
      return tokens.map((t) => t.split(":").slice(1).join(":")).join(" ");
    }
    if (exercise.type === "classification") {
      const items = exercise.classificationItems ?? [];
      const groups = itemGroupsByExercise[exercise.id] ?? {};
      if (items.length === 0 || items.some((item) => !groups[item])) return "";
      return items.map((item) => `${item}:${groups[item]}`).join("|");
    }
    return (textAnswerByExercise[exercise.id] ?? "").trim();
  };

  const hasAnsweredAllOnPage = (): boolean => currentPage.every((ex) => getAnswerStringFor(ex) !== "");

  const collectPageAnswers = (): Record<string, string> => {
    const pageAnswers: Record<string, string> = {};
    for (const ex of currentPage) {
      pageAnswers[ex.id] = getAnswerStringFor(ex);
    }
    return pageAnswers;
  };

  const handleNext = () => {
    setAnswers((prev) => ({ ...prev, ...collectPageAnswers() }));
    setCurrentPageIdx((i) => i + 1);
  };

  const handleSubmit = async () => {
    const finalAnswers = { ...answers, ...collectPageAnswers() };
    setAnswers(finalAnswers);

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
    setCurrentPageIdx(0);
    setAnswers({});
    setSelectedTokensByExercise({});
    setTextAnswerByExercise({});
    setItemGroupsByExercise({});
    setResult(null);
    setSubmitError(null);
  };

  if (exercisesLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (exercisesError || exercises.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center space-y-4 py-12">
        <p className="text-slate-500">Bài tập ngữ pháp cho bài học này chưa được soạn.</p>
        <Button variant="secondary" onClick={onNavigateHome}>Quay về Lộ trình</Button>
      </div>
    );
  }

  if (result) {
    const { score, total, passed, xp_earned } = result;
    const correctCount = Math.round((score / 100) * total);

    return (
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
            {pages.map((page, pageIdx) => (
              <div key={pageIdx} className="space-y-1.5">
                <p className="text-xs font-display font-bold text-slate-700">
                  Câu {pageIdx + 1}: {GRAMMAR_TYPE_LABELS[page[0].type]}
                </p>
                {page.map((ex, i) => (
                  <div key={ex.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/40 text-xs">
                    <p className="font-display font-bold text-slate-800 leading-tight mb-1 whitespace-pre-wrap">
                      {String.fromCharCode(97 + i)}) {ex.promptText ?? "Phân loại"}
                    </p>
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
    );
  }

  const progressPercent = pages.length > 0 ? Math.round((currentPageIdx / pages.length) * 100) : 0;
  const canProceed = hasAnsweredAllOnPage();

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-6 pb-2 select-none">
        <div className="flex-1">
          <ProgressBar value={progressPercent} className="text-xs" />
        </div>
        <span className="text-xs font-display font-extrabold text-slate-500 shrink-0 bg-slate-100 px-3 py-1.5 rounded-full">
          Câu {currentPageIdx + 1} / {pages.length}
        </span>
      </div>

      <div className="space-y-1">
        <span className="inline-flex items-center text-sm font-display font-extrabold text-orange-700 bg-orange-50 px-3 py-1.5 rounded-full">
          Câu {currentPageIdx + 1}: {currentPage[0] ? GRAMMAR_TYPE_LABELS[currentPage[0].type] : ""}
        </span>
        <p className="text-sm text-slate-500">{currentPage[0] ? GRAMMAR_TYPE_INSTRUCTIONS[currentPage[0].type] : ""}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {currentPage.map((exercise, i) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            subIndex={i}
            selectedTokens={selectedTokensByExercise[exercise.id] ?? []}
            onToggleToken={(token, tokenIdx) => toggleToken(exercise.id, token, tokenIdx)}
            onClearTokens={() => setSelectedTokensByExercise((prev) => ({ ...prev, [exercise.id]: [] }))}
            textAnswer={textAnswerByExercise[exercise.id] ?? ""}
            onTextAnswerChange={(value) => setTextAnswerByExercise((prev) => ({ ...prev, [exercise.id]: value }))}
            itemGroups={itemGroupsByExercise[exercise.id] ?? {}}
            onItemGroupChange={(item, group) =>
              setItemGroupsByExercise((prev) => ({
                ...prev,
                [exercise.id]: { ...(prev[exercise.id] ?? {}), [item]: group },
              }))
            }
          />
        ))}
      </div>

      {submitError && <p className="text-sm text-red-500 text-center">{submitError}</p>}

      <div className="flex justify-end">
        <Button variant="primary" disabled={!canProceed || submitting} onClick={isLastPage ? handleSubmit : handleNext}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : !isLastPage && <ArrowRight className="w-4 h-4 ml-2" />}
          {isLastPage ? "Nộp bài" : "Trang tiếp theo"}
        </Button>
      </div>
    </div>
  );
};
