import React, { useState, useEffect } from "react";
import { Loader2, Search, Plus, Pencil, Trash2, X, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  xp: number;
  streak: number;
  role: string;
  unlockedLevels: string[];
}

interface CreateForm { email: string; password: string; full_name: string; role: string; }
interface EditForm { full_name: string; role: string; }

const EMPTY_CREATE: CreateForm = { email: "", password: "", full_name: "", role: "user" };

export const AdminUsersSection: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [creating, setCreating] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ full_name: "", role: "user" });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = () => {
    supabase
      .from("profiles")
      .select("id, email, full_name, created_at, role, unlocked_levels, user_stats(xp, streak)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setUsers(
          (data ?? []).map((p) => {
            const stats = p.user_stats as unknown as { xp: number; streak: number } | null;
            return {
              id: p.id,
              email: p.email ?? "",
              full_name: p.full_name,
              created_at: p.created_at,
              xp: stats?.xp ?? 0,
              streak: stats?.streak ?? 0,
              role: (p as unknown as { role?: string }).role ?? "user",
              unlockedLevels: (p as unknown as { unlocked_levels?: string[] }).unlocked_levels ?? [],
            };
          }),
        );
        setLoading(false);
      });
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleCreate = async () => {
    if (!createForm.email || !createForm.password) {
      showToast("Email và mật khẩu là bắt buộc.", "warning");
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: createForm,
    });
    setCreating(false);

    if (error || data?.error) {
      showToast("Tạo thất bại: " + (data?.error ?? error?.message), "warning");
    } else {
      showToast("Đã tạo người dùng thành công.", "success");
      setShowCreate(false);
      setCreateForm(EMPTY_CREATE);
      fetchUsers();
    }
  };

  const handleSaveEdit = async () => {
    if (!editUser) return;
    setSaving(true);

    // Update full_name + role column in profiles
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ full_name: editForm.full_name, role: editForm.role })
      .eq("id", editUser.id);

    // Also sync role to auth.app_metadata via Edge Function
    let roleError: string | null = null;
    if (editForm.role !== editUser.role) {
      const { data, error } = await supabase.functions.invoke("set-admin-role", {
        body: { user_id: editUser.id, role: editForm.role },
      });
      if (error || data?.error) roleError = data?.error ?? error?.message;
    }

    setSaving(false);

    if (profileError || roleError) {
      showToast("Lưu thất bại: " + (profileError?.message ?? roleError), "warning");
    } else {
      showToast("Đã cập nhật người dùng.", "success");
      setEditUser(null);
      fetchUsers();
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { user_id: deleteTarget.id },
    });
    setDeleting(false);

    if (error || data?.error) {
      showToast("Xóa thất bại: " + (data?.error ?? error?.message), "warning");
    } else {
      showToast("Đã xóa người dùng.", "success");
      setDeleteTarget(null);
      fetchUsers();
    }
  };

  const handleToggleLevel = async (user: AdminUser, level: string) => {
    const previousLevels = user.unlockedLevels;
    const newLevels = previousLevels.includes(level)
      ? previousLevels.filter((l) => l !== level)
      : [...previousLevels, level];

    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, unlockedLevels: newLevels } : u)));

    const { error } = await supabase.from("profiles").update({ unlocked_levels: newLevels }).eq("id", user.id);

    if (error) {
      showToast("Cập nhật cấp độ thất bại: " + error.message, "warning");
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, unlockedLevels: previousLevels } : u)));
    }
  };

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
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-display font-black text-slate-900">Người dùng ({users.length})</h1>
        <div className="flex items-center gap-2">
          <div className="relative w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" /> Thêm user
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Người dùng</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Email</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase">Role</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase">Cấp độ mở</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase">XP</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase">Streak</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase">Ngày tạo</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-4 py-3 font-medium text-slate-800">
                  {u.full_name || <span className="text-slate-400 italic">Chưa đặt tên</span>}
                </td>
                <td className="px-4 py-3 text-slate-500">{u.email}</td>
                <td className="px-4 py-3 text-center">
                  {u.role === "admin" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                      <ShieldCheck className="w-3 h-3" /> Admin
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">User</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    {(["A1", "A2", "B1", "B2"] as const).map((level) => (
                      <label key={level} className="flex items-center gap-1 text-[10px] font-bold text-slate-500 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={u.unlockedLevels.includes(level)}
                          onChange={() => handleToggleLevel(u, level)}
                          className="w-3.5 h-3.5 accent-orange-600 cursor-pointer"
                        />
                        {level}
                      </label>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-bold text-blue-600">{u.xp}</td>
                <td className="px-4 py-3 text-right font-bold text-orange-600">{u.streak} 🔥</td>
                <td className="px-4 py-3 text-right text-slate-400 text-xs">{new Date(u.created_at).toLocaleDateString("vi-VN")}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditUser(u); setEditForm({ full_name: u.full_name ?? "", role: u.role }); }}
                      className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                      title="Chỉnh sửa"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(u)}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                      title="Xóa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400">Không tìm thấy người dùng.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create user modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-slate-900">Thêm người dùng mới</h3>
              <button onClick={() => setShowCreate(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
            </div>

            {[
              { label: "Họ và tên", key: "full_name" as const, type: "text", placeholder: "Nguyễn Văn A" },
              { label: "Email *", key: "email" as const, type: "email", placeholder: "user@example.com" },
              { label: "Mật khẩu *", key: "password" as const, type: "password", placeholder: "Tối thiểu 6 ký tự" },
            ].map(({ label, key, type, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-bold text-slate-600 mb-1">{label}</label>
                <input
                  type={type}
                  value={createForm[key]}
                  onChange={e => setCreateForm(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>
            ))}

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Role</label>
              <select
                value={createForm.role}
                onChange={e => setCreateForm(prev => ({ ...prev, role: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setShowCreate(false)}>Hủy</Button>
              <Button variant="primary" className="flex-1" onClick={handleCreate}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
                Tạo tài khoản
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit user modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-slate-900">Chỉnh sửa người dùng</h3>
              <button onClick={() => setEditUser(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-slate-400">{editUser.email}</p>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Họ và tên</label>
              <input
                type="text"
                value={editForm.full_name}
                onChange={e => setEditForm(prev => ({ ...prev, full_name: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Role</label>
              <select
                value={editForm.role}
                onChange={e => setEditForm(prev => ({ ...prev, role: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setEditUser(null)}>Hủy</Button>
              <Button variant="primary" className="flex-1" onClick={handleSaveEdit}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Lưu thay đổi
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-900">Xóa người dùng?</h3>
                <p className="text-xs text-slate-500 mt-0.5">Hành động này không thể hoàn tác.</p>
              </div>
            </div>
            <div className="bg-red-50 rounded-xl px-4 py-3 text-sm">
              <p className="font-medium text-red-700">{deleteTarget.full_name || "Chưa đặt tên"}</p>
              <p className="text-red-500 text-xs mt-0.5">{deleteTarget.email}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>Hủy</Button>
              <button
                onClick={handleDelete}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-display font-bold rounded-xl transition-colors"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
