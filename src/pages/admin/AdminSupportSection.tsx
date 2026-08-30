import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowLeft, CheckCircle2, Clock, Loader2, Search, Send } from "lucide-react";
import { Button } from "../../components/DesignSystem";
import { TicketImagePicker, TicketMessageImages } from "../../components/TicketImages";
import { showToast } from "../../lib/toast";
import {
  SUPPORT_STATUS_LABELS,
  SUPPORT_TOPIC_LABELS,
  type SupportTicket,
  type SupportTicketMessage,
  type SupportTicketStatus,
  type SupportTicketTopic,
} from "../../lib/appTypes";
import {
  listAllTickets,
  listMessages,
  sendMessage,
  updateTicketStatus,
} from "../../lib/support";
import { computeTicketStats, filterTickets } from "../../lib/supportMappers";
import { uploadTicketImages } from "../../lib/ticketImages";

const PAGE_SIZE = 15;

const STATUS_PILL: Record<SupportTicketStatus, string> = {
  pending: "bg-slate-100 text-slate-500",
  processing: "bg-amber-50 text-amber-600 border border-amber-200",
  resolved: "bg-green-50 text-green-600 border border-green-200",
};

const STATUS_OPTIONS = Object.keys(SUPPORT_STATUS_LABELS) as SupportTicketStatus[];
const TOPIC_OPTIONS = Object.keys(SUPPORT_TOPIC_LABELS) as SupportTicketTopic[];

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("vi-VN");
const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

