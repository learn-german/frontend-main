/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  PlayCircle,
  Calendar,
  Clock,
  Users,
  HelpCircle,
} from "lucide-react";
import { Button, LevelBadge, ProgressBar } from "../components/DesignSystem";
import { UserStats, Lesson, Module } from "../lib/appTypes";
import { LessonStatus } from "../lib/completion";
import { selectPlannedLessons, lessonsNeededToCatchUp } from "../lib/dashboardProgress";
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

const PROGRESS_STATUS_PHRASE: Record<"on_track" | "attention" | "behind", string> = {
  on_track: "đúng kế hoạch",
  attention: "đang thấp hơn kế hoạch",
  behind: "đang chậm tiến độ",
};

const formatDurationLabel = (duration: string): string => {
  if (!duration.includes(":")) return `${Number(duration) || 0} phút`;
  return `${duration} phút`;
};

const NoData: React.FC<{ size?: "sm" | "md" }> = ({ size = "md" }) => (
  <span
    className="inline-flex items-center gap-0.5 text-slate-400"
    title="Chưa có dữ liệu"
  >
    <span className={size === "md" ? "text-xl font-display font-black leading-none" : "text-[11px] font-display font-bold"}>
      —
    </span>
    <HelpCircle className={size === "md" ? "w-3.5 h-3.5" : "w-3 h-3"} aria-hidden />
    <span className="sr-only">Chưa có dữ liệu</span>
  </span>
);

