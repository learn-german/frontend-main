/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from "react";
import { Check, Lock, Play, ArrowRight, LockKeyhole, Clock } from "lucide-react";
import { ProgressBar } from "../components/DesignSystem";
import { UserStats, Module, LessonPosition } from "../lib/appTypes";
import { showToast } from "../lib/toast";
import { buildRoadmapItems } from "../lib/lessonOrder";
import { computeLessonStatuses } from "../lib/completion";

interface RoadmapPageProps {
  stats: UserStats;
  modules: Module[];
  positions: LessonPosition[];
  onSelectLesson: (lessonId: string) => void;
}

export const RoadmapPage: React.FC<RoadmapPageProps> = ({
  stats,
  modules,
  positions,
  onSelectLesson
}) => {
  const { items, orderedLessons } = React.useMemo(
    () => buildRoadmapItems(modules, positions, stats.unlockedLevels),
    [modules, positions, stats.unlockedLevels],
  );

  const statuses = React.useMemo(
    () => computeLessonStatuses(orderedLessons, stats.completedLessons),
    [orderedLessons, stats.completedLessons],
  );

  useEffect(() => {
    const current = items.find(
      (item) => item.kind === "lesson" && statuses[item.lesson.id] === "current",
    );
    if (!current || current.kind !== "lesson") return;
    document
      .getElementById(`roadmap-lesson-card-${current.lesson.id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Chỉ chạy khi danh sách bài đổi (mount / mở khóa level), không chạy mỗi lần render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const totalLessons = items.length;
  const completedTotal = stats.completedLessons.length;
  const overAllProgress = totalLessons > 0 ? Math.round((completedTotal / totalLessons) * 100) : 0;

  return (
    <div className="space-y-10 animate-in fade-in duration-300">

      {/* Top Banner section */}
      <div className="bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
        <div className="space-y-2">
          <span className="text-xs font-display font-black text-orange-700 bg-orange-50 px-3 py-1 rounded-full uppercase tracking-wider">
            Sơ đồ tiến trình học
          </span>
          <h1 className="text-2xl sm:text-3.5xl font-display font-black text-slate-900 tracking-tight font-sans">
            Lộ trình Chinh phục Tiếng Đức
          </h1>
          <p className="text-slate-500 text-xs sm:text-sm font-sans max-w-xl leading-relaxed">
            Học theo cấu trúc hình búp măng của DeutschPath. Mỗi mốc nối tiếp nhau logic, mở khóa bài học tiếp theo sau khi vượt qua bài kiểm tra mini!
          </p>
        </div>

        {/* Global progress tracker */}
        <div className="bg-slate-50/50 border border-slate-200/60 p-5 rounded-2xl min-w-[200px] w-full md:w-auto shrink-0 select-none">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs font-display font-bold text-slate-400">Tổng tiến trình</span>
            <span className="text-xs font-display font-extrabold text-slate-800">{completedTotal} / {totalLessons} Bài học</span>
          </div>
          <ProgressBar value={overAllProgress} className="text-xs" />
          <p className="text-[10px] text-slate-400 mt-2 font-sans text-center">Hoàn thành bài học trước để mở bài tiếp theo!</p>
        </div>
      </div>

      {/* Visual Roadmap - flat lesson trail (no level/module grouping shown) */}
      <div className="relative">
        {/* Draw a subtle central connecting vertical line in background for timeline layout */}
        <div className="absolute left-6 md:left-[50px] top-4 bottom-4 w-1 bg-slate-200 rounded pointer-events-none z-0 hidden sm:block" />

        {totalLessons === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">
            Chưa có level nào được mở, liên hệ quản trị viên.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 pl-0 sm:pl-11 relative z-10">
            {items.map((item, indexInAll) => {
              if (item.kind === "draft") {
                return (
                  <div
                    key={item.id}
                    className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 opacity-75 flex flex-col justify-between min-h-[170px] relative overflow-hidden"
                  >
                    <div className="flex justify-between items-start gap-4">
                      <div className="space-y-1">
                        <span className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-wider">
                          Bài {indexInAll + 1}
                        </span>
                        <h3 className="text-sm font-display font-bold text-slate-500 font-sans">
                          Đang chỉnh sửa
                        </h3>
                      </div>
                      <div className="shrink-0 pt-0.5 select-none">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center border border-slate-200" title="Bài học đang được chỉnh sửa">
                          <Clock className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-slate-100 mt-1 flex justify-end items-center">
                      <button
                        onClick={() => showToast("Bài học đang được chỉnh sửa. Hãy quay lại sau.", "warning")}
                        className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-display font-bold text-slate-400 cursor-not-allowed"
                      >
                        Chưa khả dụng
                      </button>
                    </div>
                  </div>
                );
              }

              const lesson = item.lesson;
              const status = statuses[lesson.id] ?? "locked";

              const cardStyles = {
                completed: "border-green-250 bg-white hover:border-green-300 shadow-sm hover:shadow",
                current: "border-orange-500 bg-white shadow-md ring-4 ring-orange-50/50 active-lesson-pulse",
                locked: "border-slate-200 bg-slate-50/50 opacity-75 cursor-not-allowed",
              };

              return (
                <div
                  key={lesson.id}
                  id={`roadmap-lesson-card-${lesson.id}`}
                  onClick={() => status !== "locked" && onSelectLesson(lesson.id)}
                  className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between min-h-[170px] relative overflow-hidden group ${cardStyles[status]} ${status !== "locked" ? "cursor-pointer" : ""}`}
                >
                  {/* Top section indicators */}
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-wider">
                          Bài {indexInAll + 1}
                        </span>
                        {status === "current" && (
                          <span className="bg-orange-600 text-white text-[9px] font-display font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wide">
                            Đang học
                          </span>
                        )}
                        {status === "completed" && (
                          <span className="bg-green-600 text-white text-[9px] font-display font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wide">
                            Đã xong
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-display font-bold text-slate-900 group-hover:text-orange-600 duration-150 transition font-sans">
                        {lesson.title}
                      </h3>
                      <p className="text-xs text-slate-500 font-sans leading-relaxed">
                        {lesson.titleVi}
                      </p>
                    </div>

                    {/* Status Icon badge */}
                    <div className="shrink-0 pt-0.5 select-none">
                      {status === "completed" && (
                        <div className="w-7 h-7 rounded-lg bg-green-50 text-green-700 flex items-center justify-center border border-green-100" title="Bài học hoàn thành">
                          <Check className="w-4 h-4 text-green-600 font-extrabold" />
                        </div>
                      )}
                      {status === "current" && (
                        <div className="w-7 h-7 rounded-lg bg-orange-600 text-white flex items-center justify-center shadow-md animate-pulse">
                          <Play className="w-3.5 h-3.5 fill-white translate-x-0.5" />
                        </div>
                      )}
                      {status === "locked" && (
                        <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-400 flex items-center justify-center border border-slate-200" title="Khóa học chưa được mở">
                          <Lock className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Content summary preview */}
                  <p className="text-[11px] text-slate-400 font-sans line-clamp-2 leading-relaxed my-3">
                    {lesson.objective}
                  </p>

                  {/* Bottom action trigger block */}
                  <div className="pt-3 border-t border-slate-100 mt-1 flex justify-between items-center">
                    <span className="text-[10px] font-mono text-slate-400">⏱ Video: {lesson.duration}</span>
                    {status !== "locked" ? (
                      <button
                        id={`btn-road-start-${lesson.id}`}
                        onClick={() => onSelectLesson(lesson.id)}
                        className="bg-slate-50 border border-slate-200 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700 px-3 py-1.5 rounded-lg text-xs font-display font-bold transition flex items-center gap-1 cursor-pointer select-none"
                      >
                        <span>{status === "completed" ? "Ôn tập lại" : "Khám phá ngay"}</span>
                        <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-display font-semibold flex items-center gap-1 select-none">
                        <LockKeyhole className="w-3 h-3 text-slate-300" /> Bị khóa bởi bài trước
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