export const AdminSupportSection: React.FC = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<SupportTicketStatus | "all">("all");
  const [topicFilter, setTopicFilter] = useState<SupportTicketTopic | "all">("all");
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [reply, setReply] = useState("");
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listAllTickets();
      setTickets(rows);
      setActive((prev) => (prev ? rows.find((t) => t.id === prev.id) ?? null : null));
    } catch {
      showToast("Không tải được danh sách ticket.", "warning");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const filtered = useMemo(
    () => filterTickets(tickets, search, statusFilter, topicFilter),
    [tickets, search, statusFilter, topicFilter],
  );

  // Ba thẻ số liệu suy từ chính danh sách đã tải, không query đếm riêng.
  const stats = useMemo(() => computeTicketStats(tickets, Date.now()), [tickets]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const openRequestId = useRef<string | null>(null);

  const openTicket = async (ticket: SupportTicket) => {
    setActive(ticket);
    setReply("");
    setReplyFiles([]);
    setMessages([]);
    openRequestId.current = ticket.id;
    try {
      const rows = await listMessages(ticket.id);
      // Ticket có thể đã bị đổi (người dùng bấm quay lại rồi mở ticket khác)
      // trong lúc request này còn đang chạy — bỏ qua phản hồi lạc nhịp.
      if (openRequestId.current === ticket.id) setMessages(rows);
    } catch {
      if (openRequestId.current === ticket.id) {
        setMessages([]);
        showToast("Không tải được nội dung trao đổi.", "warning");
      }
    }
  };

  const handleStatus = async (status: SupportTicketStatus) => {
    if (!active) return;
    setBusy(true);
    try {
      await updateTicketStatus(active.id, status);
      await refresh();
      showToast(`Ticket ${active.code} chuyển sang ${SUPPORT_STATUS_LABELS[status]}.`, "success");
    } catch {
      showToast("Không đổi được trạng thái.", "warning");
    } finally {
      setBusy(false);
    }
  };

  const handleReply = async () => {
    const body = reply.trim();
    if (!body || !active) return;
    const ticketId = active.id;
    setBusy(true);
    try {
      const imageKeys = await uploadTicketImages(replyFiles);
      await sendMessage(ticketId, body, imageKeys);
      setReply("");
      setReplyFiles([]);
      // Trigger vừa đặt ticket sang resolved — phải tải lại mới thấy đúng.
      const rows = await listMessages(ticketId);
      // Admin có thể đã quay lại danh sách rồi mở ticket khác trong lúc chờ — bỏ nếu vậy.
      if (openRequestId.current === ticketId) setMessages(rows);
      await refresh();
      showToast("Đã gửi phản hồi cho học viên.", "success");
    } catch {
      showToast("Không gửi được phản hồi.", "warning");
    } finally {
      setBusy(false);
    }
  };

  if (active) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => { setActive(null); setReply(""); setReplyFiles([]); }}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-orange-600 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Quay lại danh sách ticket
        </button>

        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
          <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-display font-black text-slate-900">{active.title}</h2>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-1.5 flex-wrap">
                <span className="font-mono text-slate-500">{active.code}</span>
                <span>·</span>
                <span>{SUPPORT_TOPIC_LABELS[active.topic]}</span>
                <span>·</span>
                <span>Tạo lúc {formatTime(active.createdAt)}, {formatDate(active.createdAt)}</span>
              </div>
            </div>
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${STATUS_PILL[active.status]}`}>
              {SUPPORT_STATUS_LABELS[active.status]}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="p-5 lg:border-r border-slate-100 min-h-[380px]">
              <div className="space-y-4">
                {messages.map((m) => (
                  <div key={m.id} className={m.isStaff ? "text-right" : ""}>
                    <p className="text-xs text-slate-400 mb-1">
                      {m.isStaff ? "SelbstDeutsch Support" : active.author?.fullName || active.author?.email || "—"}
                      {" · "}
                      {formatTime(m.createdAt)}
                    </p>
                    <div
                      className={`inline-block text-left max-w-[80%] rounded-2xl px-4 py-2.5 text-sm border ${
                        m.isStaff
                          ? "bg-orange-50 border-orange-200 text-orange-700"
                          : "bg-slate-50 border-slate-200 text-slate-700"
                      }`}
                    >
                      {m.body}
                      <TicketMessageImages imageKeys={m.imageKeys} />
                    </div>
                  </div>
                ))}
                {messages.length === 0 && <p className="text-sm text-slate-400">Chưa có tin nhắn.</p>}
              </div>

              <div className="border-t border-slate-100 pt-4 mt-5">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Nhập phản hồi gửi cho học viên..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none"
                />
                <TicketImagePicker files={replyFiles} onChange={setReplyFiles} disabled={busy} />
                <div className="flex justify-end gap-2 mt-3">
                  <Button variant="secondary" onClick={() => handleStatus("processing")} disabled={busy}>
                    Bắt đầu xử lý
                  </Button>
                  <Button variant="primary" onClick={handleReply} disabled={busy || !reply.trim()}>
                    <Send className="w-4 h-4 mr-1.5" />
                    Gửi phản hồi &amp; hoàn tất
                  </Button>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-5">
              <div>
                <h4 className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-widest mb-2.5">
                  Thông tin học viên
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Họ tên</span>
                    <span className="font-semibold text-slate-700 text-right">{active.author?.fullName || "—"}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Email</span>
                    <span className="font-semibold text-slate-700 text-right">{active.author?.email || "—"}</span>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-widest mb-2.5">
                  Thông tin ticket
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Chủ đề</span>
                    <span className="font-semibold text-slate-700 text-right">{SUPPORT_TOPIC_LABELS[active.topic]}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Ngày tạo</span>
                    <span className="font-semibold text-slate-700 text-right">{formatDate(active.createdAt)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-400">Cập nhật</span>
                    <span className="font-semibold text-slate-700 text-right">{formatDate(active.updatedAt)}</span>
                  </div>
                </div>
              </div>
              <div>
                <h4 className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-widest mb-2.5">
                  Cập nhật trạng thái
                </h4>
                <select
                  value={active.status}
                  onChange={(e) => void handleStatus(e.target.value as SupportTicketStatus)}
                  disabled={busy}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{SUPPORT_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-display font-black text-slate-900">Hỗ trợ ({filtered.length})</h1>
        <div className="relative w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm kiếm..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center border mb-3 text-amber-600 bg-amber-50 border-amber-200">
            <Clock className="w-5 h-5" />
          </div>
          <p className="text-2xl font-display font-black text-slate-900">{stats.pending}</p>
          <p className="text-xs text-slate-500 mt-0.5">Ticket đang chờ</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center border mb-3 text-blue-600 bg-blue-50 border-blue-200">
            <Activity className="w-5 h-5" />
          </div>
          <p className="text-2xl font-display font-black text-slate-900">{stats.processing}</p>
          <p className="text-xs text-slate-500 mt-0.5">Đang xử lý</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center border mb-3 text-green-600 bg-green-50 border-green-200">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <p className="text-2xl font-display font-black text-slate-900">{stats.resolvedThisWeek}</p>
          <p className="text-xs text-slate-500 mt-0.5">Đã xử lý trong tuần</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap bg-white rounded-2xl border border-slate-200/60 shadow-sm p-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as SupportTicketStatus | "all"); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
        >
          <option value="all">Tất cả trạng thái</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{SUPPORT_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select
          value={topicFilter}
          onChange={(e) => { setTopicFilter(e.target.value as SupportTicketTopic | "all"); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
        >
          <option value="all">Tất cả chủ đề</option>
          {TOPIC_OPTIONS.map((t) => (
            <option key={t} value={t}>{SUPPORT_TOPIC_LABELS[t]}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Mã</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Tiêu đề</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Học viên</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Chủ đề</th>
              <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase">Trạng thái</th>
              <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase">Ngày tạo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center">
                  <Loader2 className="w-6 h-6 text-orange-500 animate-spin mx-auto" />
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">Không có ticket nào.</td>
              </tr>
            ) : (
              paginated.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{t.code}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">
                    <button
                      onClick={() => void openTicket(t)}
                      className="hover:text-orange-600 hover:underline cursor-pointer text-left"
                    >
                      {t.title}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{t.author?.fullName || t.author?.email || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{SUPPORT_TOPIC_LABELS[t.topic]}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${STATUS_PILL[t.status]}`}>
                      {SUPPORT_STATUS_LABELS[t.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400 text-xs">{formatDate(t.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Trước
          </button>
          <span className="text-xs text-slate-500">Trang {safePage}/{totalPages}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Sau
          </button>
        </div>
      )}
    </div>
  );
};