export const DashboardPage: React.FC<DashboardPageProps> = ({
  user,
  stats,
  modules,
  orderedLessons,
  lessonStatuses,
  onNavigateLesson,
}) => {
  const allLessons = modules.flatMap(m => m.lessons);
  const nextSuggestedLesson: Lesson | undefined = allLessons.find(l => !stats.completedLessons.includes(l.id)) ?? allLessons[0];

  const currentLevel = nextSuggestedLesson?.level;
  const currentLevelLessons = currentLevel
    ? modules.filter(m => m.level === currentLevel).flatMap(m => m.lessons)
    : [];
  const totalLessonsInLevel = currentLevelLessons.length;
  const completedLessonsInLevel = currentLevelLessons.filter(l => stats.completedLessons.includes(l.id)).length;
  const progressLevelPercentage = totalLessonsInLevel > 0
    ? Math.round((completedLessonsInLevel / totalLessonsInLevel) * 100)
    : 0;

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

  const recentScores = Object.entries(stats.quizScores).map(([lessonId, score]) => {
    const match = allLessons.find(l => l.id === lessonId);
    return { lessonId, title: match?.titleVi ?? "Bài kiểm tra", score: score as number };
  });

  if (!nextSuggestedLesson) return null;

  const reportSuccess = report?.generation_status === "success";
  const actualProgress = reportSuccess && report
    ? report.actual_progress_percentage
    : progressLevelPercentage;
  const expectedProgress = reportSuccess && report?.expected_progress_percentage !== null && report?.expected_progress_percentage !== undefined
    ? report.expected_progress_percentage
    : null;
  const isBehindSchedule = expectedProgress === null || actualProgress < expectedProgress;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="bg-gradient-to-br from-slate-900 via-[#1a2744] to-[#2a1f4e] rounded-2xl p-4 sm:p-5 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 select-none relative overflow-hidden">
        <div className="absolute top-[-50px] right-[-50px] w-48 h-48 bg-orange-600/5 rounded-full blur-2xl pointer-events-none" />

        <div className="space-y-1 z-10">
          <p className="text-yellow-400 font-display font-bold text-xs uppercase tracking-wider">Chào ngày mới!</p>
          <h1 className="text-xl sm:text-2xl font-display font-black leading-tight text-white">
            Hallo, {user.fullName}! 👋
          </h1>
          <p className="text-slate-400 text-xs font-sans max-w-md">
            Hôm nay là một ngày tuyệt vời để chinh phục tiếng Đức. Hãy bắt đầu từ một bài học nhỏ!
          </p>
        </div>

        <div className="bg-slate-950/55 backdrop-blur-md rounded-xl p-3 border border-white/10 flex items-center gap-3 z-10 self-stretch sm:self-auto min-w-[170px]">
          <div className="w-10 h-10 rounded-xl bg-orange-600/15 text-orange-500 flex items-center justify-center text-xl shrink-0">
            🔥
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-display font-semibold block leading-tight">STREAK HÀNG NGÀY</span>
            <span className="text-lg font-display font-extrabold text-white leading-tight">{stats.streak} ngày</span>
            <span className="text-[10px] text-yellow-400 block font-sans">
              {stats.streak > 0 ? "Đã an toàn hôm nay" : "Học 15 phút để bắt đầu streak"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-8 flex flex-col gap-4 min-h-0">

          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs font-display font-bold text-red-700 uppercase tracking-widest flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-red-700" /> Tổng quan
              </h3>
              <span className="text-[11px] text-slate-400 inline-flex items-center gap-1">
                Ngày báo cáo:{" "}
                {reportSuccess && report?.report_date
                  ? new Date(report.report_date).toLocaleDateString("vi-VN")
                  : <NoData size="sm" />}
              </span>
            </div>

            <div className="bg-slate-50 rounded-[10px] px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] text-slate-400 block mb-1">Level hiện tại</span>
                <LevelBadge level={nextSuggestedLesson.level} />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block mb-1">Lesson hiện tại</span>
                <p className="text-xs font-display font-bold text-slate-800 leading-snug truncate">
                  {nextSuggestedLesson.title}
                </p>
              </div>
            </div>

            <div className="space-y-3.5">
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] text-slate-500 inline-flex items-center gap-1 flex-wrap">
                    Trạng thái tiến độ:{" "}
                    {reportSuccess && report?.progress_status ? (
                      <b className="font-semibold text-slate-700">
                        {PROGRESS_STATUS_PHRASE[report.progress_status]}
                      </b>
                    ) : (
                      <NoData size="sm" />
                    )}
                  </span>
                  {reportSuccess && report?.progress_gap_percentage_point != null && report.progress_gap_percentage_point > 0 ? (
                    <span className="text-[11px] font-display font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                      -{Math.round(report.progress_gap_percentage_point)} điểm %
                    </span>
                  ) : !reportSuccess ? (
                    <NoData size="sm" />
                  ) : null}
                </div>
                <ProgressBar
                  value={actualProgress}
                  markerValue={expectedProgress ?? undefined}
                  barClassName="bg-gradient-to-r from-amber-400 via-lime-400 to-green-500"
                  markerClassName="bg-slate-600"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-3.5 border-t border-slate-100">
                {([
                  {
                    label: "Trạng thái",
                    value: reportSuccess && report?.progress_status ? (
                      <span className={`inline-flex items-center text-[11px] font-display font-bold px-2 py-1 rounded-lg whitespace-nowrap ${PROGRESS_STATUS_BADGE[report.progress_status].className}`}>
                        {PROGRESS_STATUS_BADGE[report.progress_status].label}
                      </span>
                    ) : (
                      <NoData />
                    ),
                  },
                  {
                    label: "Thời gian còn lại",
                    value: reportSuccess && report?.package_remaining_days != null ? (
                      <p className="text-xl font-display font-black text-slate-800 leading-none">
                        {report.package_remaining_days} ngày
                      </p>
                    ) : (
                      <NoData />
                    ),
                  },
                  {
                    label: "Bài học hoàn tất",
                    value: (
                      <p className="text-xl font-display font-black text-slate-800 leading-none">
                        {completedLessonsInLevel}/{totalLessonsInLevel}
                      </p>
                    ),
                  },
                  {
                    label: "Tiến độ hiện tại",
                    value: (
                      <p className="text-xl font-display font-black text-slate-800 leading-none">
                        {Math.round(actualProgress)}%
                      </p>
                    ),
                  },
                  {
                    label: "Tiến độ kỳ vọng",
                    value: expectedProgress !== null ? (
                      <p className="text-xl font-display font-black text-slate-800 leading-none">
                        {Math.round(expectedProgress)}%
                      </p>
                    ) : (
                      <NoData />
                    ),
                  },
                ] as const).map((item) => (
                  <div key={item.label} className="flex flex-col h-[52px]">
                    <span className="text-[10px] text-slate-400 leading-none">{item.label}</span>
                    <div className="mt-auto">{item.value}</div>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-slate-500 pt-2.5 border-t border-slate-100 inline-flex flex-wrap items-center gap-x-1">
                Hiện tại <b className="text-slate-800">{Math.round(actualProgress)}%</b> — Kỳ vọng{" "}
                {expectedProgress !== null
                  ? <b className="text-slate-800">{Math.round(expectedProgress)}%</b>
                  : <NoData size="sm" />}
                {isBehindSchedule && (
                  <>
                    {" "}— Cần hoàn thành thêm{" "}
                    {catchUpLessons > 0
                      ? <b className="text-slate-800">{catchUpLessons} bài</b>
                      : <NoData size="sm" />}
                    {" "}để bắt kịp
                  </>
                )}
                .
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1 min-h-0 items-stretch">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-3.5 h-full min-h-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-display font-bold text-red-800 uppercase tracking-wider">Bài học hiện tại</h3>
                <LevelBadge level={nextSuggestedLesson.level} />
              </div>
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-[10px] bg-rose-50 border border-rose-100 text-red-700 flex items-center justify-center shrink-0">
                  <PlayCircle className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-display font-bold text-slate-900 leading-snug">{nextSuggestedLesson.title}</h3>
                  <p className="text-[11px] font-sans text-slate-500 mt-1">
                    Thuộc module {nextSuggestedLesson.moduleTitle}
                  </p>
                  <p className="text-[11px] font-sans text-slate-500 mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {formatDurationLabel(nextSuggestedLesson.duration)} học
                  </p>
                </div>
              </div>
              <Button
                id="btn-dash-continue-learn"
                variant="primary"
                size="md"
                className="w-full mt-auto rounded-full bg-red-800 hover:bg-red-900 shadow-[0_4px_14px_rgba(153,27,27,0.22)]"
                onClick={() => onNavigateLesson(nextSuggestedLesson.id)}
              >
                <PlayCircle className="w-4 h-4 mr-2" /> Tiếp tục học
              </Button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col h-full min-h-0">
              <div className="flex items-start justify-between">
                <h3 className="text-xs font-display font-bold text-stone-500 uppercase tracking-widest">Tổng điểm tích lũy</h3>
                <div className="w-9 h-9 rounded-lg bg-yellow-100 border border-yellow-300 flex items-center justify-center text-base shrink-0">
                  🏆
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center py-5">
                <p className="text-5xl font-display font-black text-slate-800 leading-none tracking-tight">
                  {stats.xp} <span className="text-3xl font-black">XP</span>
                </p>
              </div>
              <p className="text-[11px] font-sans text-slate-500 leading-relaxed text-center">
                Tích đủ <b className="text-slate-700">500 XP</b> để nhận danh hiệu <b className="text-slate-700">"Bảo bối nói tiếng Đức"</b> và mở khóa biểu tượng lửa độc quyền!
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4 min-h-0">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2.5">
            <h3 className="text-[11px] font-display font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-500" /> Kết quả kiểm tra gần đây
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
                    className="w-full flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-slate-300 transition text-left gap-2.5"
                  >
                    <div className="min-w-0">
                      <h4 className="text-xs font-display font-bold text-slate-800 truncate">{item.title}</h4>
                      <span className="text-[10px] font-sans text-slate-400 mt-0.5 block">Đã hoàn thành</span>
                    </div>
                    <span className="text-[11px] font-display font-extrabold px-2 py-1.5 rounded-lg shrink-0 bg-rose-50 text-red-600 border border-red-200">
                      {item.score}%
                    </span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[10px] italic text-slate-400 leading-relaxed">
              *Điểm số được đồng bộ hóa tức thì từ bài viết quiz của từng bài học.
            </p>
          </div>

          {planLessons.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col flex-1 min-h-0">
              <h3 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest">
                Kế hoạch học tập
              </h3>
              <p className="text-[11px] font-sans text-slate-400 mb-3 mt-1">
                {planLessons.length} bài trong lộ trình gần nhất
              </p>

              <div className="flex flex-col gap-2 flex-1 border border-slate-200 rounded-xl p-2">
                {planLessons.map((lesson, i) => (
                  <div
                    key={lesson.id}
                    className={`flex gap-2.5 items-start p-2.5 rounded-lg border flex-1 ${
                      i === 0
                        ? "bg-rose-50/80 border-rose-200 border-l-4 border-l-red-600"
                        : "bg-white border-slate-200"
                    }`}
                  >
                    <div className="w-6 h-6 rounded-md bg-slate-100 border border-slate-200 text-slate-600 font-display font-bold text-[11px] flex items-center justify-center shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-display font-bold text-slate-800 leading-snug">{lesson.title}</h4>
                        <span
                          className={`text-[9px] font-display font-bold px-2 py-0.5 rounded-md shrink-0 whitespace-nowrap ${
                            i === 0
                              ? "bg-rose-100 text-red-600 border border-rose-200"
                              : i === 1
                                ? "bg-green-50 text-green-600 border border-green-200"
                                : "bg-indigo-50 text-slate-500 border border-slate-200"
                          }`}
                        >
                          {planStatusLabel(i)}
                        </span>
                      </div>
                      <p className="text-[10px] font-sans text-slate-400 mt-0.5">{lesson.moduleTitle}</p>
                      <p className="text-[10px] font-sans text-slate-400 mt-0.5">{formatDurationLabel(lesson.duration)}</p>
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
