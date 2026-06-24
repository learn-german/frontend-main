/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { 
  Check, 
  Lock, 
  Play, 
  Award,
  BookOpen,
  ArrowRight,
  TrendingUp,
  MapPin,
  LockKeyhole
} from "lucide-react";
import { LevelBadge, ProgressBar, Button } from "../components/DesignSystem";
import { SAMPLE_MODULES } from "../data/mockData";
import { Level, UserStats, Lesson } from "../lib/appTypes";

interface RoadmapPageProps {
  stats: UserStats;
  onSelectLesson: (lessonId: string) => void;
}

export const RoadmapPage: React.FC<RoadmapPageProps> = ({
  stats,
  onSelectLesson
}) => {
  // We want to calculate unlock status of each lesson.
  // Rule for unlock:
  // Lesson 1 is always unlocked.
  // Lesson N is unlocked if Lesson N-1 is in completedLessons. Or if it has level A2/B1, let's unlock A1 fully first, but let the user proceed.
  // Actually, let's make a beautiful linear sequence of all our system lessons, and dynamically calculate status!
  // Let's gather all lessons into a list
  const allLessons: { lesson: Lesson; moduleTitleVi: string; indexInAll: number }[] = [];
  let currentIdx = 0;
  SAMPLE_MODULES.forEach(m => {
    m.lessons.forEach(l => {
      allLessons.push({
        lesson: l,
        moduleTitleVi: m.titleVi,
        indexInAll: currentIdx++
      });
    });
  });

  const getLessonStatus = (lessonId: string, indexInAll: number) => {
    if (stats.completedLessons.includes(lessonId)) {
      return "completed";
    }
    if (indexInAll === 0) {
      return "current";
    }
    // Check if the previous lesson was completed
    const prevLessonId = allLessons[indexInAll - 1].lesson.id;
    if (stats.completedLessons.includes(prevLessonId)) {
      return "current"; // Highlight current uncompleted lesson
    }
    return "locked";
  };

  // Organize by levels: A1, A2, B1
  const levels: { id: Level; title: string; desc: string; color: string; ringColor: string }[] = [
    { 
      id: "A1", 
      title: "Cấp độ A1 (Nhập môn - Sơ cấp)", 
      desc: "Xây dựng gốc rễ: làm quen bảng chữ cái, chào hỏi cơ nhân, đếm số và học các cấu trúc giới thiệu bản thân thông dụng.",
      color: "bg-orange-600",
      ringColor: "ring-orange-100"
    },
    { 
      id: "A2", 
      title: "Cấp độ A2 (Sơ trung cấp)", 
      desc: "Mở rộng giao tiếp: Mua bán tại siêu thị Đức, hỏi đường quốc lộ, giải trí cuối tuần và lập kế hoạch cùng bạn bè.",
      color: "bg-amber-500",
      ringColor: "ring-amber-100"
    },
    { 
      id: "B1", 
      title: "Cấp độ B1 (Trung cấp độc lập)", 
      desc: "Luyện phản xạ chuyên nghiệp: Bày tỏ quan điểm đồng tình/bác bỏ, thuyết trình đề tài xã hội, đàm thoại môi trường văn phòng công sở.",
      color: "bg-slate-800",
      ringColor: "ring-slate-200"
    }
  ];

  const totalLessons = allLessons.length;
  const completedTotal = stats.completedLessons.length;
  const overAllProgress = Math.round((completedTotal / totalLessons) * 100);

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
          <p className="text-[10px] text-slate-400 mt-2 font-sans text-center">Hoàn thành A1 để mở khóa bứt tốc A2!</p>
        </div>
      </div>

      {/* Visual Roadmap - Level Swimlanes */}
      <div className="space-y-12 relative">
        {/* Draw a subtle central connecting vertical line in backgrounds for timeline layout */}
        <div className="absolute left-6 md:left-[50px] top-4 bottom-4 w-1 bg-slate-200 rounded pointer-events-none z-0 hidden sm:block" />

        {levels.map((lvl) => {
          // Filter modules of this level
          const levelModules = SAMPLE_MODULES.filter(m => m.level === lvl.id);
          const levelLessons = levelModules.flatMap(m => m.lessons);

          // Calculate completed level lessons
          const levelCompletedCount = levelLessons.filter(l => stats.completedLessons.includes(l.id)).length;
          const levelTotal = levelLessons.length;
          const levelProgressPercent = levelTotal > 0 ? Math.round((levelCompletedCount / levelTotal) * 100) : 0;

          return (
            <div key={lvl.id} className="relative z-10 space-y-6 animate-in fade-in">
              
              {/* Level Group Header Card */}
              <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
                <div className="flex gap-4 items-start">
                  {/* Left big visual circle tag */}
                  <div className={`w-14 h-14 rounded-2xl ${lvl.color} text-white flex flex-col items-center justify-center font-display font-black text-lg shrink-0`}>
                    <span>{lvl.id}</span>
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-base sm:text-lg font-display font-bold text-slate-900 leading-tight">
                      {lvl.title}
                    </h2>
                    <p className="text-xs text-slate-500 leading-relaxed max-w-xl">
                      {lvl.desc}
                    </p>
                  </div>
                </div>

                {/* Level specific progress bubble */}
                <div className="w-full md:w-44 bg-slate-55/50 border border-slate-100 p-3 rounded-xl shrink-0">
                  <div className="flex justify-between items-center mb-1 text-[11px] font-display font-bold text-slate-400">
                    <span>Đã đạt</span>
                    <span>{levelProgressPercent}%</span>
                  </div>
                  <ProgressBar value={levelProgressPercent} className="h-2" />
                </div>
              </div>

              {/* Module lessons trail */}
              <div className="grid grid-cols-1 gap-6 pl-0 sm:pl-11">
                {levelModules.flatMap(m => m.lessons).map((lesson) => {
                  // Find index in overall sequence
                  const overallIdx = allLessons.findIndex(item => item.lesson.id === lesson.id);
                  const status = getLessonStatus(lesson.id, overallIdx);

                  // Set card border/bg classes based on status
                  const cardStyles = {
                    completed: "border-green-250 bg-white hover:border-green-300 shadow-sm hover:shadow",
                    current: "border-orange-500 bg-white shadow-md ring-4 ring-orange-50/50 active-lesson-pulse",
                    locked: "border-slate-200 bg-slate-50/50 opacity-75 cursor-not-allowed",
                  };

                  return (
                    <div 
                      key={lesson.id}
                      id={`roadmap-lesson-card-${lesson.id}`}
                      className={`p-5 rounded-2xl border transition-all duration-300 flex flex-col justify-between min-h-[170px] relative overflow-hidden group ${cardStyles[status]}`}
                    >
                      {/* Top section indicators */}
                      <div className="flex justify-between items-start gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-wider">
                              Bài {overallIdx + 1} • {lesson.moduleTitle}
                            </span>
                            {status === "current" && (
                              <span className="bg-orange-600 text-white text-[9px] font-display font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wide">
                                Đang học
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
                            <LockKeyhole className="w-3 h-3 text-slate-300" /> Bị khóa bới bài trước
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
};
