import React, { useState, useEffect, useMemo } from "react";
import { Loader2, Search, Plus, Pencil, Trash2, X, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";
import {
  addCalendarDaysIso,
  isExpiredBySubscription,
  isTrialBySubscription,
  subscriptionDaysRemaining,
} from "../../lib/isTrialBySubscription";
import {
  computeCompletedLessons,
  computeLessonStatuses,
  buildScoresByLesson,
  applicableCategories,
  LessonProgressRow,
} from "../../lib/completion";
import { filterUsers, type UserFilterCriteria } from "../../lib/adminUserFilter";

interface ProgressLesson {
  id: string;
  title: string;
  titleVi: string;
  moduleTitle: string;
  level: string;
  hasNguphapQuestions: boolean;
  hasNgheQuestions: boolean;
  hasDocQuestions: boolean;
}

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  xp: number;
  streak: number;
  role: string;
  unlockedLevels: string[];
  subscriptionEndDate: string | null;
}

interface CreateForm { email: string; password: string; full_name: string; role: string; }
interface EditForm { full_name: string; role: string; subscription_end_date: string; }

const EMPTY_CREATE: CreateForm = { email: "", password: "", full_name: "", role: "trial" };
const PAGE_SIZE = 15;
const PLANNED_LEVEL_DAYS: Record<string, number> = { A1: 90, A2: 90, B1: 90, B2: 90 };

