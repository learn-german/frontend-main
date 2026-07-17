import React, { useState } from "react";
import {
  ArrowLeft,
  Volume2,
  CheckCircle,
  ArrowRight,
  BookOpen,
  GraduationCap,
  PlayCircle,
  Video,
  Headphones,
  FileText,
  HelpCircle,
  Mic,
} from "lucide-react";
import { LevelBadge, Button } from "../components/DesignSystem";
import { VideoPlayer } from "../components/VideoPlayer";
import { MarkdownBlock } from "../components/MarkdownBlock";
import { ListeningClipPlayer } from "../components/ListeningClipPlayer";
import { Lesson, UserStats } from "../lib/appTypes";
import { showToast } from "../lib/toast";

interface LessonDetailPageProps {
  lesson: Lesson;
  stats: UserStats;
  onBack: () => void;
  onMarkComplete: (lessonId: string) => void;
  onStartQuiz: (lessonId: string, category?: "nguphap" | "nghe" | "doc") => void;
}

type BottomTab = "quiz" | "nghe" | "doc" | "tuvung" | "noi";

export const LessonDetailPage: React.FC<LessonDetailPageProps> = ({
  lesson,
  stats,
  onBack,
  onMarkComplete,
  onStartQuiz,
}) => {
  const isCompleted = stats.completedLessons.includes(lesson.id);
  const [marked, setMarked] = useState(isCompleted);
  const [bottomTab, setBottomTab] = useState<BottomTab>("tuvung");

  const handlePronounce = (text: string) => {
    if ("speechSynthesis" in window) {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "de-DE";
        utterance.rate = 0.85;
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn("Speech synthesis error:", err);
      }
    } else {
      showToast(`Trình duyệt chưa hỗ trợ phát âm cho từ "${text}".`, "warning");
    }
  };

  const handleCompleteClick = () => {
    setMarked(true);
    onMarkComplete(lesson.id);
  };

  const BOTTOM_TABS: { id: BottomTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: "tuvung", label: "Từ vựng", Icon: BookOpen },
    { id: "noi", label: "Nói", Icon: Mic },
    { id: "quiz", label: "Bài tập ngữ pháp", Icon: HelpCircle },
    { id: "nghe", label: "Nghe", Icon: Headphones },
    { id: "doc", label: "Đọc", Icon: FileText },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-300">

      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-200/60 select-none">
        <div className="flex items-center gap-3">
          <button
            id="btn-lesson-back"
            onClick={onBack}
            className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-xl transition cursor-pointer text-slate-500 hover:text-slate-950"
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
            <p className="text-xs sm:text-sm text-slate-500 font-sans">{lesson.titleVi}</p>
          </div>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          {marked ? (
            <div className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-green-50 text-green-700 border border-green-200 rounded-xl text-sm font-display font-bold">
              <CheckCircle className="w-4 h-4 text-green-600" /> Đã học xong
            </div>
          ) : isCompleted ? (
            <Button id="btn-lesson-mark-complete-top" variant="secondary" className="flex-1 sm:flex-initial" onClick={handleCompleteClick}>
              Đánh dấu đã học
            </Button>
          ) : null}
          <Button id="btn-lesson-start-quiz-top" variant="primary" className="flex-1 sm:flex-initial" onClick={() => onStartQuiz(lesson.id)}>
            Kiểm tra ngay <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>

      {/* Row 1: Video + Objectives, side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Video */}
        <section className="lg:col-span-8 space-y-3">
          <h2 className="text-base font-display font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide font-sans">
            <Video className="w-5 h-5 text-orange-500" /> Bài giảng lý thuyết
          </h2>
          <VideoPlayer lessonId={lesson.id} youtubeId={lesson.youtubeId} videoR2Key={lesson.videoR2Key} title={lesson.title} levelBadge={lesson.level} />
        </section>

        {/* Objectives */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          <h3 className="text-sm font-display font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5 font-sans">
            <GraduationCap className="w-4 h-4 text-amber-500" /> Mục tiêu bài học
          </h3>
          <div className="flex-1 bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
            <p className="text-xs text-slate-650 leading-relaxed font-sans">{lesson.objective}</p>
            <div className="h-[1px] bg-slate-100" />
            <p className="text-xs text-slate-500 leading-relaxed font-sans">
              <b>Tóm tắt:</b> {lesson.summary}
            </p>
          </div>
        </div>
      </div>

      {/* Row 2: Grammar — full width, markdown or legacy structured */}
      <div className="bg-slate-50/50 border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
        <span className="text-[10px] font-display font-bold text-yellow-400 bg-slate-950 border border-slate-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
          Ngữ pháp then chốt
        </span>

        {lesson.grammarMd ? (
          <MarkdownBlock content={lesson.grammarMd} />
        ) : (
          <>
            <h3 className="text-base font-display font-bold text-slate-900">{lesson.grammar.title}</h3>
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap font-sans">{lesson.grammar.rule}</p>
            {lesson.grammar.examples.length > 0 && (
              <div className="space-y-2 mt-4">
                <span className="text-[10px] font-display font-bold text-slate-400 block uppercase">Ví dụ minh họa:</span>
                {lesson.grammar.examples.map((ex, i) => (
                  <div key={i} className="bg-white p-3 rounded-xl border border-slate-150 shadow-sm text-xs">
                    <p className="font-display font-bold text-slate-900 leading-normal">🇩🇪 {ex.de}</p>
                    <p className="text-slate-500 mt-1 font-sans italic">🇻🇳 {ex.vi}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom tabbed section: Bài tập ngữ pháp / Nghe / Đọc / Từ vựng */}
      <div className="bg-slate-50/50 border border-slate-200/60 rounded-2xl overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-slate-200/60 bg-white">
          {BOTTOM_TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setBottomTab(id)}
              className={`flex items-center gap-2 px-5 py-3.5 text-sm font-display font-bold transition-colors border-b-2 ${
                bottomTab === id
                  ? "border-orange-500 text-orange-600 bg-orange-50/50"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6">
          {/* Bài tập ngữ pháp tab */}
          {bottomTab === "quiz" && (
            <div className="text-center space-y-4">
              <h3 className="text-sm font-display font-extrabold text-slate-800">Bạn đã hoàn tất bài giảng lý thuyết chứ?</h3>
              <p className="text-xs text-slate-500 max-w-lg mx-auto font-sans leading-relaxed">
                Tham gia trả lời <b>4 câu hỏi kiểm tra ngẫu nhiên</b> bám sát từ vựng và ngữ pháp vừa học. Cần vượt qua <b>80%</b> để hoàn tất!
              </p>
              <div className="flex justify-center gap-3 pt-1">
                {!marked && isCompleted && (
                  <Button id="btn-lesson-mark-complete-bottom" variant="secondary" onClick={handleCompleteClick}>
                    Đánh dấu đã học
                  </Button>
                )}
                <Button id="btn-lesson-start-quiz-bottom" variant="primary" onClick={() => onStartQuiz(lesson.id)}>
                  Bắt đầu bài tập ngữ pháp <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Nói tab */}
          {bottomTab === "noi" && (
            <div className="space-y-4">
              {lesson.speakingMd ? (
                <MarkdownBlock content={lesson.speakingMd} />
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <Mic className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-display font-bold text-slate-500">Sắp có</p>
                  <p className="text-xs text-slate-400">Nội dung luyện nói cho bài học này đang được chuẩn bị.</p>
                </div>
              )}
            </div>
          )}

          {/* Nghe tab */}
          {bottomTab === "nghe" && (
            <div className="space-y-4">
              {lesson.listeningClips.length > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Headphones className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-display font-bold text-slate-800">Luyện nghe</span>
                  </div>
                  <div className="space-y-4">
                    {lesson.listeningClips.map((clip, idx) => (
                      <ListeningClipPlayer key={clip.id} lessonId={lesson.id} clip={clip} label={`File ${idx + 1}`} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <Headphones className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-display font-bold text-slate-500">Sắp có</p>
                  <p className="text-xs text-slate-400">Bài luyện nghe cho bài học này đang được chuẩn bị.</p>
                </div>
              )}
              {lesson.listeningClips.length > 0 && (
                <div className="flex justify-center pt-2">
                  <Button id="btn-lesson-start-nghe" variant="primary" onClick={() => onStartQuiz(lesson.id, "nghe")}>
                    Bắt đầu bài tập nghe <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Đọc tab */}
          {bottomTab === "doc" && (
            <div className="space-y-4">
              {lesson.readingPassages.length > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-display font-bold text-slate-800">Bài đọc</span>
                  </div>
                  <div className="space-y-4">
                    {lesson.readingPassages.map((passage, idx) => (
                      <div key={passage.id} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Đoạn {idx + 1}</span>
                        <p className="text-sm text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">{passage.textDe}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-display font-bold text-slate-500">Sắp có</p>
                  <p className="text-xs text-slate-400">Bài đọc hiểu cho bài học này đang được chuẩn bị.</p>
                </div>
              )}
              {lesson.readingPassages.length > 0 && (
                <div className="flex justify-center pt-2">
                  <Button id="btn-lesson-start-doc" variant="primary" onClick={() => onStartQuiz(lesson.id, "doc")}>
                    Bắt đầu bài tập đọc <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Từ vựng tab */}
          {bottomTab === "tuvung" && (
            <section className="space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div className="space-y-1">
                  <h2 className="text-sm font-display font-bold text-slate-900 flex items-center gap-1.5 font-sans">
                    <BookOpen className="w-4 h-4 text-orange-600" /> Từ vựng then chốt
                  </h2>
                  <p className="text-[10px] text-slate-400">Click loa để nghe phát âm</p>
                </div>
                <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                  {lesson.vocabulary.length} từ
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {lesson.vocabulary.map((vocab, index) => (
                  <div key={index} className="py-3 first:pt-0 last:pb-0 flex items-start gap-2.5">
                    <button
                      onClick={() => handlePronounce(vocab.de)}
                      className="w-7 h-7 mt-0.5 rounded-lg bg-slate-100 hover:bg-orange-50 hover:text-orange-600 text-slate-500 flex items-center justify-center transition shrink-0 active:scale-90"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-display font-extrabold text-sm text-slate-900">{vocab.de}</span>
                        <span className="font-mono text-[10px] text-slate-400">{vocab.pronunciation}</span>
                        <span className="text-xs font-semibold text-slate-600 ml-auto">{vocab.vi}</span>
                      </div>
                      <div className="mt-1 bg-slate-50 rounded-lg px-2 py-1.5 text-[10px]">
                        <p className="font-display font-semibold text-slate-700">🇩🇪 {vocab.exampleDe}</p>
                        <p className="text-slate-400 italic mt-0.5">🇻🇳 {vocab.exampleVi}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

    </div>
  );
};
