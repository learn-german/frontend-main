import React, { useState, useEffect } from "react";
import {
  Volume2,
  Check,
  ArrowRight,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { Button, ProgressBar } from "../components/DesignSystem";
import { Lesson } from "../lib/appTypes";
import { useQuizQuestions } from "../lib/hooks/useQuizQuestions";
import { supabase } from "../lib/supabase";
import { speak, isTTSSupported } from "../lib/tts";

interface QuizPageProps {
  lesson: Lesson;
  category?: "nguphap" | "nghe" | "doc";
  onQuizFinished: (scorePercentage: number, xpEarned: number) => void;
  onNavigateHome: () => void;
  onNextLesson: () => void;
  onBackToLesson: () => void;
}

interface QuizResult {
  score: number;
  total: number;
  passed: boolean;
  xp_earned: number;
}

export const QuizPage: React.FC<QuizPageProps> = ({
  lesson,
  category = "nguphap",
  onQuizFinished,
  onNavigateHome,
  onNextLesson,
  onBackToLesson,
}) => {
  const { questions, loading: questionsLoading, error: questionsError } = useQuizQuestions(lesson.id, category);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Per-question answer state
  const [selectedOption, setSelectedOption] = useState("");
  const [fillBlankValue, setFillBlankValue] = useState("");
  const [matchedPairs, setMatchedPairs] = useState<Record<string, string>>({});
  const [shuffledDeWords, setShuffledDeWords] = useState<string[]>([]);
  const [shuffledViWords, setShuffledViWords] = useState<string[]>([]);
  const [selectedDe, setSelectedDe] = useState("");
  const [selectedVi, setSelectedVi] = useState("");

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);

  const activeQuestion = questions[currentIdx];
  const isLastQuestion = currentIdx === questions.length - 1;

  // Initialize matching UI when question changes
  useEffect(() => {
    if (!activeQuestion) return;

    setSelectedOption("");
    setFillBlankValue("");

    if (activeQuestion.type === "matching" && activeQuestion.matchingPairs) {
      const deList = activeQuestion.matchingPairs.map((p) => p.de);
      const viList = activeQuestion.matchingPairs.map((p) => p.vi);
      setShuffledDeWords([...deList].sort(() => Math.random() - 0.5));
      setShuffledViWords([...viList].sort(() => Math.random() - 0.5));
      setMatchedPairs({});
      setSelectedDe("");
      setSelectedVi("");
    }

    if (activeQuestion.type === "listening" && activeQuestion.audioText) {
      setTimeout(() => speak(activeQuestion.audioText!), 500);
    }
  }, [currentIdx, questions]);

  const ttsSupported = isTTSSupported();

  const handleDeClick = (de: string) => {
    if (matchedPairs[de]) return;
    setSelectedDe(de);
    if (selectedVi) verifyPair(de, selectedVi);
  };

  const handleViClick = (vi: string) => {
    if (Object.values(matchedPairs).includes(vi)) return;
    setSelectedVi(vi);
    if (selectedDe) verifyPair(selectedDe, vi);
  };

  const verifyPair = (de: string, vi: string) => {
    const correct = activeQuestion.matchingPairs?.find((p) => p.de === de && p.vi === vi);
    if (correct) {
      setMatchedPairs((prev) => ({ ...prev, [de]: vi }));
    }
    setSelectedDe("");
    setSelectedVi("");
  };

  const getCurrentAnswerString = (): string => {
    if (!activeQuestion) return "";
    if (activeQuestion.type === "multiple-choice" || activeQuestion.type === "listening") {
      return selectedOption;
    }
    if (activeQuestion.type === "fill-blank") {
      return fillBlankValue.trim();
    }
    if (activeQuestion.type === "matching") {
      const totalPairs = activeQuestion.matchingPairs?.length ?? 0;
      if (Object.keys(matchedPairs).length < totalPairs) return "";
      return Object.entries(matchedPairs)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([de, vi]) => `${de}:${vi}`)
        .join("|");
    }
    return "";
  };

  const handleNext = () => {
    const answer = getCurrentAnswerString();
    const updated = { ...answers, [activeQuestion.id]: answer };
    setAnswers(updated);

    if (!isLastQuestion) {
      setCurrentIdx((i) => i + 1);
    }
  };

  const handleSubmit = async () => {
    // Store last answer
    const answer = getCurrentAnswerString();
    const finalAnswers = { ...answers, [activeQuestion.id]: answer };
    setAnswers(finalAnswers);

    setSubmitting(true);
    setSubmitError(null);

    const { data, error } = await supabase.functions.invoke("quiz-submit", {
      body: { lesson_id: lesson.id, answers: finalAnswers, category },
    });

    setSubmitting(false);

    if (error || !data) {
      setSubmitError("Không thể nộp bài. Vui lòng thử lại.");
      return;
    }

    const result = data as QuizResult;
    setQuizResult(result);
    onQuizFinished(result.score, result.xp_earned);
  };

  const handleRetry = () => {
    setCurrentIdx(0);
    setAnswers({});
    setSelectedOption("");
    setFillBlankValue("");
    setMatchedPairs({});
    setQuizResult(null);
    setSubmitError(null);
  };

  // ── Loading questions ─────────────────────────────────────────────────────

  if (questionsLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (questionsError || questions.length === 0) {
    const emptyMessage =
      category === "nghe" ? "Bài tập nghe cho bài học này chưa được soạn."
      : category === "doc" ? "Bài tập đọc cho bài học này chưa được soạn."
      : "Không tải được câu hỏi quiz. Vui lòng thử lại sau.";
    return (
      <div className="max-w-2xl mx-auto text-center space-y-4 py-12">
        <p className="text-slate-500">{emptyMessage}</p>
        {category === "nguphap" ? (
          <Button variant="secondary" onClick={onNavigateHome}>Quay về Lộ trình</Button>
        ) : (
          <Button variant="secondary" onClick={onBackToLesson}>Quay lại bài học</Button>
        )}
      </div>
    );
  }

  // ── Results screen ────────────────────────────────────────────────────────

  if (quizResult) {
    const { score, total, passed, xp_earned } = quizResult;
    const correctCount = Math.round((score / 100) * total);

    return (
      <div
        id="quiz-result-card"
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
            <span
              className={`text-4xl md:text-5xl font-display font-black ${passed ? "text-green-600" : "text-rose-600"}`}
            >
              {score}%
            </span>
            <span className="text-sm font-bold text-slate-500">
              ({correctCount}/{total} câu)
            </span>
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
            {questions.map((q, idx) => (
              <div
                key={q.id}
                className="p-3 rounded-xl border border-slate-100 bg-slate-50/40 text-xs"
              >
                <p className="font-display font-bold text-slate-800 leading-tight mb-1">
                  Câu {idx + 1}: {q.questionText}
                </p>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  <b>Giải thích:</b> {q.explanation}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button id="btn-quiz-retry" variant="secondary" className="flex-1" onClick={handleRetry}>
            <RotateCcw className="w-4 h-4 mr-2" /> Làm lại bài Test
          </Button>
          {category === "nguphap" ? (
            passed ? (
              <Button id="btn-quiz-next-lesson" variant="primary" className="flex-1" onClick={onNextLesson}>
                Học bài tiếp theo <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                id="btn-quiz-exit"
                variant="ghost"
                className="flex-1 text-slate-500"
                onClick={onNavigateHome}
              >
                Quay về Lộ trình
              </Button>
            )
          ) : (
            <Button
              id="btn-quiz-back-to-lesson"
              variant="primary"
              className="flex-1"
              onClick={onBackToLesson}
            >
              Quay lại bài học
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ── Quiz screen ───────────────────────────────────────────────────────────

  const progressPercent = Math.round((currentIdx / questions.length) * 100);
  const currentAnswerStr = getCurrentAnswerString();
  const canProceed = currentAnswerStr !== "";

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Progress row */}
      <div className="flex items-center justify-between gap-6 pb-2 select-none">
        <div className="flex-1">
          <ProgressBar value={progressPercent} className="text-xs" />
        </div>
        <span className="text-xs font-display font-extrabold text-slate-500 shrink-0 bg-slate-100 px-3 py-1.5 rounded-full">
          Câu hỏi {currentIdx + 1} / {questions.length}
        </span>
      </div>

      {/* Reading passage recap (Đọc exercises only) */}
      {category === "doc" && lesson.readingText && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">🇩🇪 Tiếng Đức</span>
            <p className="text-sm text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">{lesson.readingText}</p>
          </div>
          {lesson.readingTextVi && (
            <>
              <div className="h-px bg-slate-100" />
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">🇻🇳 Tiếng Việt</span>
                <p className="text-xs text-slate-500 leading-relaxed font-sans italic whitespace-pre-wrap">{lesson.readingTextVi}</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Question card */}
      <div
        id={`quiz-question-box-${activeQuestion.id}`}
        className="bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6"
      >
        <div className="space-y-2">
          <span className="inline-block text-[10px] font-display font-bold text-orange-700 bg-orange-50 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            {activeQuestion.type === "multiple-choice" && "Trắc nghiệm"}
            {activeQuestion.type === "fill-blank" && "Điền vào chỗ trống"}
            {activeQuestion.type === "matching" && "Cặp từ nối ngữ nghĩa"}
            {activeQuestion.type === "listening" && "Kiểm tra kỹ năng nghe"}
          </span>
          <h2 className="text-base sm:text-lg font-display font-extrabold text-slate-900 leading-snug">
            {activeQuestion.questionText}
          </h2>
        </div>

        {/* MULTIPLE CHOICE */}
        {activeQuestion.type === "multiple-choice" && activeQuestion.options && (
          <div className="grid grid-cols-1 gap-3.5">
            {activeQuestion.options.map((opt, idx) => {
              const letter = ["A", "B", "C", "D"][idx];
              const isSelected = selectedOption === opt;
              return (
                <button
                  id={`btn-mc-opt-${idx}`}
                  key={idx}
                  onClick={() => setSelectedOption(opt)}
                  className={`w-full text-left p-4 rounded-xl border transition duration-150 flex items-center justify-between cursor-pointer ${
                    isSelected
                      ? "border-orange-500 bg-orange-50/10 text-orange-700 font-semibold"
                      : "border-slate-200 hover:border-slate-350 text-slate-700 hover:bg-slate-50/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 rounded-lg font-display font-bold text-[11px] flex items-center justify-center shrink-0 border ${
                        isSelected
                          ? "bg-orange-600 text-white border-orange-700"
                          : "bg-slate-50 text-slate-400 border-slate-200"
                      }`}
                    >
                      {letter}
                    </span>
                    <span className="text-xs sm:text-sm font-sans font-medium">{opt}</span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-orange-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}

        {/* FILL IN THE BLANK */}
        {activeQuestion.type === "fill-blank" && (
          <div className="space-y-3 max-w-sm">
            <input
              id="quiz-fill-input"
              type="text"
              placeholder="Nhập câu trả lời bằng chữ thường..."
              value={fillBlankValue}
              onChange={(e) => setFillBlankValue(e.target.value)}
              className="w-full px-4 py-3 bg-white border border-slate-250 rounded-xl font-sans text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition duration-150"
            />
            <p className="text-[10px] text-slate-400 font-sans tracking-wide">
              *Chú ý viết chính xác từng chữ cái bao gồm cả các ký tự Umlaut (ä, ö, ü, ß) nếu có.
            </p>
          </div>
        )}

        {/* LISTENING */}
        {activeQuestion.type === "listening" && activeQuestion.audioText && (
          <div className="space-y-6">
            <div className="flex flex-col items-center gap-3 select-none">
              {ttsSupported ? (
                <button
                  id="btn-quiz-listening-audio"
                  onClick={() => speak(activeQuestion.audioText!)}
                  className="w-24 h-24 rounded-3xl bg-orange-600 hover:bg-orange-700 border-b-4 border-orange-800/60 text-white flex flex-col items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm"
                  title="Nghe phát âm"
                >
                  <Volume2 className="w-8 h-8 fill-white" />
                  <span className="text-[10px] font-display font-extrabold tracking-widest uppercase">NGHE LẠI</span>
                </button>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center">
                  <p className="text-xs text-slate-500 mb-1">Trình duyệt không hỗ trợ âm thanh. Câu cần nghe:</p>
                  <p className="text-base font-display font-bold text-slate-800">{activeQuestion.audioText}</p>
                </div>
              )}
            </div>
            {activeQuestion.options && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {activeQuestion.options.map((opt, idx) => {
                  const isSelected = selectedOption === opt;
                  return (
                    <button
                      id={`btn-list-opt-${idx}`}
                      key={idx}
                      onClick={() => setSelectedOption(opt)}
                      className={`w-full text-left p-4 rounded-xl border transition duration-150 flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? "border-orange-500 bg-orange-50/10 text-orange-700 font-semibold"
                          : "border-slate-200 hover:border-slate-350 text-slate-700 hover:bg-slate-50/50"
                      }`}
                    >
                      <span className="text-xs sm:text-sm font-sans font-medium">{opt}</span>
                      {isSelected && <Check className="w-4 h-4 text-orange-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* MATCHING */}
        {activeQuestion.type === "matching" && (
          <div className="space-y-4">
            <p className="text-[11px] text-slate-500 font-sans tracking-wide">
              Click một từ tiếng Đức ở cột trái, rồi click nghĩa tiếng Việt tương ứng ở cột phải để ghép cặp thành công.
            </p>
            <div className="grid grid-cols-2 gap-6 items-start">
              <div className="space-y-2.5">
                <span className="block text-[10px] font-display font-bold text-slate-400 uppercase tracking-widest mb-1.5 text-center">
                  Tiếng Đức
                </span>
                {shuffledDeWords.map((de) => {
                  const isMatched = !!matchedPairs[de];
                  const isSelected = selectedDe === de;
                  return (
                    <button
                      id={`btn-match-de-${de}`}
                      key={de}
                      onClick={() => handleDeClick(de)}
                      disabled={isMatched}
                      className={`w-full p-3 text-xs sm:text-sm font-display font-bold rounded-xl text-center border transition duration-150 select-none cursor-pointer ${
                        isMatched
                          ? "bg-green-50 text-green-700 border-green-200 opacity-60 cursor-not-allowed"
                          : isSelected
                          ? "bg-orange-50 border-orange-500 text-orange-700 font-extrabold"
                          : "border-slate-200 hover:border-slate-300 text-slate-800 hover:bg-slate-50"
                      }`}
                    >
                      {de}
                    </button>
                  );
                })}
              </div>
              <div className="space-y-2.5">
                <span className="block text-[10px] font-display font-bold text-slate-400 uppercase tracking-widest mb-1.5 text-center">
                  Nghĩa tiếng Việt
                </span>
                {shuffledViWords.map((vi) => {
                  const isMatched = Object.values(matchedPairs).includes(vi);
                  const isSelected = selectedVi === vi;
                  return (
                    <button
                      id={`btn-match-vi-${vi}`}
                      key={vi}
                      onClick={() => handleViClick(vi)}
                      disabled={isMatched}
                      className={`w-full p-3 text-xs sm:text-sm font-sans font-semibold rounded-xl text-center border transition duration-150 select-none cursor-pointer ${
                        isMatched
                          ? "bg-green-50 text-green-700 border-green-200 opacity-60 cursor-not-allowed"
                          : isSelected
                          ? "bg-orange-50 border-orange-500 text-orange-700 font-extrabold"
                          : "border-slate-200 hover:border-slate-300 text-slate-800 hover:bg-slate-50"
                      }`}
                    >
                      {vi}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="pt-3 flex justify-end text-xs font-display font-bold text-slate-400">
              Đã khớp: {Object.keys(matchedPairs).length} / {activeQuestion.matchingPairs?.length}
            </div>
          </div>
        )}
      </div>

      {/* Error banner */}
      {submitError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm text-center">
          {submitError}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-end gap-3 select-none">
        <Button id="btn-quit-quiz" variant="ghost" onClick={onNavigateHome}>
          Bỏ cuộc
        </Button>
        {isLastQuestion ? (
          <Button
            id="btn-quiz-submit"
            variant={canProceed && !submitting ? "primary" : "disabled"}
            onClick={canProceed && !submitting ? handleSubmit : undefined}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Đang nộp bài...
              </>
            ) : (
              <>
                Nộp bài <Check className="w-4 h-4 ml-1.5" />
              </>
            )}
          </Button>
        ) : (
          <Button
            id="btn-quiz-next"
            variant={canProceed ? "primary" : "disabled"}
            onClick={canProceed ? handleNext : undefined}
          >
            Tiếp theo <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        )}
      </div>
    </div>
  );
};
