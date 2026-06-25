/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { 
  Trophy, 
  Flame, 
  BookOpen, 
  PlayCircle, 
  CheckCircle, 
  TrendingUp, 
  Plus, 
  Zap,
  ArrowRight,
  ListRestart,
  HeartCrack,
  Award
} from "lucide-react";
import { Button, LevelBadge, ProgressBar } from "../components/DesignSystem";
import { UserStats, Lesson, Module } from "../lib/appTypes";

interface DashboardPageProps {
  user: { email: string; fullName: string };
  stats: UserStats;
  modules: Module[];
  onNavigateLesson: (lessonId: string) => void;
  onNavigateRoadmap: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  user,
  stats,
  modules,
  onNavigateLesson,
  onNavigateRoadmap
}) => {
  const a1Module = modules.find(m => m.level === "A1");
  const totalLessonsInA1 = a1Module?.lessons.length ?? 0;
  const completedA1Lessons = a1Module?.lessons.filter(l => stats.completedLessons.includes(l.id)).length ?? 0;
  const progressA1Percentage = totalLessonsInA1 > 0 ? Math.round((completedA1Lessons / totalLessonsInA1) * 100) : 0;

  const allLessons = modules.flatMap(m => m.lessons);
  let nextSuggestedLesson: Lesson | undefined = allLessons[0];
  for (const l of allLessons) {
    if (!stats.completedLessons.includes(l.id)) {
      nextSuggestedLesson = l;
      break;
    }
  }

  const recentScores = Object.entries(stats.quizScores).map(([lessonId, score]) => {
    const match = allLessons.find(l => l.id === lessonId);
    return { lessonId, title: match?.titleVi ?? "Bài kiểm tra", score: score as number };
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Welcome Title section with Streak banner */}
      <div className="bg-slate-900 border border-slate-850 rounded-3xl p-6 sm:p-8 text-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 select-none relative overflow-hidden animate-in fade-in">
        {/* Abstract vector shape */}
        <div className="absolute top-[-50px] right-[-50px] w-48 h-48 bg-orange-600/5 rounded-full blur-2xl pointer-events-none" />

        <div className="space-y-1.5 z-10">
          <p className="text-yellow-400 font-display font-bold text-xs uppercase tracking-wider font-sans">Chào ngày mới!</p>
          <h1 className="text-2xl sm:text-3xl font-display font-black leading-tight text-white font-sans">
            Hallo, {user.fullName}! 👋
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm font-sans max-w-md">
            Hôm nay là một ngày tuyệt vời để học từ mới tiếng Đức. Mục tiêu hàng ngày của bạn đã đạt 40%!
          </p>
        </div>

        {/* Big fire streak badge */}
        <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl p-4 border border-slate-700/60 flex items-center gap-4 z-10 self-stretch sm:self-auto min-w-[180px]">
          <div className="w-12 h-12 rounded-xl bg-orange-600/10 text-orange-500 flex items-center justify-center text-2xl border border-orange-500/20">
            🔥
          </div>
          <div>
            <span className="text-[10px] text-slate-400 font-display font-semibold block leading-tight">STREAK HÀNG NGÀY</span>
            <span className="text-xl font-display font-extrabold text-white">{stats.streak} ngày</span>
            <span className="text-[10px] text-amber-500 block mt-0.5 font-sans">• Đã an toàn hôm nay</span>
          </div>
        </div>
      </div>

      {/* Grid of details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column (Main widgets) */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Continue Learning card */}
          {nextSuggestedLesson && (
          <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1.5 w-full bg-orange-600" />
            <div className="space-y-3 flex-1">
              <div className="inline-flex items-center gap-2">
                <span className="text-xs font-display font-bold text-orange-700 bg-orange-50 px-2.5 py-0.5 rounded-full uppercase">Bài học tiếp theo</span>
                <LevelBadge level={nextSuggestedLesson.level} />
              </div>
              <h3 className="text-lg font-display font-extrabold text-slate-900 leading-tight">
                {nextSuggestedLesson.title}
              </h3>
              <p className="text-slate-500 text-xs font-sans">
                {nextSuggestedLesson.titleVi} • Thuộc module {nextSuggestedLesson.moduleTitle}
              </p>
              <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
                <span className="flex items-center gap-1">⏰ {nextSuggestedLesson.duration} phút học</span>
                <span className="flex items-center gap-1">📖 {nextSuggestedLesson.vocabulary.length} từ vựng then chốt</span>
              </div>
            </div>

            <Button
              id="btn-dash-continue-learn"
              variant="primary"
              size="lg"
              className="w-full sm:w-auto shrink-0"
              onClick={() => onNavigateLesson(nextSuggestedLesson.id)}
            >
              <PlayCircle className="w-4.5 h-4.5 mr-2" /> Tiếp tục học
            </Button>
          </div>
          )}

          {/* Performance stats bento panel */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            {/* Level progress */}
            <div className="bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm flex flex-col justify-between">
              <div className="space-y-2">
                <span className="text-xs font-display font-bold text-slate-400 uppercase tracking-wider">Tiến độ cấp độ A1</span>
                <div className="flex justify-between items-baseline pt-1">
                  <h4 className="text-2xl font-display font-black text-green-600">{progressA1Percentage}%</h4>
                  <span className="text-xs text-slate-500">{completedA1Lessons}/{totalLessonsInA1} bài hoàn tất</span>
                </div>
                <ProgressBar value={progressA1Percentage} className="pt-2 text-xs" />
              </div>
              <div className="pt-4 border-t border-slate-100/80 mt-4 flex justify-between items-center text-xs">
                <span className="text-slate-500">Mục tiêu tiếp theo là khóa <b>A2</b></span>
                <button 
                  id="btn-dash-view-road"
                  onClick={onNavigateRoadmap} 
                  className="text-orange-600 font-display font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                >
                  Mở bản đồ <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Total XP Score card */}
            <div className="bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-xs font-display font-bold text-slate-400 uppercase tracking-wider">Tổng điểm tích lũy</span>
                  <h4 className="text-3xl font-display font-black text-slate-800 mt-1">{stats.xp} <span className="text-base text-slate-400 font-bold">XP</span></h4>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center text-lg shadow-sm">
                  🏆
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                Tích đủ <b>500 XP</b> để nhận danh hiệu <b>"Bảo bối nói tiếng Đức"</b> và mở khóa biểu tượng lửa độc quyền!
              </p>
            </div>
          </div>

          {/* Recommended quick activities / interactive card */}
          <div className="space-y-4">
            <h3 className="text-base font-display font-extrabold text-slate-900 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500 animate-pulse" /> Đề xuất rèn luyện nhanh
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              <div className="bg-slate-50/50 border border-slate-200/60 hover:border-orange-100 p-5 rounded-2xl flex items-start gap-4 hover:bg-white duration-200 transition">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center shrink-0 font-display font-bold text-sm">
                  ⚡
                </div>
                <div>
                  <h4 className="text-sm font-display font-bold text-slate-900 font-sans">Chiến dịch lướt từ vựng</h4>
                  <p className="text-[11px] text-slate-500 leading-normal mt-1">
                    Học ngẫu nhiên 10 từ vựng cốt lõi thường gặp nhất trong các đề thi nói hội thoại của Goethe.
                  </p>
                  <Button 
                    id="btn-dash-vocab-quiz"
                    variant="ghost" 
                    size="sm" 
                    className="text-orange-600 p-0 hover:bg-transparent hover:underline mt-2 flex items-center text-xs font-bold whitespace-nowrap"
                    onClick={() => nextSuggestedLesson && onNavigateLesson(nextSuggestedLesson.id)}
                  >
                    Xem bài học liên quan <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>

              <div className="bg-slate-50/50 border border-slate-200/60 hover:border-amber-100 p-5 rounded-2xl flex items-start gap-4 hover:bg-white duration-200 transition">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 text-sm">
                  🎧
                </div>
                <div>
                  <h4 className="text-sm font-display font-bold text-slate-900 font-sans">Luyện nghe hội thoại</h4>
                  <p className="text-[11px] text-slate-500 leading-normal mt-1">
                    Rèn luyện thói quen phản xạ âm thanh qua 4 giọng đọc máy chuẩn bản xứ miền Tây nước Đức.
                  </p>
                  <Button 
                    id="btn-dash-listening-drill"
                    variant="ghost" 
                    size="sm" 
                    className="text-amber-600 p-0 hover:bg-transparent hover:underline mt-2 flex items-center text-xs font-bold whitespace-nowrap"
                    onClick={() => nextSuggestedLesson && onNavigateLesson(nextSuggestedLesson.id)}
                  >
                    Mở bài nghe mẫu <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* Right Column (Test history, upcoming lists) */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* Recent Quiz Scores */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-500" /> Kết quả kiểm tra gần đây
            </h3>

            {recentScores.length === 0 ? (
              <div className="text-center py-6 px-4 space-y-2">
                <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-300">
                  📊
                </div>
                <p className="text-xs text-slate-500 font-sans leading-relaxed">
                  Bạn chưa thực hiện bài kiểm tra nào. Sau mỗi bài học, hãy click "Bắt đầu Test" để ghi tên tại đây!
                </p>
                <Button 
                  id="btn-start-test-first"
                  variant="secondary" 
                  size="sm" 
                  onClick={() => allLessons[0] && onNavigateLesson(allLessons[0].id)}
                >
                  Học bài đầu ngay
                </Button>
              </div>
            ) : (
              <div className="space-y-3.5">
                {recentScores.map((item, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-slate-50/50 rounded-xl border border-slate-100/60">
                    <div className="space-y-0.5 max-w-[170px]">
                      <h4 className="text-xs font-display font-bold text-slate-800 truncate">{item.title}</h4>
                      <span className="text-[10px] text-slate-400 font-sans">Đã hoàn thành</span>
                    </div>
                    {/* Score badge with conditional colors */}
                    <span className={`text-xs font-display font-black px-2.5 py-1 rounded-lg ${
                      item.score >= 80 
                        ? "bg-green-50 text-green-700 border border-green-200" 
                        : "bg-red-50 text-red-700 border border-red-200"
                    }`}>
                      {item.score}%
                    </span>
                  </div>
                ))}
                
                <p className="text-[10px] text-center text-slate-400 font-sans mt-2">
                  *Điểm số được đồng bộ hóa tức thì từ bài viết quiz của từng bài học.
                </p>
              </div>
            )}
          </div>

          {/* Upcoming lessons list */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-indigo-505" /> Kế hoạch bài học nổi bật
            </h3>

            <div className="space-y-3">
              {[
                { de: "Das deutsche Alphabet", vi: "Bảng chữ cái & Số đếm", level: "A1", desc: "Bài kế của Nhập môn" },
                { de: "Einkaufen im Supermarkt", vi: "Mua đồ trong siêu thị Đức", level: "A2", desc: "Mẫu câu đàm thoại mua thực phẩm" },
                { de: "Meinung äußern", vi: "Bày tỏ quan điểm cá nhân", level: "B1", desc: "Kỹ năng phản xạ tranh luận" }
              ].map((item, i) => (
                <div key={i} className="flex gap-3 items-start border-b border-slate-50 pb-2.5 last:border-0 last:pb-0">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 font-display font-bold text-[10px] flex items-center justify-center shrink-0">
                    {item.level}
                  </div>
                  <div>
                    <h4 className="text-xs font-display font-bold text-slate-800 leading-snug">{item.de}</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-none">{item.vi}</p>
                    <p className="text-[9px] text-green-600 italic mt-1">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
