/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  ArrowLeft, 
  Volume2, 
  CheckCircle, 
  ArrowRight,
  BookOpen,
  GraduationCap,
  Sparkles,
  PlayCircle,
  Video
} from "lucide-react";
import { LevelBadge, Button } from "../components/DesignSystem";
import { VideoPlayer } from "../components/VideoPlayer";
import { Lesson, UserStats } from "../lib/appTypes";
import { showToast } from "../lib/toast";

interface LessonDetailPageProps {
  lesson: Lesson;
  stats: UserStats;
  onBack: () => void;
  onMarkComplete: (lessonId: string) => void;
  onStartQuiz: (lessonId: string) => void;
}

export const LessonDetailPage: React.FC<LessonDetailPageProps> = ({
  lesson,
  stats,
  onBack,
  onMarkComplete,
  onStartQuiz
}) => {
  const isCompleted = stats.completedLessons.includes(lesson.id);
  const [marked, setMarked] = useState(isCompleted);

  // Trigger browser SpeechSynthesis for correct native German audio pronunciations
  const handlePronounce = (text: string) => {
    if ("speechSynthesis" in window) {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "de-DE";
        // Let's set rate slightly slower for beginners
        utterance.rate = 0.85;
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn("Speech synthesis error parsed:", err);
      }
    } else {
      showToast(`Ủa! Trình duyệt của bạn hiện chưa hỗ trợ phát âm trực tiếp chuẩn tiếng Đức cho từ "${text}".`, "warning");
    }
  };

  const handleCompleteClick = () => {
    setMarked(true);
    onMarkComplete(lesson.id);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      
      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-200/60 select-none">
        
        {/* Navigation back and title */}
        <div className="flex items-center gap-3">
          <button
            id="btn-lesson-back"
            onClick={onBack}
            className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition cursor-pointer text-slate-500 hover:text-slate-950"
            title="Quay lại danh sách lộ trình"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <LevelBadge level={lesson.level} />
              <span className="text-xs font-display font-medium text-slate-400">
                Lớp học: {lesson.moduleTitle}
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-display font-black text-slate-900 tracking-tight leading-snug">
              {lesson.title}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-sans">
              {lesson.titleVi}
            </p>
          </div>
        </div>

        {/* Action triggers top */}
        <div className="flex gap-2 w-full sm:w-auto">
          {!marked ? (
            <Button
              id="btn-lesson-mark-complete-top"
              variant="secondary"
              className="flex-1 sm:flex-initial"
              onClick={handleCompleteClick}
            >
              Đánh dấu đã học
            </Button>
          ) : (
            <div className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-green-50 text-green-700 border border-green-250 rounded-xl text-sm font-display font-bold">
              <CheckCircle className="w-4.5 h-4.5 text-green-600" />
              Đã học xong
            </div>
          )}

          <Button
            id="btn-lesson-start-quiz-top"
            variant="primary"
            className="flex-1 sm:flex-initial"
            onClick={() => onStartQuiz(lesson.id)}
          >
            Kiểm tra ngay <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>

      </div>

      {/* Main Grid content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column (Video + Vocabulary) */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Lecture Video box */}
          <section className="space-y-3">
            <h2 className="text-base font-display font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide font-sans">
              <Video className="w-5 h-5 text-orange-500" /> Bài giảng lý thuyết
            </h2>
            <VideoPlayer
              durationStr={lesson.duration}
              title={lesson.title}
              levelBadge={lesson.level}
            />
          </section>

          {/* Vocabulary List Container */}
          <section className="bg-white border border-slate-200/60 select-none rounded-3xl p-6 shadow-sm space-y-5">
            <div className="flex justify-between items-center pb-3.5 border-b border-slate-100">
              <div className="space-y-1">
                <h2 className="text-base font-display font-bold text-slate-900 flex items-center gap-1.5 font-sans">
                  <BookOpen className="w-5 h-5 text-orange-600" /> Từ vựng then chốt
                </h2>
                <p className="text-xs text-slate-400">Click vào biểu tượng loa để nghe giọng đọc chuẩn bản xứ!</p>
              </div>
              
              <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                {lesson.vocabulary.length} Từ mới
              </span>
            </div>

            {/* List items */}
            <div className="divide-y divide-slate-100">
              {lesson.vocabulary.map((vocab, index) => (
                <div key={index} className="py-4.5 first:pt-0 last:pb-0 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  
                  {/* German side */}
                  <div className="md:col-span-4 flex items-center gap-2.5">
                    <button
                      id={`btn-pronounce-${vocab.de}`}
                      onClick={() => handlePronounce(vocab.de)}
                      className="w-8.5 h-8.5 rounded-xl bg-slate-100 hover:bg-orange-50 hover:text-orange-600 text-slate-700 flex items-center justify-center transition cursor-pointer select-none active:scale-90"
                      title="Phát âm từ này"
                    >
                      <Volume2 className="w-4 h-4" />
                    </button>
                    <div>
                      <h4 className="font-display font-extrabold text-sm md:text-base text-slate-900">
                        {vocab.de}
                      </h4>
                      <p className="font-mono text-[11px] text-slate-400 mt-0.5 leading-none">
                        {vocab.pronunciation}
                      </p>
                    </div>
                  </div>

                  {/* Vietnamese translation side */}
                  <div className="md:col-span-3">
                    <p className="text-xs sm:text-sm font-sans font-semibold text-slate-700">
                      {vocab.vi}
                    </p>
                  </div>

                  {/* Real usage example side */}
                  <div className="md:col-span-5 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                    <p className="text-xs font-display font-semibold text-slate-700 leading-normal">
                      🇩🇪 {vocab.exampleDe}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1 italic font-sans">
                      🇻🇳 {vocab.exampleVi}
                    </p>
                  </div>

                </div>
              ))}
            </div>

          </section>

        </div>

        {/* Right Column (Lesson Objectives + Grammar explanation) */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* Summary objective card */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-display font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5 font-sans">
              <GraduationCap className="w-4 h-4 text-amber-500" /> Mục tiêu bài học
            </h3>
            <p className="text-xs text-slate-650 leading-relaxed font-sans">
              {lesson.objective}
            </p>
            <div className="h-[1px] bg-slate-100" />
            <p className="text-xs text-slate-500 leading-relaxed font-sans">
              <b>Tóm tắt:</b> {lesson.summary}
            </p>
          </div>

          {/* Hardcore Grammar layout */}
          <div className="bg-slate-50/50 border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
            <span className="text-[10px] font-display font-bold text-yellow-400 bg-slate-950 border border-slate-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
              Ngữ pháp then chốt
            </span>
            <h3 className="text-base font-display font-bold text-slate-900">
              {lesson.grammar.title}
            </h3>
            
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap font-sans">
              {lesson.grammar.rule}
            </p>

            <div className="space-y-2 mt-4">
              <span className="text-[10px] font-display font-bold text-slate-400 block uppercase">Ví dụ minh họa:</span>
              {lesson.grammar.examples.map((ex, i) => (
                <div key={i} className="bg-white p-3 rounded-xl border border-slate-150 shadow-sm text-xs">
                  <p className="font-display font-bold text-slate-900 leading-normal">🇩🇪 {ex.de}</p>
                  <p className="text-slate-500 mt-1 font-sans italic">🇻🇳 {ex.vi}</p>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* Bottom CTA bar */}
      <div className="bg-slate-50/50 border border-slate-200/60 rounded-2xl p-6 text-center select-none space-y-4">
        <h3 className="text-sm font-display font-extrabold text-slate-800">Bạn đã hoàn tất bài giảng lý thuyết chứ?</h3>
        <p className="text-xs text-slate-500 max-w-lg mx-auto font-sans leading-relaxed">
          Bước tiếp theo là tham gia trả lời <b>4 câu hỏi kiểm tra ngẫu nhiên</b> bám sát từ vựng và lý thuyết vừa được biểu quyết. Bạn cần vượt qua <b>80%</b> điểm số để hoàn tất khóa học!
        </p>

        <div className="flex justify-center gap-3 pt-1">
          {!marked && (
            <Button
              id="btn-lesson-mark-complete-bottom"
              variant="secondary"
              onClick={handleCompleteClick}
            >
              Đánh dấu đã học
            </Button>
          )}
          <Button
            id="btn-lesson-start-quiz-bottom"
            variant="primary"
            onClick={() => onStartQuiz(lesson.id)}
          >
            Bắt đầu Quiz ngay <ArrowRight className="w-4.5 h-4.5 ml-1.5" />
          </Button>
        </div>
      </div>

    </div>
  );
};
