import React, { useCallback, useEffect, useRef, useState } from "react";
import { PostgrestError } from "@supabase/supabase-js";
import { Button } from "../components/DesignSystem";
import { Skeleton } from "../components/Skeleton";
import { showToast } from "../lib/toast";
import {
  SUPPORT_STATUS_LABELS,
  SUPPORT_TOPIC_LABELS,
  type SupportTicket,
  type SupportTicketMessage,
  type SupportTicketStatus,
  type SupportTicketTopic,
} from "../lib/appTypes";
import {
  createTicket,
  listMessages,
  listMyTickets,
  sendMessage,
} from "../lib/support";

const STATUS_BADGE: Record<SupportTicketStatus, string> = {
  pending: "bg-slate-100 text-slate-600",
  processing: "bg-amber-50 text-amber-700",
  resolved: "bg-green-50 text-green-700",
};

interface CreateTicketModalProps {
  sending: boolean;
  onClose: () => void;
  onSubmit: (title: string, topic: SupportTicketTopic, body: string) => Promise<void>;
}

const CreateTicketModal: React.FC<CreateTicketModalProps> = ({ sending, onClose, onSubmit }) => {
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState<SupportTicketTopic | "">("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<{ title?: string; topic?: string; body?: string }>({});

  const handleSubmit = () => {
    const nextErrors: { title?: string; topic?: string; body?: string } = {};
    if (!title.trim()) nextErrors.title = "Vui lòng nhập tiêu đề.";
    if (!topic) nextErrors.topic = "Vui lòng chọn chủ đề cần hỗ trợ.";
    if (!body.trim()) nextErrors.body = "Vui lòng mô tả chi tiết vấn đề.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    void onSubmit(title.trim(), topic as SupportTicketTopic, body.trim());
  };

  return (
    <div className="fixed inset-0 bg-slate-900/45 flex items-center justify-center p-5 z-[80]">
      <div className="w-full max-w-[600px] bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-display text-lg font-extrabold text-slate-900 tracking-tight">Tạo ticket hỗ trợ</h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center"
          >
            ✕
          </button>
        </div>
        <div className="p-5 flex flex-col gap-3.5">
          <div>
            <label htmlFor="support-title" className="block text-xs font-display font-bold text-slate-700 mb-1.5">
              Tiêu đề <span className="text-red-600">*</span>
            </label>
            <input
              id="support-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ví dụ: Không mở được bài nghe Video 6"
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-slate-50 focus:bg-white focus:border-red-300 focus:ring-2 focus:ring-red-50"
            />
            {errors.title && <div className="text-red-600 text-xs mt-1">{errors.title}</div>}
          </div>
          <div>
            <label htmlFor="support-topic" className="block text-xs font-display font-bold text-slate-700 mb-1.5">
              Chủ đề cần hỗ trợ <span className="text-red-600">*</span>
            </label>
            <select
              id="support-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value as SupportTicketTopic | "")}
              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-slate-50 focus:bg-white focus:border-red-300 focus:ring-2 focus:ring-red-50"
            >
              <option value="">Chọn chủ đề</option>
              {Object.entries(SUPPORT_TOPIC_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            {errors.topic && <div className="text-red-600 text-xs mt-1">{errors.topic}</div>}
          </div>
          <div>
            <label htmlFor="support-body" className="block text-xs font-display font-bold text-slate-700 mb-1.5">
              Mô tả chi tiết <span className="text-red-600">*</span>
            </label>
            <textarea
              id="support-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Mô tả vấn đề bạn đang gặp, bài học liên quan và thao tác đã thử..."
              className="w-full min-h-[120px] border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-slate-50 focus:bg-white focus:border-red-300 focus:ring-2 focus:ring-red-50 resize-y"
            />
            {errors.body && <div className="text-red-600 text-xs mt-1">{errors.body}</div>}
          </div>
        </div>
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={sending}>
            Gửi yêu cầu
          </Button>
        </div>
      </div>
    </div>
  );
};

export const SupportPage: React.FC = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [sending, setSending] = useState(false);
  const [reply, setReply] = useState("");
  // Ticket đang được hiển thị — dùng để bỏ kết quả async trả về trễ cho ticket đã rời đi.
  const activeTicketIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listMyTickets();
      setTickets(rows);
      // Ticket đang mở phải lấy bản mới: trạng thái do trigger server đổi.
      setActiveTicket((prev) =>
        prev ? rows.find((t) => t.id === prev.id) ?? null : null,
      );
    } catch {
      showToast("Không tải được danh sách yêu cầu hỗ trợ.", "warning");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // Xoá nháp trả lời mỗi khi đổi ticket đang xem (mở ticket khác, hoặc quay lại danh sách).
  useEffect(() => { setReply(""); }, [activeTicket?.id]);

  const openTicket = async (ticket: SupportTicket) => {
    setActiveTicket(ticket);
    activeTicketIdRef.current = ticket.id;
    try {
      const rows = await listMessages(ticket.id);
      // Người dùng có thể đã mở ticket khác trước khi request này về — bỏ nếu vậy.
      if (activeTicketIdRef.current === ticket.id) setMessages(rows);
    } catch {
      if (activeTicketIdRef.current === ticket.id) {
        setMessages([]);
        showToast("Không tải được nội dung trao đổi.", "warning");
      }
    }
  };

  const backToList = () => {
    activeTicketIdRef.current = null;
    setActiveTicket(null);
  };

  const handleCreate = async (
    title: string,
    topic: SupportTicketTopic,
    body: string,
  ) => {
    setSending(true);
    try {
      await createTicket(title, topic, body);
      setShowModal(false);
      showToast("Đã gửi yêu cầu hỗ trợ.", "success");
      await refresh();
    } catch (err) {
      // Trần 5 ticket đang mở do trigger dựng lên, ném ERRCODE = check_violation (23514).
      // Match theo code trước — message là dạng text tự do, PostgREST không cam kết giữ nguyên.
      const message =
        err instanceof PostgrestError &&
        (err.code === "23514" || err.message.includes("open limit"))
          ? "Bạn đang có quá nhiều yêu cầu chưa xử lý xong. Vui lòng chờ phản hồi."
          : "Không gửi được yêu cầu. Vui lòng thử lại.";
      showToast(message, "warning");
    } finally {
      setSending(false);
    }
  };

  const handleReply = async () => {
    const body = reply.trim();
    if (!body || !activeTicket) return;
    const ticketId = activeTicket.id;
    setSending(true);
    try {
      await sendMessage(ticketId, body);
      setReply("");
      // Bắt buộc tải lại: trigger có thể vừa mở lại ticket sang processing.
      const rows = await listMessages(ticketId);
      // Người dùng có thể đã chuyển sang ticket khác trong lúc chờ — bỏ nếu vậy.
      if (activeTicketIdRef.current === ticketId) setMessages(rows);
      await refresh();
    } catch {
      showToast("Không gửi được tin nhắn. Vui lòng thử lại.", "warning");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 rounded-2xl p-5 text-white flex items-center justify-between gap-4">
        <div>
          <div className="font-display text-xs font-bold text-yellow-400 uppercase tracking-wider">Hilfe</div>
          <div className="font-display text-2xl font-black mt-1 tracking-tight">Trợ giúp học tập</div>
          <p className="text-xs text-slate-400 mt-1 max-w-[440px]">
            Gửi yêu cầu khi bạn gặp sự cố và theo dõi phản hồi từ đội ngũ SelbstDeutsch.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowModal(true)}>
          Tạo ticket mới
        </Button>
      </div>

      {activeTicket === null ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="font-display text-xs font-bold text-red-600 uppercase tracking-wider">Yêu cầu của bạn</div>
            <span className="text-xs text-slate-400">{tickets.length} ticket</span>
          </div>
          {loading ? (
            <div className="p-4 flex flex-col gap-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              Bạn chưa gửi yêu cầu hỗ trợ nào.
            </div>
          ) : (
            <div className="p-1.5">
              {tickets.map((ticket) => (
                <button
                  key={ticket.id}
                  type="button"
                  onClick={() => void openTicket(ticket)}
                  className="w-full grid grid-cols-[1fr_auto] gap-3.5 items-center p-3 rounded-xl border border-transparent hover:bg-slate-50 hover:border-slate-200 text-left transition-colors"
                >
                  <div>
                    <div className="font-display text-sm font-bold text-slate-800 mb-1">{ticket.title}</div>
                    <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-400">
                      <span className="font-mono text-slate-500">#{ticket.code}</span>
                      <span>·</span>
                      <span>{SUPPORT_TOPIC_LABELS[ticket.topic]}</span>
                      <span>·</span>
                      <span>{new Date(ticket.createdAt).toLocaleDateString("vi-VN")}</span>
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_BADGE[ticket.status]}`}>
                    {SUPPORT_STATUS_LABELS[ticket.status]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-3.5">
            <div>
              <button
                type="button"
                onClick={backToList}
                className="font-display text-xs font-bold text-red-600 mb-2 inline-flex items-center gap-1"
              >
                ← Quay lại danh sách
              </button>
              <h2 className="font-display text-lg font-extrabold text-slate-900 tracking-tight">{activeTicket.title}</h2>
              <div className="text-[11px] text-slate-400 mt-1">
                <span className="font-mono text-slate-500">#{activeTicket.code}</span>
                {" · "}
                {SUPPORT_TOPIC_LABELS[activeTicket.topic]}
                {" · Tạo lúc "}
                {new Date(activeTicket.createdAt).toLocaleDateString("vi-VN")}
              </div>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_BADGE[activeTicket.status]}`}>
              {SUPPORT_STATUS_LABELS[activeTicket.status]}
            </span>
          </div>

          <div className="p-4">
            {messages.map((message) => (
              <div key={message.id} className={`mb-4 ${message.isStaff ? "text-right" : ""}`}>
                <div className="text-[11px] text-slate-400 mb-1">
                  {message.isStaff ? "SelbstDeutsch Support" : "Bạn"} ·{" "}
                  {new Date(message.createdAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div
                  className={`inline-block max-w-[84%] text-left px-3.5 py-3 rounded-xl text-sm leading-relaxed ${
                    message.isStaff
                      ? "bg-red-50 border border-red-100 text-red-900"
                      : "bg-slate-50 border border-slate-100 text-slate-700"
                  }`}
                >
                  {message.body}
                </div>
              </div>
            ))}

            <div className="border-t border-slate-100 pt-3.5 mt-4">
              <label htmlFor="support-reply" className="block text-xs font-display font-bold text-slate-700 mb-1.5">
                Nhắn tiếp
              </label>
              <textarea
                id="support-reply"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Nhập nội dung nhắn tiếp..."
                className="w-full min-h-[96px] border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none bg-slate-50 focus:bg-white focus:border-red-300 focus:ring-2 focus:ring-red-50 resize-y"
              />
              <div className="flex justify-end gap-2 mt-2">
                <Button onClick={() => void handleReply()} disabled={sending || !reply.trim()}>
                  Gửi
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <CreateTicketModal
          sending={sending}
          onClose={() => setShowModal(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
  );
};
