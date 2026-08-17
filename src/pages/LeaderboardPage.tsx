import React, { useState, useEffect } from "react";
import { Loader2, Trophy, Medal } from "lucide-react";
import { supabase } from "../lib/supabase";

interface LeaderboardEntry {
  rank: number;
  user_id: string;
  full_name: string;
  xp: number;
}

interface LeaderboardPageProps {
  currentUserId: string;
}

export const LeaderboardPage: React.FC<LeaderboardPageProps> = ({ currentUserId }) => {
  const [tab, setTab] = useState<"global" | "weekly">("global");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    supabase.functions.invoke(`leaderboard?type=${tab}`, { method: "GET" }).then(({ data }) => {
      setEntries(data?.leaderboard ?? []);
      setLoading(false);
    });
  }, [tab]);

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-slate-400" />;
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />;
    return <span className="w-5 text-center text-xs font-bold text-slate-400">{rank}</span>;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-display font-black text-slate-900">Bảng xếp hạng</h1>
        <p className="text-sm text-slate-500 mt-1">Top học viên SelbstDeutsch theo điểm XP</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {(["global", "weekly"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-display font-bold rounded-lg transition ${
              tab === t
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "global" ? "Toàn thời gian" : "Tuần này"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-48">
          <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-display font-bold">Chưa có dữ liệu</p>
          <p className="text-sm mt-1">Hãy hoàn thành bài học để xuất hiện ở đây!</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-50">
            {entries.map((entry) => {
              const isMe = entry.user_id === currentUserId;
              return (
                <div
                  key={entry.user_id}
                  className={`flex items-center gap-4 px-5 py-3.5 transition-colors ${
                    isMe ? "bg-orange-50 border-l-4 border-orange-500" : "hover:bg-slate-50/50"
                  }`}
                >
                  <div className="w-6 flex items-center justify-center shrink-0">
                    {rankIcon(entry.rank)}
                  </div>

                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center font-display font-bold text-sm shrink-0 ${
                      isMe ? "bg-orange-600 text-white" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {(entry.full_name || "?").charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-display font-bold truncate ${isMe ? "text-orange-800" : "text-slate-800"}`}>
                      {entry.full_name || "Ẩn danh"}
                      {isMe && <span className="ml-2 text-[10px] font-sans font-normal bg-orange-200 text-orange-700 px-1.5 py-0.5 rounded-full">Bạn</span>}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className={`text-sm font-display font-black ${entry.rank <= 3 ? "text-orange-600" : "text-slate-700"}`}>
                      {entry.xp.toLocaleString()} XP
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