export const AdminUsersSection: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserFilterCriteria["role"]>("all");
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [orderedLessons, setOrderedLessons] = useState<ProgressLesson[]>([]);
  const [allProgress, setAllProgress] = useState<(LessonProgressRow & { user_id: string })[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [creating, setCreating] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ full_name: "", role: "trial", subscription_end_date: "" });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [progressUser, setProgressUser] = useState<AdminUser | null>(null);

  const fetchUsers = () => {
    supabase
      .from("profiles")
      .select("id, email, full_name, created_at, role, unlocked_levels, subscription_end_date, user_stats(xp, streak)")
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
              subscriptionEndDate: (p as unknown as { subscription_end_date?: string | null }).subscription_end_date ?? null,
            };
          }),
        );
        setLoading(false);
      });
  };

  useEffect(() => { fetchUsers(); }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter, levelFilter, dateFrom, dateTo]);

  useEffect(() => {
    Promise.all([
      supabase
        .from("modules")
        .select(`
          id, order_index, title_vi, level,
          lessons (id, title, title_vi, order_index, status)
        `)
        .order("order_index")
        .order("order_index", { referencedTable: "lessons" }),
      // grammar_exercises_public phủ nguphap/nghe (Nghe đã gộp vào
      // grammar_exercises từ Phase 4). Đọc từ Phase 6 dùng bảng riêng
      // (reading_question_groups) nên cần query thứ hai.
      supabase.from("grammar_exercises_public").select("lesson_id, category"),
      supabase.from("reading_question_groups_public").select("lesson_id"),
    ]).then(([modulesRes, exercisesRes, readingRes]) => {
      // Nếu query cờ câu hỏi lỗi, "không có cờ" sẽ bị hiểu nhầm là "mục
      // không có câu hỏi" -> mọi học viên hiện "Đã xong" sai trên bảng admin.
      // Không có error state riêng cho phần này, nên để orderedLessons rỗng
      // (bảng tiến độ trống) còn hơn build từ dữ liệu sai lệch.
      if (modulesRes.error || exercisesRes.error || readingRes.error) {
        setOrderedLessons([]);
        return;
      }
      const quizCategoriesByLesson = new Map<string, Set<string>>();
      for (const row of (exercisesRes.data ?? []) as { lesson_id: string; category: string }[]) {
        const categories = quizCategoriesByLesson.get(row.lesson_id) ?? new Set<string>();
        categories.add(row.category);
        quizCategoriesByLesson.set(row.lesson_id, categories);
      }
      for (const row of (readingRes.data ?? []) as { lesson_id: string }[]) {
        const categories = quizCategoriesByLesson.get(row.lesson_id) ?? new Set<string>();
        categories.add("doc");
        quizCategoriesByLesson.set(row.lesson_id, categories);
      }
      const nguphapLessonIds = new Set(
        [...quizCategoriesByLesson.entries()].filter(([, cats]) => cats.has("nguphap")).map(([id]) => id),
      );
      const flat: ProgressLesson[] = (modulesRes.data ?? []).flatMap((m) =>
        (m.lessons ?? [])
          .filter((l: { status: string }) => l.status === "published")
          .map((l: { id: string; title: string; title_vi: string }) => ({
            id: l.id,
            title: l.title,
            titleVi: l.title_vi,
            moduleTitle: m.title_vi,
            level: m.level,
            hasNguphapQuestions: nguphapLessonIds.has(l.id),
            hasNgheQuestions: quizCategoriesByLesson.get(l.id)?.has("nghe") ?? false,
            hasDocQuestions: quizCategoriesByLesson.get(l.id)?.has("doc") ?? false,
          })),
      );
      setOrderedLessons(flat);
    });

    supabase
      .from("lesson_progress")
      .select("user_id, lesson_id, category, quiz_score, completed_at")
      .then(({ data }) => {
        setAllProgress((data ?? []) as (LessonProgressRow & { user_id: string })[]);
      });
  }, []);

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
    if (editForm.role === "user" && !editForm.subscription_end_date) {
      showToast("Vui lòng điền ngày hết hạn gói khi chuyển sang User.", "warning");
      return;
    }
    setSaving(true);

    const subscriptionEndDate = editForm.role === "trial" ? null : editForm.subscription_end_date || null;
    const becomingTrial = editForm.role === "trial";
    const profileUpdate: {
      full_name: string;
      role: string;
      subscription_end_date: string | null;
      unlocked_levels?: string[];
    } = {
      full_name: editForm.full_name,
      role: editForm.role,
      subscription_end_date: subscriptionEndDate,
    };
    if (becomingTrial) {
      profileUpdate.role = "trial";
      profileUpdate.subscription_end_date = null;
      profileUpdate.unlocked_levels = [];
    }

    // Update full_name + role column in profiles
    const { error: profileError } = await supabase
      .from("profiles")
      .update(profileUpdate)
      .eq("id", editUser.id);

    // Also sync role to auth.app_metadata via Edge Function
    let roleError: string | null = null;
    if (profileUpdate.role !== editUser.role) {
      const { data, error } = await supabase.functions.invoke("set-admin-role", {
        body: { user_id: editUser.id, role: profileUpdate.role },
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
    const previousEnd = user.subscriptionEndDate;
    const previousRole = user.role;
    const wasTrial = isTrialBySubscription(user.subscriptionEndDate);
    const isUnlocking = !previousLevels.includes(level);

    if (wasTrial && !isUnlocking) return;

    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    let newLevels: string[];
    let newEnd: string | null = previousEnd;
    let newRole = previousRole;

    if (wasTrial && isUnlocking) {
      newLevels = [level];
      newEnd = addCalendarDaysIso(todayIso, 90);
      if (previousRole === "trial") newRole = "user";
    } else {
      newLevels = isUnlocking
        ? [...previousLevels, level]
        : previousLevels.filter((l) => l !== level);
    }

    setUsers((prev) =>
      prev.map((u) =>
        u.id === user.id
          ? { ...u, unlockedLevels: newLevels, subscriptionEndDate: newEnd, role: newRole }
          : u,
      ),
    );

    const { error } = await supabase
      .from("profiles")
      .update({
        unlocked_levels: newLevels,
        ...(wasTrial && isUnlocking
          ? { subscription_end_date: newEnd, role: newRole }
          : {}),
      })
      .eq("id", user.id);

    if (error) {
      showToast("Cập nhật cấp độ thất bại: " + error.message, "warning");
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, unlockedLevels: previousLevels, subscriptionEndDate: previousEnd, role: previousRole }
            : u,
        ),
      );
      return;
    }

    if (wasTrial && isUnlocking && previousRole === "trial") {
      const { data, error: roleErr } = await supabase.functions.invoke("set-admin-role", {
        body: { user_id: user.id, role: "user" },
      });
      if (roleErr || data?.error) {
        showToast("Đã mở cấp nhưng đồng bộ role thất bại: " + (data?.error ?? roleErr?.message), "warning");
      }
    }

    if (!isUnlocking) return;

    const plannedDays = PLANNED_LEVEL_DAYS[level] ?? 90;
    const startedAt = new Date().toISOString().slice(0, 10);
    const plannedCompletionDate = new Date(Date.now() + plannedDays * 86400000).toISOString().slice(0, 10);
    // ignoreDuplicates: bật/tắt/bật lại level không reset started_at đã có.
    const { error: enrollError } = await supabase
      .from("level_enrollments")
      .upsert(
        { user_id: user.id, level, started_at: startedAt, planned_completion_date: plannedCompletionDate },
        { onConflict: "user_id,level", ignoreDuplicates: true },
      );
    if (enrollError) {
      showToast("Không tạo được mốc thời gian cho cấp độ: " + enrollError.message, "warning");
    }
  };

  const handleToggleTrial = async (user: AdminUser) => {
    if (user.role === "admin") return;
    const currentlyTrial = isTrialBySubscription(user.subscriptionEndDate);
    if (currentlyTrial) return;

    const previousLevels = user.unlockedLevels;
    const previousEnd = user.subscriptionEndDate;
    const previousRole = user.role;

    setUsers((prev) =>
      prev.map((u) =>
        u.id === user.id
          ? { ...u, unlockedLevels: [], subscriptionEndDate: null, role: "trial" }
          : u,
      ),
    );

    const { error } = await supabase
      .from("profiles")
      .update({ unlocked_levels: [], subscription_end_date: null, role: "trial" })
      .eq("id", user.id);

    if (error) {
      showToast("Chuyển Trial thất bại: " + error.message, "warning");
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, unlockedLevels: previousLevels, subscriptionEndDate: previousEnd, role: previousRole }
            : u,
        ),
      );
      return;
    }

    const { data, error: roleErr } = await supabase.functions.invoke("set-admin-role", {
      body: { user_id: user.id, role: "trial" },
    });
    if (roleErr || data?.error) {
      showToast("Đã clear cấp nhưng đồng bộ role thất bại: " + (data?.error ?? roleErr?.message), "warning");
    } else {
      showToast("Đã chuyển về Trial. Tiến trình học vẫn được giữ.", "success");
    }
  };

  const progressByUser = useMemo(() => {
    const map: Record<string, LessonProgressRow[]> = {};
    for (const row of allProgress) {
      (map[row.user_id] ??= []).push(row);
    }
    return map;
  }, [allProgress]);

  const filtered = filterUsers(users, {
    search,
    role: roleFilter,
    levels: levelFilter,
    dateFrom,
    dateTo,
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap bg-white rounded-2xl border border-slate-200/60 shadow-sm p-3">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as UserFilterCriteria["role"])}
          className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
        >
          <option value="all">Tất cả role</option>
          <option value="trial">Trial</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>

        <div className="flex items-center gap-1.5">
          {(["A1", "A2", "B1", "B2"] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setLevelFilter((prev) => {
                const next = new Set(prev);
                if (next.has(level)) next.delete(level);
                else next.add(level);
                return next;
              })}
              className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                levelFilter.has(level)
                  ? "bg-orange-50 border-orange-300 text-orange-700"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {level}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span>Từ</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
          <span>đến</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
        </div>

        {(roleFilter !== "all" || levelFilter.size > 0 || dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setRoleFilter("all");
              setLevelFilter(new Set());
              setDateFrom("");
              setDateTo("");
            }}
            className="text-xs font-bold text-slate-400 hover:text-slate-600 underline"
          >
            Xoá bộ lọc
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">ID</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Người dùng</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Email</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase">Role</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase">Cấp độ mở</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase">Còn lại</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase">Ngày tạo</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {paginated.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50/50 transition-colors group">
                <td className="px-4 py-3 font-mono text-xs text-slate-400" title={u.id}>{u.id.slice(0, 8)}</td>
                <td className="px-4 py-3 font-medium text-slate-800">
                  <button
                    onClick={() => setProgressUser(u)}
                    className="hover:text-orange-600 hover:underline cursor-pointer text-left"
                  >
                    {u.full_name || <span className="text-slate-400 italic">Chưa đặt tên</span>}
                  </button>
                </td>
                <td className="px-4 py-3 text-slate-500">{u.email}</td>
                <td className="px-4 py-3 text-center">
                  {u.role === "admin" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                      <ShieldCheck className="w-3 h-3" /> Admin
                    </span>
                  ) : u.role === "trial" ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Trial</span>
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
                    <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isTrialBySubscription(u.subscriptionEndDate)}
                        disabled={u.role === "admin"}
                        onChange={() => handleToggleTrial(u)}
                        className={`w-3.5 h-3.5 cursor-pointer ${
                          isTrialBySubscription(u.subscriptionEndDate) ? "accent-red-600" : "accent-orange-600"
                        }`}
                        title="Bật Trial: xoá cấp độ và ngày hết hạn. Tiến trình học được giữ."
                      />
                      <span className={isTrialBySubscription(u.subscriptionEndDate) ? "text-red-600" : undefined}>
                        Trial
                      </span>
                    </label>
                  </div>
                </td>
                <td className="px-4 py-3 text-center text-xs">
                  {isTrialBySubscription(u.subscriptionEndDate) ? (
                    <span className="text-slate-400">—</span>
                  ) : isExpiredBySubscription(u.subscriptionEndDate) ? (
                    <span className="font-bold text-red-600">Hết hạn</span>
                  ) : (
                    <span className="text-slate-600">
                      {subscriptionDaysRemaining(u.subscriptionEndDate)} ngày
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-slate-400 text-xs">{new Date(u.created_at).toLocaleDateString("vi-VN")}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditUser(u); setEditForm({
                        full_name: u.full_name ?? "",
                        role: u.role,
                        subscription_end_date: u.subscriptionEndDate ?? "",
                      }); }}
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

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Trước
          </button>
          <span className="text-xs text-slate-500">Trang {safePage}/{totalPages}</span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Sau
          </button>
        </div>
      )}

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
                <option value="trial">Trial</option>
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
                <option value="trial">Trial</option>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            {editForm.role === "user" && (
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Ngày hết hạn gói</label>
                <input
                  type="date"
                  value={editForm.subscription_end_date}
                  onChange={e => setEditForm(prev => ({ ...prev, subscription_end_date: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>
            )}

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

      {/* Per-user progress detail modal */}
      {progressUser && (() => {
        const unlockedLessons = orderedLessons.filter((l) => progressUser.unlockedLevels.includes(l.level));
        const userProgress = progressByUser[progressUser.id] ?? [];
        const completed = computeCompletedLessons(unlockedLessons, userProgress);
        const statuses = computeLessonStatuses(unlockedLessons, completed);
        const scoresByLesson = buildScoresByLesson(userProgress);
        const statusLabel: Record<string, string> = { completed: "Hoàn thành", current: "Đang học", locked: "Chưa học" };
        const statusColor: Record<string, string> = {
          completed: "bg-green-50 text-green-700 border-green-200",
          current: "bg-orange-50 text-orange-700 border-orange-200",
          locked: "bg-slate-100 text-slate-500 border-slate-200",
        };

        const scoreCell = (lessonId: string, category: "nguphap" | "nghe" | "doc", applicable: boolean) => {
          if (!applicable) return <span className="text-slate-300">—</span>;
          const score = scoresByLesson[lessonId]?.[category];
          if (score === undefined) return <span className="text-slate-400">Chưa làm</span>;
          return (
            <span className={score >= 80 ? "text-green-600 font-bold" : "text-red-500 font-bold"}>{score}%</span>
          );
        };

        return (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-slate-900">
                    Tiến độ học tập — {progressUser.full_name || progressUser.email}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {completed.length}/{unlockedLessons.length} bài hoàn thành · {progressUser.xp} XP · {progressUser.streak} 🔥 streak
                  </p>
                </div>
                <button onClick={() => setProgressUser(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {unlockedLessons.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Người dùng chưa mở khóa cấp độ nào.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 sticky top-0">
                      <th className="text-left px-3 py-2 font-bold text-slate-500 uppercase">Bài học</th>
                      <th className="text-center px-3 py-2 font-bold text-slate-500 uppercase">Trạng thái</th>
                      <th className="text-center px-3 py-2 font-bold text-slate-500 uppercase">Ngữ pháp</th>
                      <th className="text-center px-3 py-2 font-bold text-slate-500 uppercase">Nghe</th>
                      <th className="text-center px-3 py-2 font-bold text-slate-500 uppercase">Đọc</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {unlockedLessons.map((l) => {
                      const categories = applicableCategories(l);
                      const hasNguphap = categories.includes("nguphap");
                      const hasNghe = categories.includes("nghe");
                      const hasDoc = categories.includes("doc");
                      return (
                        <tr key={l.id}>
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-800">{l.titleVi}</p>
                            <p className="text-[10px] text-slate-400">{l.level} · {l.title}</p>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusColor[statuses[l.id]]}`}>
                              {statusLabel[statuses[l.id]]}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">{scoreCell(l.id, "nguphap", hasNguphap)}</td>
                          <td className="px-3 py-2 text-center">{scoreCell(l.id, "nghe", hasNghe)}</td>
                          <td className="px-3 py-2 text-center">{scoreCell(l.id, "doc", hasDoc)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );
      })()}

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
