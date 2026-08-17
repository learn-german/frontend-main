/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Trophy,
  Flame,
  BookOpen,
  PlayCircle,
  CheckCircle,
  TrendingUp,
  Plus,
  ArrowRight,
  ListRestart,
  HeartCrack,
  Award,
  Clock
} from "lucide-react";
import { Button, LevelBadge, ProgressBar } from "../components/DesignSystem";
import { UserStats, Lesson, Module } from "../lib/appTypes";
import { LessonStatus } from "../lib/completion";
import { selectPlannedLessons, lessonsNeededToCatchUp } from "../lib/dashboardProgress";
import { itemCount } from "../lib/readingSetView";
import { supabase } from "../lib/supabase";

interface DashboardPageProps {
  user: { email: string; fullName: string };
  stats: UserStats;
  modules: Module[];
  orderedLessons: Lesson[];
  lessonStatuses: Record<string, LessonStatus>;
  lessonIdsCompletedToday: string[];
  onNavigateLesson: (lessonId: string) => void;
  onNavigateRoadmap: () => void;
}

interface DailyProgressReport {
  report_date: string;
  level_id: string;
  current_lesson_id: string | null;
  completed_required_lessons: number;
  total_required_lessons: number;
  actual_progress_percentage: number;
  expected_progress_percentage: number | null;
  progress_gap_percentage_point: number | null;
  progress_status: "on_track" | "attention" | "behind" | null;
  package_remaining_days: number | null;
  generation_status: "success" | "insufficient_data" | "empty" | "error";
}

const PROGRESS_STATUS_BADGE: Record<"on_track" | "attention" | "behind", { label: string; className: string }> = {
  on_track: { label: "✓ Đúng tiến độ", className: "bg-green-50 text-green-700 border border-green-200" },
  attention: { label: "⚠ Cần chú ý", className: "bg-amber-50 text-amber-700 border border-amber-200" },
  behind: { label: "⚠ Chậm tiến độ", className: "bg-red-50 text-red-700 border border-red-200" },
};

// duration đa số lưu dạng "mm:ss" (xem mockData.ts), nhưng một số bài seed
// cũ chỉ lưu số phút thuần không có ":" — parse an toàn cho cả 2 dạng.
const parseDurationMinutes = (duration: string): number => {
  if (!duration.includes(":")) return Number(duration) || 0;
  const [m, s] = duration.split(":").map(Number);
  return (m || 0) + (s || 0) / 60;
};

const formatDuration = (duration: string): string => {
  if (!duration.includes(":")) return `${Number(duration) || 0} phút`;
  const [m, s] = duration.split(":").map(Number);
  return s ? `${m} phút ${s} giây` : `${m} phút`;
};

