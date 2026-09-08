import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ExternalLink,
  Loader2,
  Pencil,
  Search,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Button, Input } from "../../components/DesignSystem";
import type {
  Level,
  MeetingRegistrationRow,
  MeetingSessionAdmin,
  MeetingSessionUpsertInput,
} from "../../lib/appTypes";
import {
  capacityStatus,
  MAX_MEETING_CAPACITY,
  type CapacityStatus,
} from "../../lib/meetingCapacity";
import {
  adminDeleteSession,
  adminListRegistrations,
  adminListSessions,
  adminUpsertSession,
} from "../../lib/meetings";
import { showToast } from "../../lib/toast";

type SessionForm = Omit<MeetingSessionUpsertInput, "id">;
type CapacityFilter = "all" | "open" | "full";

const EMPTY_FORM: SessionForm = {
  title: "",
  level: "A1",
  sessionDate: "",
  startTime: "",
  endTime: "",
  meetUrl: "",
  note: "",
};

const LEVELS: Level[] = ["A1", "A2", "B1", "B2"];

const CAPACITY_LABELS: Record<CapacityStatus, string> = {
  open: "CÒN CHỖ",
  almost: "SẮP ĐẦY",
  full: "ĐÃ ĐỦ CHỖ",
};

const CAPACITY_STYLES: Record<CapacityStatus, string> = {
  open: "bg-emerald-50 text-emerald-700 border-emerald-200",
  almost: "bg-amber-50 text-amber-700 border-amber-200",
  full: "bg-rose-50 text-rose-700 border-rose-200",
};

const CAPACITY_BARS: Record<CapacityStatus, string> = {
  open: "bg-emerald-500",
  almost: "bg-amber-500",
  full: "bg-rose-500",
};

const inputClass =
  "w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500";

const localDateString = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatSessionDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

const formatRegistrationDate = (date: string) =>
  new Date(date).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const isMeetUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "meet.google.com";
  } catch {
    return false;
  }
};

