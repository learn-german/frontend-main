/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Volume2, 
  Check, 
  X, 
  Sparkles, 
  Award, 
  ArrowRight,
  RotateCcw,
  BookOpen,
  Info,
  HelpCircle,
  GraduationCap
} from "lucide-react";
import { Button, ProgressBar } from "../components/DesignSystem";
import { Lesson, QuizQuestion } from "../types";

interface QuizPageProps {
  lesson: Lesson;
  onQuizFinished: (scorePercentage: number) => void;
  onNavigateHome: () => void;
  onNextLesson: () => void;
}

export const QuizPage: React.FC<QuizPageProps> = ({
  lesson,
  onQuizFinished,
  onNavigateHome,
  onNextLesson
}) => {
  const quizQuestions = lesson.quiz;
  const [currentIdx, setCurrentIdx] = useState(0);
  
  // Game state
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [fillBlankValue, setFillBlankValue] = useState<string>("");
  
  // Matching game state
  const [selectedDe, setSelectedDe] = useState<string>("");
  const [selectedVi, setSelectedVi] = useState<string>("");
  const [matchedPairs, setMatchedPairs] = useState<Record<string, string>>({}); // de -> vi
  const [shuffledDeWords, setShuffledDeWords] = useState<string[]>([]);
  const [shuffledViWords, setShuffledViWords] = useState<string[]>([]);

  // Validation details
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [isAnswerCorrect, setIsAnswerCorrect] = useState(false);

  // Result stats
  const [questionResults, setQuestionResults] = useState<{ id: string; correct: boolean; userAnswer: string; questionText: string }[]>([]);
  const [quizComplete, setQuizComplete] = useState(false);
  const [finalScore, setFinalScore] = useState(0);

  const activeQuestion = quizQuestions[currentIdx];

  // Initialize matching items when question changes
  useEffect(() => {
    if (activeQuestion && activeQuestion.type === "matching" && activeQuestion.matchingPairs) {
      const deList = activeQuestion.matchingPairs.map(p => p.de);
      const viList = activeQuestion.matchingPairs.map(p => p.vi);
      
      // Shallow shuffle
      setShuffledDeWords([...deList].sort(() => Math.random() - 0.5));
      setShuffledViWords([...viList].sort(() => Math.random() - 0.5));
      setMatchedPairs({});
      setSelectedDe("");
      setSelectedVi("");
    }
    
    // Auto voice reading on listening questions
    if (activeQuestion && activeQuestion.type === "listening" && activeQuestion.audioText) {
      setTimeout(() => {
        playHearingWord(activeQuestion.audioText!);
      }, 500);
    }
  }, [currentIdx, activeQuestion]);

  const playHearingWord = (text: string) => {
    if ("speechSynthesis" in window) {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "de-DE";
        utterance.rate = 0.8;
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn("Speech synthesis play error:", err);
      }
    }
  };

  // Build matching connection
  const handleDeClick = (de: string) => {
    if (isAnswerChecked) return;
    // If already matched, ignore
    if (matchedPairs[de]) return;
    setSelectedDe(de);

    // If both selected, verify immediately
    if (selectedVi) {
      verifyPair(de, selectedVi);
    }
  };

  const handleViClick = (vi: string) => {
    if (isAnswerChecked) return;
    // If already matched, ignore
    if (Object.values(matchedPairs).includes(vi)) return;
    setSelectedVi(vi);

    // If both selected, verify immediately
    if (selectedDe) {
      verifyPair(selectedDe, vi);
    }
  };

  const verifyPair = (de: string, vi: string) => {
    // Check if correct match in original matchingPairs
    const pair = activeQuestion.matchingPairs?.find(p => p.de === de && p.vi === vi);
    if (pair) {
      // Add to matched lists
      setMatchedPairs(prev => ({ ...prev, [de]: vi }));
      setSelectedDe("");
      setSelectedVi("");
    } else {
      // Incorrect match flare, auto reset selection
      setSelectedDe("");
      setSelectedVi("");
      // Little visual alerts placeholder
    }
  };

  const handleCheckAnswer = () => {
    let correct = false;
    let answerText = "";

    if (activeQuestion.type === "multiple-choice" || activeQuestion.type === "listening") {
      correct = selectedOption === activeQuestion.correctAnswer;
      answerText = selectedOption || "(Không trả lời)";
    } else if (activeQuestion.type === "fill-blank") {
      correct = fillBlankValue.trim().toLowerCase() === activeQuestion.correctAnswer.toLowerCase();
      answerText = fillBlankValue;
    } else if (activeQuestion.type === "matching") {
      // Calculate matches count
      const totalPairs = activeQuestion.matchingPairs?.length || 0;
      const currentMatchedCount = Object.keys(matchedPairs).length;
      correct = currentMatchedCount === totalPairs;
      answerText = `Ghép được ${currentMatchedCount}/${totalPairs} cặp từ`;
    }

    setIsAnswerCorrect(correct);
    setIsAnswerChecked(true);

    // Append result list
    setQuestionResults(prev => [
      ...prev,
      {
        id: activeQuestion.id,
        correct,
        userAnswer: answerText,
        questionText: activeQuestion.questionText
      }
    ]);
  };

  const handleNextQuestion = () => {
    // Reset state
    setSelectedOption("");
    setFillBlankValue("");
    setIsAnswerChecked(false);
    
    if (currentIdx + 1 < quizQuestions.length) {
      setCurrentIdx(prev => prev + 1);
    } else {
      // Complete Quiz calculations
      const correctAmount = questionResults.length > 0 ? questionResults.filter(r => r.correct).length : 0;
      // We need to add current question calculated correct value since state has not re-rendered yet
      const computedCorrect = correctAmount + (isAnswerCorrect ? 1 : 0);
      const scorePercentage = Math.round((computedCorrect / quizQuestions.length) * 100);
      
      setFinalScore(scorePercentage);
      setQuizComplete(true);
      onQuizFinished(scorePercentage);
    }
  };

  const handleRetry = () => {
    setCurrentIdx(0);
    setSelectedOption("");
    setFillBlankValue("");
    setIsAnswerChecked(false);
    setQuestionResults([]);
    setQuizComplete(false);
  };

  // Progress calculations
  const progressPercent = Math.round(((currentIdx) / quizQuestions.length) * 100);

  if (quizComplete) {
    const passed = finalScore >= 80;
    return (
      <div id="quiz-result-card" className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200/60 p-6 sm:p-10 shadow-sm text-center space-y-6 animate-in zoom-in duration-300">
        
        {/* Big Congrats visual header */}
        <div className="space-y-2">
          {passed ? (
            <div className="w-20 h-20 bg-green-50 border-2 border-green-200 rounded-full flex items-center justify-center mx-auto text-4xl animate-bounce">
              🎉
            </div>
          ) : (
            <div className="w-20 h-20 bg-rose-55/40 border-2 border-rose-200 rounded-full flex items-center justify-center mx-auto text-4xl">
              😟
            </div>
          )}
          
          <h2 className="text-2xl sm:text-3.5xl font-display font-black text-slate-900 tracking-tight leading-normal">
            {passed ? "Xuất sắc! Bạn đã vượt qua!" : "Cố gắng chút nữa nhé!"}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto font-sans leading-normal">
            {passed 
              ? "Tuyệt vời, bạn đã tiếp thu bài học cực tốt và sẵn sàng mở khóa các lớp thử thách tiếp theo!" 
              : "Để hoàn thiện bài học, bạn cần đạt tối thiểu 80% điểm số (Trả lời đúng ít nhất 3 câu). Đừng nản lòng nhé!"
            }
          </p>
        </div>

        {/* Big Score display */}
        <div className="p-6 bg-slate-50/50 rounded-2xl border border-slate-100 max-w-xs mx-auto">
          <span className="text-[10px] text-slate-400 font-display font-bold uppercase tracking-wider block">KẾT QUẢ ĐẠT ĐƯỢC</span>
          <div className="flex items-baseline justify-center gap-1.5 mt-1">
            <span className={`text-4xl md:text-5xl font-display font-black ${passed ? "text-green-600" : "text-rose-650"}`}>
              {finalScore}%
            </span>
            <span className="text-sm font-bold text-slate-450">({questionResults.filter(r => r.correct).length}/{quizQuestions.length} câu)</span>
          </div>
          <span className={`inline-block text-[10px] font-display font-bold px-2.5 py-0.5 rounded-full mt-2.5 uppercase ${
            passed ? "bg-green-50 text-green-700" : "bg-rose-50 text-rose-700 font-sans"
          }`}>
            {passed ? "+30 XP Tích lũy" : "Chưa đạt chuẩn 80%"}
          </span>
        </div>

        {/* Explanations and recap table */}
        <div className="text-left space-y-3 pt-4 border-t border-slate-100">
          <h4 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest">Xem lại chi tiết bài làm:</h4>
          
          <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1">
            {quizQuestions.map((q, idx) => {
              const res = questionResults.find(r => r.id === q.id);
              const isCorrect = res ? res.correct : false;
              return (
                <div key={q.id} className="p-3 rounded-xl border border-slate-50 bg-slate-50/40 text-xs flex gap-3.5 items-start">
                  <div className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    isCorrect ? "bg-green-50 text-green-700 border border-green-100" : "bg-rose-50 text-rose-700 border border-rose-100"
                  }`}>
                    {isCorrect ? <Check className="w-3.5 h-3.5 font-bold" /> : <X className="w-3.5 h-3.5" />}
                  </div>
                  <div className="space-y-1">
                    <p className="font-display font-bold text-slate-800 leading-tight">Câu {idx + 1}: {q.questionText}</p>
                    <p className="text-slate-500 text-[11px] leading-relaxed">
                      <b>Giải thích từ vựng:</b> {q.explanation}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button id="btn-quiz-retry" variant="secondary" className="flex-1" onClick={handleRetry}>
            <RotateCcw className="w-4 h-4 mr-2" /> Làm lại bài Test
          </Button>
          
          {passed ? (
            <Button id="btn-quiz-next-lesson" variant="primary" className="flex-1" onClick={onNextLesson}>
              Học bài tiếp theo <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button id="btn-quiz-exit" variant="ghost" className="flex-1 text-slate-500" onClick={onNavigateHome}>
              Quay về Lộ trình
            </Button>
          )}
        </div>

      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in duration-300">
      
      {/* Top Header progress row */}
      <div className="flex items-center justify-between gap-6 pb-2 select-none">
        <div className="flex-1">
          <ProgressBar value={progressPercent} className="text-xs" />
        </div>
        <span className="text-xs font-display font-extrabold text-slate-500 shrink-0 bg-slate-100 px-3 py-1.5 rounded-full">
          Câu hỏi {currentIdx + 1} / {quizQuestions.length}
        </span>
      </div>

      {/* Main Question Card wrapper */}
      <div 
        id={`quiz-question-box-${activeQuestion.id}`}
        className="bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6"
      >
        
        {/* Section label and text */}
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

        {/* Dynamic renders based on question types */}
        
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
                  onClick={() => !isAnswerChecked && setSelectedOption(opt)}
                  disabled={isAnswerChecked}
                  className={`w-full text-left p-4 rounded-xl border transition duration-150 flex items-center justify-between cursor-pointer ${
                    isSelected 
                      ? "border-orange-500 bg-orange-50/10 text-orange-700 font-semibold" 
                      : "border-slate-200 hover:border-slate-350 text-slate-700 hover:bg-slate-50/50"
                  } ${isAnswerChecked ? "cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-lg font-display font-bold text-[11px] flex items-center justify-center shrink-0 border ${
                      isSelected ? "bg-orange-600 text-white border-orange-700" : "bg-slate-55 text-slate-400 border-slate-200"
                    }`}>
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
              disabled={isAnswerChecked}
              className="w-full px-4 py-3 bg-white border border-slate-250 rounded-xl font-sans text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition duration-150 disabled:bg-slate-50 disabled:cursor-not-allowed"
            />
            <p className="text-[10px] text-slate-400 font-sans tracking-wide">
              *Chú ý viết chính xác từng chữ cái bao gồm cả các ký tự Umlaut (ä, ö, ü, ß) nếu có.
            </p>
          </div>
        )}

        {/* LISTENING QUESTION */}
        {activeQuestion.type === "listening" && activeQuestion.audioText && (
          <div className="space-y-6">
            {/* Hearing speaker button */}
            <div className="flex justify-center select-none">
              <button
                id="btn-quiz-listening-audio"
                onClick={() => playHearingWord(activeQuestion.audioText!)}
                className="w-24 h-24 rounded-3xl bg-orange-600 hover:bg-orange-700 border-b-6 border-orange-850/80 text-white flex flex-col items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm active:border-b-0 active:mt-[6px]"
                title="Nghe phát âm"
              >
                <Volume2 className="w-8 h-8 fill-white" />
                <span className="text-[10px] font-display font-extrabold tracking-widest uppercase">NGHE LẠI</span>
              </button>
            </div>

            {/* Render options for listening */}
            {activeQuestion.options && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {activeQuestion.options.map((opt, idx) => {
                  const isSelected = selectedOption === opt;
                  return (
                    <button
                      id={`btn-list-opt-${idx}`}
                      key={idx}
                      onClick={() => !isAnswerChecked && setSelectedOption(opt)}
                      disabled={isAnswerChecked}
                      className={`w-full text-left p-4 rounded-xl border transition duration-150 flex items-center justify-between cursor-pointer ${
                        isSelected 
                          ? "border-orange-500 bg-orange-50/10 text-orange-700 font-semibold" 
                          : "border-slate-200 hover:border-slate-350 text-slate-700 hover:bg-slate-50/50"
                      } ${isAnswerChecked ? "cursor-not-allowed" : ""}`}
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

        {/* MATCHING WORD GAME */}
        {activeQuestion.type === "matching" && (
          <div className="space-y-4">
            <p className="text-[11px] text-slate-500 font-sans tracking-wide">
              Click một từ tiếng Đức ở cột trái, rồi click nghĩa tiếng Việt tương ứng ở cột phải để ghép cặp thành công.
            </p>

            <div className="grid grid-cols-2 gap-6 items-start">
              
              {/* Left Column: German */}
              <div className="space-y-2.5">
                <span className="block text-[10px] font-display font-bold text-slate-400 uppercase tracking-widest mb-1.5 text-center">Tiếng Đức</span>
                {shuffledDeWords.map((de) => {
                  const isMatched = !!matchedPairs[de];
                  const isSelected = selectedDe === de;
                  
                  return (
                    <button
                      id={`btn-match-de-${de}`}
                      key={de}
                      onClick={() => handleDeClick(de)}
                      className={`w-full p-3 text-xs sm:text-sm font-display font-bold rounded-xl text-center border transition duration-150 select-none cursor-pointer ${
                        isMatched 
                          ? "bg-green-50 text-green-700 border-green-200 opacity-60 cursor-not-allowed" 
                          : isSelected 
                            ? "bg-orange-50 border-orange-500 text-orange-700 scale-102 font-extrabold" 
                            : "border-slate-200 hover:border-slate-300 text-slate-800 hover:bg-slate-50"
                      }`}
                      disabled={isMatched || isAnswerChecked}
                    >
                      {de}
                    </button>
                  );
                })}
              </div>

              {/* Right Column: Vietnamese */}
              <div className="space-y-2.5">
                <span className="block text-[10px] font-display font-bold text-slate-400 uppercase tracking-widest mb-1.5 text-center">Nghĩa tiếng Việt</span>
                {shuffledViWords.map((vi) => {
                  const isMatched = Object.values(matchedPairs).includes(vi);
                  const isSelected = selectedVi === vi;
                  
                  return (
                    <button
                      id={`btn-match-vi-${vi}`}
                      key={vi}
                      onClick={() => handleViClick(vi)}
                      className={`w-full p-3 text-xs sm:text-sm font-sans font-semibold rounded-xl text-center border transition duration-150 select-none cursor-pointer ${
                        isMatched 
                          ? "bg-green-50 text-green-700 border-green-200 opacity-60 cursor-not-allowed" 
                          : isSelected 
                            ? "bg-orange-50 border-orange-500 text-orange-700 scale-102 font-extrabold" 
                            : "border-slate-200 hover:border-slate-300 text-slate-800 hover:bg-slate-50"
                      }`}
                      disabled={isMatched || isAnswerChecked}
                    >
                      {vi}
                    </button>
                  );
                })}
              </div>

            </div>

            {/* Small matches indicators count */}
            <div className="pt-3 flex justify-end text-xs font-display font-bold text-slate-400">
              Đã khớp: {Object.keys(matchedPairs).length} / {activeQuestion.matchingPairs?.length}
            </div>
          </div>
        )}

      </div>

      {/* Answer feedback validation alerts */}
      {isAnswerChecked ? (
        <div 
          id="quiz-feedback-banner"
          className={`p-5 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-4 select-none ${
            isAnswerCorrect 
              ? "bg-green-50 border-green-200 text-green-800" 
              : "bg-rose-50 border-rose-250 text-rose-800"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              isAnswerCorrect ? "bg-green-600 text-white" : "bg-rose-500 text-white"
            }`}>
              {isAnswerCorrect ? <Check className="w-5 h-5 font-bold" /> : <X className="w-5 h-5" />}
            </div>
            <div className="space-y-1">
              <h4 className="font-display font-extrabold text-sm md:text-base leading-tight">
                {isAnswerCorrect ? "Đúng rồi! Tuyệt vời!" : "Chưa chính xác rồi!"}
              </h4>
              <p className="text-xs max-w-xl font-sans leading-relaxed text-slate-600">
                {activeQuestion.explanation}
              </p>
            </div>
          </div>

          <Button
            id="btn-quiz-next"
            variant={isAnswerCorrect ? "success" : "danger"}
            size="md"
            className="shrink-0 font-bold"
            onClick={handleNextQuestion}
          >
            Tiếp tục <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        </div>
      ) : (
        /* Action buttons below */
        <div className="flex justify-end gap-3 select-none">
          <Button
            id="btn-quit-quiz"
            variant="ghost"
            onClick={onNavigateHome}
          >
            Bỏ cuộc
          </Button>
          <Button
            id="btn-quiz-check"
            variant={
              (activeQuestion.type === "multiple-choice" || activeQuestion.type === "listening") && !selectedOption 
                ? "disabled" 
                : activeQuestion.type === "fill-blank" && !fillBlankValue.trim()
                ? "disabled"
                : activeQuestion.type === "matching" && Object.keys(matchedPairs).length < (activeQuestion.matchingPairs?.length || 0)
                ? "disabled"
                : "primary"
            }
            onClick={handleCheckAnswer}
          >
            Kiểm tra đáp án
          </Button>
        </div>
      )}

    </div>
  );
};