const formatStudyTime = (totalMinutes: number): string => {
  const mins = Math.round(totalMinutes);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} giờ ${m} phút` : `${m} phút`;
};

const scoreStatusLabel = (score: number): string => (score >= 80 ? "Xuất sắc" : "Cần ôn lại");

export const DashboardPage: React.FC<DashboardPageProps> = ({
  user,
  stats,
  modules,
  orderedLessons,
  lessonStatuses,
  lessonIdsCompletedToday,
  onNavigateLesson,
  onNavigateRoadmap
}) => {
  const allLessons = modules.flatMap(m => m.lessons);

  // Find current next lesson to suggest
  const nextSuggestedLesson: Lesson | undefined = allLessons.find(l => !stats.completedLessons.includes(l.id)) ?? allLessons[0];

  // Tiến độ tính theo level của nextSuggestedLesson (level học viên đang học
  // dở) — luôn tính được từ dữ liệu local, không phụ thuộc report async nên
  // không bao giờ ra NaN/Invalid Date khi report chưa có/không đủ điều kiện.
  const currentLevel = nextSuggestedLesson?.level;
  const currentLevelLessons = currentLevel
    ? modules.filter(m => m.level === currentLevel).flatMap(m => m.lessons)
    : [];
  const totalLessonsInLevel = currentLevelLessons.length;
  const completedLessonsInLevel = currentLevelLessons.filter(l => stats.completedLessons.includes(l.id)).length;
  const progressLevelPercentage = totalLessonsInLevel > 0
    ? Math.round((completedLessonsInLevel / totalLessonsInLevel) * 100)
    : 0;
  const totalStudyMinutes = currentLevelLessons
    .filter(l => stats.completedLessons.includes(l.id))
    .reduce((sum, l) => sum + parseDurationMinutes(l.duration), 0);

  const todayStudyMinutes = allLessons
    .filter(l => lessonIdsCompletedToday.includes(l.id))
    .reduce((sum, l) => sum + parseDurationMinutes(l.duration), 0);

  // Tiến độ bài học = % câu hỏi thật đã làm / tổng số câu hỏi của bài (ngữ
  // pháp + nghe nằm trong grammar_exercises_public, đọc nằm trong
  // reading_question_groups_public dưới dạng nhóm — dùng lại itemCount() có
  // sẵn để đếm đúng số câu trong mỗi nhóm thay vì tính theo số category).
  // Submit theo set trọn gói (không có trạng thái "làm dở"), nên 1 category
  // đã có điểm nghĩa là toàn bộ câu hỏi của category đó tính là đã làm.
  const [lessonQuestionCounts, setLessonQuestionCounts] = useState<{ nguphap: number; nghe: number; doc: number }>({ nguphap: 0, nghe: 0, doc: 0 });

  useEffect(() => {
    if (!nextSuggestedLesson) return;
    const lessonId = nextSuggestedLesson.id;
    Promise.all([
      supabase.from("grammar_exercises_public").select("category").eq("lesson_id", lessonId),
      supabase.from("reading_question_groups_public").select("question_type, statements, sub_questions").eq("lesson_id", lessonId),
    ]).then(([exercisesRes, readingRes]) => {
      const exerciseRows = (exercisesRes.data ?? []) as { category: string | null }[];
      const docGroups = (readingRes.data ?? []) as { question_type: string | null; statements: unknown[] | null; sub_questions: unknown[] | null }[];
      setLessonQuestionCounts({
        nguphap: exerciseRows.filter(r => r.category === "nguphap").length,
        nghe: exerciseRows.filter(r => r.category === "nghe").length,
        doc: docGroups.reduce((sum, g) => sum + itemCount({ ...g, question_type: (g.question_type ?? "multiple_choice") as "richtig_falsch" | "multiple_choice" }), 0),
      });
    });
  }, [nextSuggestedLesson?.id]);

  const lessonProgressPercent = (() => {
    const total = lessonQuestionCounts.nguphap + lessonQuestionCounts.nghe + lessonQuestionCounts.doc;
    if (total === 0 || !nextSuggestedLesson) return 0;
    const scores = stats.quizScoresByCategory[nextSuggestedLesson.id] ?? {};
    const completed =
      (scores.nguphap !== undefined ? lessonQuestionCounts.nguphap : 0) +
      (scores.nghe !== undefined ? lessonQuestionCounts.nghe : 0) +
      (scores.doc !== undefined ? lessonQuestionCounts.doc : 0);
    return Math.round((completed / total) * 100);
  })();

  const [report, setReport] = useState<DailyProgressReport | null>(null);

  useEffect(() => {
    supabase.functions.invoke("daily-progress-report", { method: "GET" }).then(({ data }) => {
      setReport(data ?? null);
    });
  }, []);

  const catchUpLessons = report
    ? lessonsNeededToCatchUp(report.progress_gap_percentage_point, report.total_required_lessons)
    : 0;

  const planLessons = selectPlannedLessons(orderedLessons, lessonStatuses, stats.completedLessons);

  const planStatusLabel = (index: number): string => {
    if (index === 0) return "Đang học";
    if (index === 1) return "Tiếp theo";
    return "Sắp học";
  };

  // Check recent scores list
  const recentScores = Object.entries(stats.quizScores).map(([lessonId, score]) => {
    const match = allLessons.find(l => l.id === lessonId);
    return { lessonId, title: match?.titleVi ?? "Bài kiểm tra", score: score as number };
  });

  if (!nextSuggestedLesson) return null;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Top Welcome Title section with Streak banner */}
      <div className="bg-slate-900 border border-slate-850 rounded-2xl p-4 sm:p-5 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 select-none relative overflow-hidden animate-in fade-in">
        {/* Abstract vector shape */}
        <div className="absolute top-[-50px] right-[-50px] w-48 h-48 bg-orange-600/5 rounded-full blur-2xl pointer-events-none" />

        <div className="space-y-1 z-10">
          <p className="text-yellow-400 font-display font-bold text-xs uppercase tracking-wider font-sans">Chào ngày mới!</p>
          <h1 className="text-xl sm:text-2xl font-display font-black leading-tight text-white font-sans">
            Hallo, {user.fullName}! 👋
          </h1>
          <p className="text-slate-400 text-xs font-sans max-w-md">
            Hôm nay là một ngày tuyệt vời để chinh phục tiếng Đức. Hãy bắt đầu từ một bài học nhỏ!
          </p>
        </div>

        {/* Big fire streak badge */}
        <div className="bg-slate-800/80 backdrop-blur-md rounded-xl p-3 border border-slate-700/60 flex items-center gap-3 z-10 self-stretch sm:self-auto min-w-[170px]">
          <div className="w-10 h-10 rounded-xl bg-orange-600/10 text-orange-500 flex items-center justify-center text-xl border border-orange-500/20 shrink-0">
            🔥
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-display font-semibold block leading-tight">STREAK HÀNG NGÀY</span>
            <span className="text-lg font-display font-extrabold text-white leading-tight">{stats.streak} ngày</span>
            <span className="text-[10px] text-amber-500 block font-sans">
              {stats.streak > 0 ? "• Đã an toàn hôm nay" : "Học 15 phút để bắt đầu streak"}
            </span>
          </div>
        </div>
      </div>

      {/* Grid of details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* Left Column (Main widgets) */}
        <div className="lg:col-span-8 space-y-4">

          {/* Tổng quan học tập: số liệu local (luôn có) + bổ sung từ daily-progress-report khi có */}
          <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm space-y-3 relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1 w-full bg-orange-600" />
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-orange-600" /> Tổng quan học tập
              </h3>
              <div className="flex items-center gap-2.5 text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Hôm nay: <b className="text-slate-700">{formatStudyTime(todayStudyMinutes)}</b>
                </span>
                <span className="flex items-center gap-1.5">
                  Hôm nay, {new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <span className="text-[11px] text-slate-400">Cấp độ hiện tại</span>
                <div className="mt-1"><LevelBadge level={nextSuggestedLesson.level} /></div>
              </div>
              <div>
                <span className="text-[11px] text-slate-400">Tiến độ khóa học</span>
                <p className="text-lg font-display font-black text-green-600 mt-0.5 leading-none">{progressLevelPercentage}%</p>
                <ProgressBar value={progressLevelPercentage} className="mt-1.5" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400">Tổng thời gian học</span>
                <p className="text-sm font-display font-bold text-slate-800 mt-1.5">{formatStudyTime(totalStudyMinutes)}</p>
              </div>
              <div>
                <span className="text-[11px] text-slate-400">Bài học hoàn tất</span>
                <p className="text-sm font-display font-bold text-slate-800 mt-1.5">{completedLessonsInLevel} / {totalLessonsInLevel}</p>
              </div>
            </div>

            {report && report.generation_status === "success" && report.progress_status && (
              <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100/80">
                <span className={`text-xs font-display font-bold px-2 py-0.5 rounded-lg ${PROGRESS_STATUS_BADGE[report.progress_status].className}`}>
                  {PROGRESS_STATUS_BADGE[report.progress_status].label}
                </span>
                {report.expected_progress_percentage !== null && (
                  <span className="text-xs text-slate-500">
                    Kỳ vọng: <b className="text-slate-800">{Math.round(report.expected_progress_percentage)}%</b>
                  </span>
                )}
                {report.progress_gap_percentage_point !== null && report.progress_gap_percentage_point > 0 && (
                  <span className="text-xs text-red-600 font-display font-bold">
                    -{Math.round(report.progress_gap_percentage_point)} điểm %
                  </span>
                )}
                {report.package_remaining_days !== null && (
                  <span className="text-xs text-slate-500">
                    Còn lại: <b className="text-slate-800">{report.package_remaining_days} ngày</b>
                  </span>
                )}
                {catchUpLessons > 0 && (
                  <span className="text-xs text-slate-500">
                    Cần thêm <b className="text-slate-800">{catchUpLessons}</b> bài để bắt kịp
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Bài học hiện tại + Tổng điểm tích lũy: 2 cột ngang hàng */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Bài học hiện tại */}
            <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm space-y-3 flex flex-col">
              <div className="flex items-center gap-2">
                <LevelBadge level={nextSuggestedLesson.level} />
                <span className="text-xs font-display font-bold text-slate-400 uppercase tracking-wider">Bài học hiện tại</span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-lg shrink-0">
                  👋
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-display font-extrabold text-slate-900 leading-tight truncate">{nextSuggestedLesson.title}</h3>
                  <p className="text-slate-500 text-[11px] font-sans mt-0.5">
                    {nextSuggestedLesson.moduleTitle} • {formatDuration(nextSuggestedLesson.duration)}
                  </p>
                  <div className="mt-1.5 space-y-1">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Tiến độ bài học</span>
                      <span>{lessonProgressPercent}%</span>
                    </div>
                    <ProgressBar value={lessonProgressPercent} />
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 mt-auto">
                <Button
                  id="btn-dash-continue-learn"
                  variant="primary"
                  size="md"
                  onClick={() => onNavigateLesson(nextSuggestedLesson.id)}
                >
                  <PlayCircle className="w-4 h-4 mr-2" /> Tiếp tục học
                </Button>
                <Button
                  id="btn-dash-view-lesson"
                  variant="secondary"
                  size="sm"
                  onClick={() => onNavigateLesson(nextSuggestedLesson.id)}
                >
                  Xem chi tiết bài học
                </Button>
              </div>
            </div>

            {/* Total XP Score card */}
            <div className="bg-white border border-slate-200/60 p-4 rounded-2xl shadow-sm space-y-3 flex flex-col">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-xs font-display font-bold text-slate-400 uppercase tracking-wider">Tổng điểm tích lũy</span>
                  <h4 className="text-2xl font-display font-black text-slate-800 mt-0.5">{stats.xp} <span className="text-sm text-slate-400 font-bold">XP</span></h4>
                </div>
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center text-base shadow-sm shrink-0">
                  🏆
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Tích đủ <b>500 XP</b> để nhận danh hiệu <b>"Bảo bối nói tiếng Đức"</b>!
              </p>
              <div className="pt-2 border-t border-slate-100/80 space-y-1 mt-auto">
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Cấp tiếp theo (500 XP)</span>
                  <span>{Math.min(stats.xp, 500)} / 500 XP</span>
                </div>
                <ProgressBar value={stats.xp} max={500} />
              </div>
            </div>

          </div>

        </div>

        {/* Right Column (Test history, upcoming lists) */}
        <div className="lg:col-span-4 space-y-4">

          {/* Recent Quiz Scores */}
          <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm space-y-3">
            <h3 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-amber-500" /> Kết quả kiểm tra gần đây
            </h3>

            {recentScores.length === 0 ? (
              <div className="text-center py-4 px-3 space-y-1.5">
                <div className="w-10 h-10 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300 text-sm">
                  📊
                </div>
                <p className="text-xs text-slate-500 font-sans leading-relaxed">
                  Bạn chưa thực hiện bài kiểm tra nào. Sau mỗi bài học, hãy click "Bắt đầu Test" để ghi tên tại đây!
                </p>
                <Button
                  id="btn-start-test-first"
                  variant="secondary"
                  size="sm"
                  onClick={() => onNavigateLesson(nextSuggestedLesson.id)}
                >
                  Học bài đầu ngay
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {recentScores.slice(0, 3).map((item, index) => (
                  <button
                    key={index}
                    onClick={() => onNavigateLesson(item.lessonId)}
                    className="w-full flex items-center justify-between p-2.5 bg-slate-50/50 rounded-xl border border-slate-100/60 cursor-pointer hover:border-slate-200 transition text-left"
                  >
                    <div className="space-y-0.5 max-w-[170px]">
                      <h4 className="text-xs font-display font-bold text-slate-800 truncate">{item.title}</h4>
                      <span className={`text-[10px] font-sans ${item.score >= 80 ? "text-green-600" : "text-amber-600"}`}>
                        {scoreStatusLabel(item.score)}
                      </span>
                    </div>
                    {/* Score badge with conditional colors */}
                    <span className={`text-xs font-display font-black px-2 py-1 rounded-lg shrink-0 ${
                      item.score >= 80
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}>
                      {item.score} / 100
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Kế hoạch học tập: 4 bài gần nhất theo thứ tự thật của roadmap */}
          {planLessons.length > 0 && (
            <div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-indigo-500" /> Kế hoạch học tập
                </h3>
                <button
                  id="btn-dash-view-road"
                  onClick={onNavigateRoadmap}
                  className="text-orange-600 text-[11px] font-display font-bold hover:underline cursor-pointer flex items-center gap-0.5 shrink-0"
                >
                  Xem lộ trình <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="space-y-2">
                {planLessons.map((lesson, i) => (
                  <div key={lesson.id} className="flex gap-2.5 items-start border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                    <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 font-display font-bold text-[10px] flex items-center justify-center shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-display font-bold text-slate-800 leading-snug truncate">{lesson.title}</h4>
                        <span className={`text-[9px] font-display font-bold shrink-0 ${i === 0 ? "text-orange-600" : "text-slate-400"}`}>
                          {planStatusLabel(i)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-none mt-0.5">{formatDuration(lesson.duration)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
