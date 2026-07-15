import React, { useState, useEffect } from "react";
import { Users, BookOpen, Activity, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";

interface AdminStats {
  totalUsers: number;
  activeUsers7d: number;
  completionsToday: number;
}

export const AdminDashboardSection: React.FC = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase
        .from("user_stats")
        .select("user_id", { count: "exact", head: true })
        .gte("last_activity_date", sevenDaysAgo.split("T")[0]),
      supabase
        .from("lesson_progress")
        .select("lesson_id", { count: "exact", head: true })
        .eq("category", "nguphap")
        .gte("completed_at", today),
    ]).then(([usersRes, activeRes, completionsRes]) => {
      setStats({
        totalUsers: usersRes.count ?? 0,
        activeUsers7d: activeRes.count ?? 0,
        completionsToday: completionsRes.count ?? 0,
      });
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-48">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

  const cards = [
    { label: "Tổng người dùng", value: stats?.totalUsers ?? 0, Icon: Users, color: "text-blue-600 bg-blue-50 border-blue-200" },
    { label: "User active (7 ngày)", value: stats?.activeUsers7d ?? 0, Icon: Activity, color: "text-green-600 bg-green-50 border-green-200" },
    { label: "Bài hoàn thành hôm nay", value: stats?.completionsToday ?? 0, Icon: BookOpen, color: "text-orange-600 bg-orange-50 border-orange-200" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-display font-black text-slate-900">Tổng quan hệ thống</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map(({ label, value, Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border mb-3 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-display font-black text-slate-900">{value.toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
