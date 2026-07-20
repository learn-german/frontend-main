import React, { useState, useEffect } from "react";
import { Loader2, ArrowRight, RotateCcw } from "lucide-react";
import { Button, ProgressBar } from "../components/DesignSystem";
import { Lesson } from "../lib/appTypes";
import { useGrammarExercises } from "../lib/hooks/useGrammarExercises";
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

export const GrammarExercisePage: React.FC<GrammarExercisePageProps> = ({
  lesson,
  onQuizFinished,
  onNavigateHome,
  onNextLesson,
}) => {
  const { exercises, loading: exercisesLoading, error: exercisesError } = useGrammarExercises(lesson.id);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [selectedTokens, setSelectedTokens] = useState<string[]>([]);
  const [textAnswer, setTextAnswer] = useState("");
  const [itemGroups, setItemGroups] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<GrammarResult | null>(null);

  const activeExercise = exercises[currentIdx];
  const isLastExercise = currentIdx === exercises.length - 1;

  useEffect(() => {
    setSelectedTokens([]);
    setTextAnswer("");
    setItemGroups({});
  }, [currentIdx, exercises]);

  const toggleToken = (token: string, tokenIdx: number) => {
    const key = `${tokenIdx}:${token}`;
    setSelectedTokens((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key],
    );
  };

  const getCurrentAnswerString = (): string => {
    if (!activeExercise) return "";
    if (activeExercise.type === "word_reorder") {
      return selectedTokens.map((t) => t.split(":").slice(1).join(":")).join(" ");
    }
    if (activeExercise.type === "classification") {
      const items = activeExercise.classificationItems ?? [];
      if (items.length === 0 || items.some((item) => !itemGroups[item])) return "";
      return items.map((item) => `${item}:${itemGroups[item]}`).join("|");
    }
    return textAnswer.trim();
  };

  const hasAnsweredCurrent = (): boolean => getCurrentAnswerString() !== "";

  const handleNext = () => {
    const answer = getCurrentAnswerString();
    setAnswers((prev) => ({ ...prev, [activeExercise.id]: answer }));
    if (!isLastExercise) {
      setCurrentIdx((i) => i + 1);
    }
  };

  const handleSubmit = async () => {
    const answer = getCurrentAnswerString();
    const finalAnswers = { ...answers, [activeExercise.id]: answer };
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
    setCurrentIdx(0);
    setAnswers({});
    setSelectedTokens([]);
    setTextAnswer("");
    setItemGroups({});
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
          <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1">
            {exercises.map((ex, idx) => (
              <div key={ex.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/40 text-xs">
                <p className="font-display font-bold text-slate-800 leading-tight mb-1 whitespace-pre-wrap">
                  Câu {idx + 1}: {ex.promptText ?? "Phân loại"}
                </p>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  <b>Giải thích:</b> {ex.explanation}
                </p>
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

  const progressPercent = Math.round((currentIdx / exercises.length) * 100);
  const canProceed = hasAnsweredCurrent();

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-6 pb-2 select-none">
        <div className="flex-1">
          <ProgressBar value={progressPercent} className="text-xs" />
        </div>
        <span className="text-xs font-display font-extrabold text-slate-500 shrink-0 bg-slate-100 px-3 py-1.5 rounded-full">
          Câu hỏi {currentIdx + 1} / {exercises.length}
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
        {activeExercise.type === "word_reorder" && (
          <>
            <p className="text-sm text-slate-500">Sắp xếp các từ sau thành câu đúng:</p>
            <div className="flex flex-wrap gap-2">
              {(activeExercise.tokens ?? []).map((token, i) => {
                const key = `${i}:${token}`;
                const selected = selectedTokens.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggleToken(token, i)}
                    className={`px-3 py-2 rounded-xl text-sm font-mono border transition-colors ${
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
            <div className="min-h-[3rem] p-3 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-sm font-medium text-slate-800">
              {selectedTokens.length > 0
                ? selectedTokens.map((t) => t.split(":").slice(1).join(":")).join(" ")
                : "Câu của bạn sẽ hiện ở đây..."}
            </div>
            {selectedTokens.length > 0 && (
              <button onClick={() => setSelectedTokens([])} className="text-xs font-bold text-slate-400 hover:text-slate-600">
                Xóa hết
              </button>
            )}
          </>
        )}

        {activeExercise.type === "error_correction" && (
          <>
            <p className="text-sm text-slate-700">Sửa câu sau cho đúng:</p>
            <p className="text-sm bg-red-50 text-red-700 rounded-xl px-3 py-2">{activeExercise.promptText}</p>
            <input
              type="text"
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              placeholder="Nhập câu đúng..."
            />
          </>
        )}

        {activeExercise.type === "translation" && (
          <>
            <p className="text-sm text-slate-700">Dịch câu sau sang tiếng Đức:</p>
            <p className="text-sm bg-slate-50 text-slate-700 rounded-xl px-3 py-2">{activeExercise.promptText}</p>
            <input
              type="text"
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              placeholder="Nhập câu tiếng Đức..."
            />
          </>
        )}

        {activeExercise.type === "sentence_transformation" && (
          <>
            <p className="text-sm text-slate-700">Biến đổi câu sau theo yêu cầu:</p>
            <p className="text-sm bg-slate-50 text-slate-700 rounded-xl px-3 py-2">{activeExercise.promptText}</p>
            {activeExercise.transformationHint && (
              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 uppercase">
                Yêu cầu: {activeExercise.transformationHint}
              </span>
            )}
            <input
              type="text"
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              placeholder="Nhập câu sau khi biến đổi..."
            />
          </>
        )}

        {activeExercise.type === "guided_sentence_writing" && (
          <>
            <p className="text-sm text-slate-700">Viết câu hoàn chỉnh từ dữ liệu gợi ý sau:</p>
            <p className="text-sm bg-slate-50 text-slate-700 rounded-xl px-3 py-2">{activeExercise.promptText}</p>
            <input
              type="text"
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              placeholder="Viết câu hoàn chỉnh..."
            />
          </>
        )}

        {activeExercise.type === "classification" && (
          <>
            <p className="text-sm text-slate-500">Phân loại các item sau vào đúng nhóm:</p>
            <div className="space-y-2">
              {(activeExercise.classificationItems ?? []).map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-800 flex-1">{item}</span>
                  <select
                    value={itemGroups[item] ?? ""}
                    onChange={(e) => setItemGroups((prev) => ({ ...prev, [item]: e.target.value }))}
                    className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  >
                    <option value="">-- Chọn nhóm --</option>
                    {(activeExercise.classificationGroups ?? []).map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {submitError && <p className="text-sm text-red-500 text-center">{submitError}</p>}

      <div className="flex justify-end">
        <Button variant="primary" disabled={!canProceed || submitting} onClick={isLastExercise ? handleSubmit : handleNext}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : !isLastExercise && <ArrowRight className="w-4 h-4 ml-2" />}
          {isLastExercise ? "Nộp bài" : "Câu tiếp theo"}
        </Button>
      </div>
    </div>
  );
};
