import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
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
  PenLine,
  Loader2,
} from "lucide-react";
import { LevelBadge, Button } from "../components/DesignSystem";
import { VideoPlayer } from "../components/VideoPlayer";
import { MarkdownBlock, countHighlightedWords } from "../components/MarkdownBlock";
import { Lesson, UserStats } from "../lib/appTypes";
import { showToast } from "../lib/toast";
import { useWritingSubmission } from "../lib/hooks/useWritingSubmission";

interface LessonDetailPageProps {
  lesson: Lesson;
  stats: UserStats;
  userId: string;
  onBack: () => void;
  onMarkComplete: (lessonId: string) => void;
  onStartQuiz: (lessonId: string, category?: "nguphap" | "nghe" | "doc") => void;
}

type BottomTab = "nguphapthenchot" | "quiz" | "nghe" | "doc" | "tuvung" | "noi" | "viet";

export const LessonDetailPage: React.FC<LessonDetailPageProps> = ({
  lesson,
  stats,
  userId,
  onBack,
  onMarkComplete,
  onStartQuiz,
}) => {
  const isCompleted = stats.completedLessons.includes(lesson.id);
  const [marked, setMarked] = useState(isCompleted);

  const BOTTOM_TABS: { id: BottomTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: "nguphapthenchot", label: "Ngữ pháp then chốt", Icon: GraduationCap },
    { id: "tuvung", label: "Wortschatz", Icon: BookOpen },
    { id: "quiz", label: "Grammatikübungen", Icon: HelpCircle },
    { id: "doc", label: "Lesen", Icon: FileText },
    { id: "nghe", label: "Hören", Icon: Headphones },
    { id: "viet", label: "Schreiben", Icon: PenLine },
    { id: "noi", label: "Sprechen", Icon: Mic },
  ];

  // Any tab lacking available content for this lesson is hidden entirely
  // (no "Sắp có" placeholder tab shown anymore) — extends the content-gated
  // pattern already used for Nghe/Đọc's "Bắt đầu bài tập" buttons to every
  // tab. hasNguphapQuestions is optional/undefined for lessons not yet
  // fetched with the new signal (e.g. stale/mocked Lesson data) — treat
  // undefined as "has content" so Grammatikübungen is never hidden by
  // mistake.
  const visibleTabs = BOTTOM_TABS.filter(({ id }) => {
    if (id === "tuvung") return !!lesson.vocabularyMd;
    if (id === "quiz") return lesson.hasNguphapQuestions !== false;
    if (id === "doc") return lesson.readingPassages.length > 0;
    if (id === "nghe") return lesson.listeningClips.length > 0;
    if (id === "viet") return !!lesson.writingPromptMd;
    if (id === "noi") return !!lesson.speakingMd;
    return true;
  });

  const [bottomTab, setBottomTab] = useState<BottomTab>(() => visibleTabs[0]?.id ?? "tuvung");

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

      {/* Bottom tabbed section: Bài tập ngữ pháp / Nghe / Đọc / Từ vựng */}
      <div className="bg-slate-50/50 border border-slate-200/60 rounded-2xl overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b border-slate-200/60 bg-white">
          {visibleTabs.map(({ id, label, Icon }) => (
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
          {/* Ngữ pháp then chốt tab */}
          {bottomTab === "nguphapthenchot" && (
            <div className="space-y-4">
              {lesson.grammarMd ? (
                <>
                  <div className="flex justify-end">
                    <span className="text-[10px] text-slate-400">Click từ được tô sáng để nghe phát âm</span>
                  </div>
                  <MarkdownBlock content={lesson.grammarMd} onWordClick={handlePronounce} />
                </>
              ) : lesson.grammar.rule ? (
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
              ) : (
                <p className="text-sm text-slate-400 text-center py-8">Bài học này chưa có nội dung ngữ pháp then chốt.</p>
              )}
            </div>
          )}

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

          {/* Viết (Schreiben) tab — hidden entirely via visibleTabs when
              writingPromptMd is empty. */}
          {bottomTab === "viet" && lesson.writingPromptMd && (
            <WritingTabPanel lessonId={lesson.id} userId={userId} promptMd={lesson.writingPromptMd} />
          )}

          {/* Nói (Sprechen) tab — hidden entirely via visibleTabs when
              speakingMd is empty, so no "Sắp có" fallback needed. */}
          {bottomTab === "noi" && lesson.speakingMd && (
            <div className="space-y-4">
              <MarkdownBlock content={lesson.speakingMd} />
            </div>
          )}

          {/* Nghe (Hören) tab — hidden entirely via visibleTabs when
              listeningClips is empty, so no "Sắp có" fallback needed. File
              mp3 không phát trực tiếp ở đây — chỉ phát trong QuizPage lúc
              làm bài tập nghe. */}
          {bottomTab === "nghe" && lesson.listeningClips.length > 0 && (
            <div className="space-y-4 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Headphones className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-display font-bold text-slate-800">Luyện nghe</span>
              </div>
              <h3 className="text-sm font-display font-extrabold text-slate-800">Sẵn sàng luyện nghe chưa?</h3>
              <p className="text-xs text-slate-500 max-w-lg mx-auto font-sans leading-relaxed">
                Bấm bắt đầu để nghe file âm thanh và trả lời câu hỏi trắc nghiệm đi kèm.
              </p>
              <div className="flex justify-center pt-2">
                <Button id="btn-lesson-start-nghe" variant="primary" onClick={() => onStartQuiz(lesson.id, "nghe")}>
                  Bắt đầu bài tập nghe <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Đọc (Lesen) tab — hidden entirely via visibleTabs when
              readingPassages is empty, so no "Sắp có" fallback needed. */}
          {bottomTab === "doc" && lesson.readingPassages.length > 0 && (
            <div className="space-y-4">
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
              <div className="text-center space-y-2 pt-1">
                <h3 className="text-sm font-display font-extrabold text-slate-800">Đã đọc kỹ đoạn văn bên trên chưa?</h3>
                <p className="text-xs text-slate-500 max-w-lg mx-auto font-sans leading-relaxed">
                  Trả lời câu hỏi trắc nghiệm để kiểm tra khả năng đọc hiểu của bạn.
                </p>
              </div>
              <div className="flex justify-center pt-2">
                <Button id="btn-lesson-start-doc" variant="primary" onClick={() => onStartQuiz(lesson.id, "doc")}>
                  Bắt đầu bài tập đọc <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Từ vựng tab */}
          {bottomTab === "tuvung" && lesson.vocabularyMd && (
            <section className="space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div className="space-y-1">
                  <h2 className="text-sm font-display font-bold text-slate-900 flex items-center gap-1.5 font-sans">
                    <BookOpen className="w-4 h-4 text-orange-600" /> Từ vựng then chốt
                  </h2>
                  <p className="text-[10px] text-slate-400">Click từ được tô sáng để nghe phát âm</p>
                </div>
                <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                  {countHighlightedWords(lesson.vocabularyMd)} từ
                </span>
              </div>

              <MarkdownBlock content={lesson.vocabularyMd} onWordClick={handlePronounce} />
            </section>
          )}
        </div>
      </div>

    </div>
  );
};

const WritingTabPanel: React.FC<{ lessonId: string; userId: string; promptMd: string }> = ({ lessonId, userId, promptMd }) => {
  const { submission, loading, submit } = useWritingSubmission(lessonId, userId);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setContent(submission?.content ?? "");
  }, [submission?.id, submission?.content]);

  const handleSubmit = async () => {
    if (!content.trim()) {
      showToast("Bài viết không được để trống.", "warning");
      return;
    }
    setSubmitting(true);
    const { error } = await submit(content.trim());
    setSubmitting(false);
    if (error) {
      showToast("Nộp bài thất bại: " + error, "warning");
    } else {
      showToast("Đã nộp bài viết.", "success");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MarkdownBlock content={promptMd} />

      {submission?.gradedAt && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 space-y-1">
          <p className="text-xs font-display font-bold text-emerald-700">Đã chấm: {submission.score}/100</p>
          {submission.comment && (
            <p className="text-xs text-emerald-800 font-sans whitespace-pre-wrap">{submission.comment}</p>
          )}
        </div>
      )}
      {submission && !submission.gradedAt && (
        <p className="text-xs text-slate-400 font-sans">Đã nộp bài, đang chờ admin chấm điểm.</p>
      )}

      <textarea
        id="writing-submission-textarea"
        rows={10}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Viết bài của bạn ở đây..."
        className="w-full px-4 py-3 bg-white border border-slate-250 rounded-xl font-sans text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition duration-150 resize-y"
      />
      <div className="flex justify-center">
        <Button id="btn-writing-submit" variant="primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
          {submission ? "Nộp lại" : "Nộp bài"}
        </Button>
      </div>
    </div>
  );
};