export const AdminMeetingSection: React.FC = () => {
  const [sessions, setSessions] = useState<MeetingSessionAdmin[]>([]);
  const [form, setForm] = useState<SessionForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [capacityFilter, setCapacityFilter] = useState<CapacityFilter>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MeetingSessionAdmin | null>(null);
  const [registrationSession, setRegistrationSession] = useState<MeetingSessionAdmin | null>(null);
  const [registrations, setRegistrations] = useState<MeetingRegistrationRow[]>([]);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await adminListSessions());
    } catch {
      showToast("Không tải được danh sách lịch học.", "warning");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stats = useMemo(() => {
    const today = localDateString();
    return {
      upcoming: sessions.filter((session) => session.sessionDate >= today).length,
      registrations: sessions.reduce((sum, session) => sum + session.registrationCount, 0),
      full: sessions.filter(
        (session) => capacityStatus(session.registrationCount) === "full",
      ).length,
    };
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("vi");
    return sessions.filter((session) => {
      const matchesSearch =
        !normalizedSearch ||
        session.title.toLocaleLowerCase("vi").includes(normalizedSearch);
      const status = capacityStatus(session.registrationCount);
      const matchesCapacity =
        capacityFilter === "all" ||
        (capacityFilter === "open" ? status !== "full" : status === "full");
      return matchesSearch && matchesCapacity;
    });
  }, [capacityFilter, search, sessions]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const updateForm = <Key extends keyof SessionForm>(key: Key, value: SessionForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = form.title.trim();
    const meetUrl = form.meetUrl.trim();
    const note = form.note?.trim() || null;

    if (!title || !form.sessionDate || !form.startTime || !form.endTime || !meetUrl) {
      showToast("Vui lòng nhập đầy đủ thông tin bắt buộc.", "warning");
      return;
    }
    if (form.startTime >= form.endTime) {
      showToast("Giờ kết thúc phải muộn hơn giờ bắt đầu.", "warning");
      return;
    }
    if (!isMeetUrl(meetUrl)) {
      showToast("Vui lòng dán link Google Meet hợp lệ.", "warning");
      return;
    }

    setBusy(true);
    try {
      await adminUpsertSession({
        ...form,
        id: editingId ?? undefined,
        title,
        meetUrl,
        note,
      });
      await refresh();
      showToast(editingId ? "Đã cập nhật lịch học." : "Đã tạo lịch học.", "success");
      resetForm();
    } catch {
      showToast(editingId ? "Không cập nhật được lịch học." : "Không tạo được lịch học.", "warning");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (session: MeetingSessionAdmin) => {
    setEditingId(session.id);
    setForm({
      title: session.title,
      level: session.level,
      sessionDate: session.sessionDate,
      startTime: session.startTime.slice(0, 5),
      endTime: session.endTime.slice(0, 5),
      meetUrl: session.meetUrl,
      note: session.note ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openRegistrations = async (session: MeetingSessionAdmin) => {
    setRegistrationSession(session);
    setRegistrations([]);
    setLoadingRegistrations(true);
    try {
      setRegistrations(await adminListRegistrations(session.id));
    } catch {
      showToast("Không tải được danh sách đăng ký.", "warning");
    } finally {
      setLoadingRegistrations(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const deletedId = deleteTarget.id;
    setBusy(true);
    try {
      await adminDeleteSession(deletedId);
      setDeleteTarget(null);
      if (editingId === deletedId) resetForm();
      await refresh();
      showToast("Đã xóa lịch học và các đăng ký liên quan.", "success");
    } catch {
      showToast("Không xóa được lịch học.", "warning");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-display font-black text-slate-900">Lịch hỗ trợ học viên</h1>
        <p className="text-sm text-slate-500 mt-1">
          Tạo buổi học trực tuyến và quản lý tối đa {MAX_MEETING_CAPACITY} học viên mỗi lịch.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { value: stats.upcoming, label: "Lịch sắp diễn ra", Icon: CalendarDays, color: "text-blue-600 bg-blue-50 border-blue-200" },
          { value: stats.registrations, label: "Tổng đăng ký", Icon: Users, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
          { value: stats.full, label: "Lịch đã đủ chỗ", Icon: UserRound, color: "text-rose-600 bg-rose-50 border-rose-200" },
        ].map(({ value, label, Icon, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border mb-3 ${color}`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-display font-black text-slate-900">{value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col xl:flex-row gap-6 items-start">
        <aside className="w-full xl:w-80 shrink-0 bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm">
          <h2 className="text-base font-display font-extrabold text-slate-900 mb-5">
            {editingId ? "Sửa lịch học" : "Tạo lịch học mới"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="meeting-title"
              label="Nội dung buổi học"
              placeholder="VD: Luyện nói giao tiếp A2"
              value={form.title}
              onChange={(event) => updateForm("title", event.target.value)}
              required
            />
            <label className="block">
              <span className="block text-xs font-display font-semibold text-slate-700 mb-1.5">Trình độ</span>
              <select
                value={form.level}
                onChange={(event) => updateForm("level", event.target.value as Level)}
                className={inputClass}
              >
                {LEVELS.map((level) => <option key={level}>{level}</option>)}
              </select>
            </label>
            <Input
              id="meeting-date"
              label="Ngày học"
              type="date"
              value={form.sessionDate}
              onChange={(event) => updateForm("sessionDate", event.target.value)}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                id="meeting-start-time"
                label="Bắt đầu"
                type="time"
                value={form.startTime}
                onChange={(event) => updateForm("startTime", event.target.value)}
                required
              />
              <Input
                id="meeting-end-time"
                label="Kết thúc"
                type="time"
                value={form.endTime}
                onChange={(event) => updateForm("endTime", event.target.value)}
                required
              />
            </div>
            <Input
              id="meeting-url"
              label="Link Google Meet"
              type="url"
              placeholder="https://meet.google.com/..."
              value={form.meetUrl}
              onChange={(event) => updateForm("meetUrl", event.target.value)}
              required
            />
            <label className="block">
              <span className="block text-xs font-display font-semibold text-slate-700 mb-1.5">Ghi chú</span>
              <textarea
                value={form.note ?? ""}
                onChange={(event) => updateForm("note", event.target.value)}
                placeholder="Ghi chú cho học viên (tuỳ chọn)"
                rows={3}
                className={`${inputClass} resize-y`}
              />
            </label>
            <p className="text-xs text-slate-500">
              Giới hạn đăng ký: <strong className="text-slate-700">{MAX_MEETING_CAPACITY} học viên</strong>
            </p>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingId ? "Lưu thay đổi" : "Tạo lịch học"}
            </Button>
            {editingId && (
              <Button type="button" variant="secondary" className="w-full" onClick={resetForm} disabled={busy}>
                Hủy sửa
              </Button>
            )}
          </form>
        </aside>

        <section className="flex-1 min-w-0 w-full">
          <div className="flex items-center gap-3 flex-wrap bg-white rounded-2xl border border-slate-200/60 shadow-sm p-3 mb-4">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="search"
                placeholder="Tìm theo nội dung..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className={`${inputClass} pl-9`}
              />
            </div>
            <select
              value={capacityFilter}
              onChange={(event) => setCapacityFilter(event.target.value as CapacityFilter)}
              className={`${inputClass} w-auto`}
            >
              <option value="all">Tất cả</option>
              <option value="open">Còn chỗ</option>
              <option value="full">Đã đủ chỗ</option>
            </select>
          </div>

          <div className="space-y-3">
            {loading ? (
              <div className="bg-white rounded-2xl border border-slate-200/60 py-12">
                <Loader2 className="w-6 h-6 text-orange-500 animate-spin mx-auto" />
              </div>
            ) : filteredSessions.length === 0 ? (
              <div className="text-center py-12 px-6 text-sm text-slate-400 bg-white border border-dashed border-slate-200 rounded-2xl">
                Không có lịch học nào phù hợp.
              </div>
            ) : (
              filteredSessions.map((session) => {
                const status = capacityStatus(session.registrationCount);
                const percentage = Math.min(
                  100,
                  (session.registrationCount / MAX_MEETING_CAPACITY) * 100,
                );
                return (
                  <article key={session.id} className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          {formatSessionDate(session.sessionDate)}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <h3 className="font-display font-bold text-slate-900">{session.title}</h3>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                            {session.level}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 mt-1">
                          {session.startTime.slice(0, 5)} – {session.endTime.slice(0, 5)}
                        </p>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${CAPACITY_STYLES[status]}`}>
                        {CAPACITY_LABELS[status]}
                      </span>
                    </div>

                    {session.note && <p className="text-xs text-slate-400 italic mt-3">{session.note}</p>}

                    <div className="flex items-center gap-2 mt-4">
                      <span className="text-xs font-mono font-semibold text-slate-600">
                        {session.registrationCount}/{MAX_MEETING_CAPACITY}
                      </span>
                      <div className="w-28 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full ${CAPACITY_BARS[status]}`} style={{ width: `${percentage}%` }} />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-4">
                      <Button type="button" variant="secondary" size="sm" onClick={() => void openRegistrations(session)}>
                        <Users className="w-3.5 h-3.5 mr-1.5" />
                        Danh sách ({session.registrationCount})
                      </Button>
                      <Button type="button" variant="secondary" size="sm" onClick={() => startEdit(session)}>
                        <Pencil className="w-3.5 h-3.5 mr-1.5" />
                        Sửa
                      </Button>
                      <Button type="button" variant="secondary" size="sm" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => setDeleteTarget(session)}>
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                        Xóa
                      </Button>
                      <a
                        href={session.meetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center px-3.5 py-1.5 text-xs rounded-lg font-display font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        Mở link meeting
                      </a>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[100] bg-slate-950/45 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-meeting-title" onMouseDown={(event) => event.target === event.currentTarget && setDeleteTarget(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl">
            <div className="p-5 border-b border-slate-100">
              <h3 id="delete-meeting-title" className="font-display font-extrabold text-slate-900">Xác nhận xóa</h3>
            </div>
            <p className="p-5 text-sm text-slate-600">
              Bạn có chắc muốn xóa lịch “{deleteTarget.title}”? Tất cả đăng ký liên quan cũng sẽ bị xóa.
            </p>
            <div className="flex justify-end gap-2 p-5 border-t border-slate-100">
              <Button type="button" variant="secondary" size="sm" onClick={() => setDeleteTarget(null)} disabled={busy}>Hủy</Button>
              <Button type="button" variant="danger" size="sm" onClick={() => void confirmDelete()} disabled={busy}>
                {busy && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Xóa
              </Button>
            </div>
          </div>
        </div>
      )}

      {registrationSession && (
        <div className="fixed inset-0 z-[100] bg-slate-950/45 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="registrations-title" onMouseDown={(event) => event.target === event.currentTarget && setRegistrationSession(null)}>
          <div className="w-full max-w-lg max-h-[80vh] flex flex-col bg-white rounded-2xl shadow-2xl">
            <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
              <div>
                <h3 id="registrations-title" className="font-display font-extrabold text-slate-900">Danh sách đăng ký</h3>
                <p className="text-xs text-slate-500 mt-1">{registrationSession.title}</p>
              </div>
              <button type="button" onClick={() => setRegistrationSession(null)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Đóng">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              {loadingRegistrations ? (
                <Loader2 className="w-6 h-6 text-orange-500 animate-spin mx-auto my-6" />
              ) : registrations.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-6">Chưa có học viên đăng ký.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {registrations.map((registration) => (
                    <div key={registration.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">
                          {registration.user?.fullName || "Chưa cập nhật tên"}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{registration.user?.email || "Không có email"}</p>
                      </div>
                      <span className="text-[11px] text-slate-400 shrink-0">{formatRegistrationDate(registration.registeredAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end p-5 border-t border-slate-100">
              <Button type="button" variant="secondary" size="sm" onClick={() => setRegistrationSession(null)}>Đóng</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
