import React, { useState, useEffect } from "react";
import { Loader2, Search } from "lucide-react";
import { supabase } from "../../lib/supabase";

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  xp: number;
  streak: number;
}

export const AdminUsersSection: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, email, full_name, created_at, user_stats(xp, streak)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setUsers(
          (data ?? []).map((p) => {
            const stats = (p.user_stats as unknown as { xp: number; streak: number } | null);
            return {
              id: p.id,
              email: p.email ?? "",
              full_name: p.full_name,
              created_at: p.created_at,
              xp: stats?.xp ?? 0,
              streak: stats?.streak ?? 0,
            };
          }),
        );
        setLoading(false);
      });
  }, []);

  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.full_name ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-48">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-display font-black text-slate-900">Người dùng ({users.length})</h1>
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm kiếm..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-display font-bold text-slate-500 uppercase tracking-wider">Người dùng</th>
              <th className="text-left px-4 py-3 text-xs font-display font-bold text-slate-500 uppercase tracking-wider">Email</th>
              <th className="text-right px-4 py-3 text-xs font-display font-bold text-slate-500 uppercase tracking-wider">XP</th>
              <th className="text-right px-4 py-3 text-xs font-display font-bold text-slate-500 uppercase tracking-wider">Streak</th>
              <th className="text-right px-4 py-3 text-xs font-display font-bold text-slate-500 uppercase tracking-wider">Ngày tạo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-800">
                  {u.full_name || <span className="text-slate-400 italic">Chưa đặt tên</span>}
                </td>
                <td className="px-4 py-3 text-slate-500">{u.email}</td>
                <td className="px-4 py-3 text-right font-display font-bold text-blue-600">{u.xp}</td>
                <td className="px-4 py-3 text-right font-display font-bold text-orange-600">{u.streak} 🔥</td>
                <td className="px-4 py-3 text-right text-slate-400">
                  {new Date(u.created_at).toLocaleDateString("vi-VN")}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">Không tìm thấy người dùng.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
