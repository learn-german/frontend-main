import type {
  SupportTicket,
  SupportTicketMessage,
  SupportTicketStatus,
  SupportTicketTopic,
} from "./appTypes";

export interface TicketRow {
  id: string;
  code: string;
  user_id: string;
  title: string;
  topic: string;
  status: string;
  created_at: string;
  updated_at: string;
  profiles?: { email: string; full_name: string | null } | null;
}

export interface MessageRow {
  id: string;
  ticket_id: string;
  author_id: string;
  is_staff: boolean;
  body: string;
  image_keys?: string[] | null;
  created_at: string;
}

export function mapTicket(row: TicketRow): SupportTicket {
  return {
    id: row.id,
    code: row.code,
    userId: row.user_id,
    title: row.title,
    topic: row.topic as SupportTicketTopic,
    status: row.status as SupportTicketStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: row.profiles
      ? { email: row.profiles.email, fullName: row.profiles.full_name }
      : null,
  };
}

export function mapMessage(row: MessageRow): SupportTicketMessage {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    authorId: row.author_id,
    isStaff: row.is_staff,
    body: row.body,
    imageKeys: row.image_keys ?? [],
    createdAt: row.created_at,
  };
}

const TICKET_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_TICKET_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateTicketImages(
  files: { type: string; size: number }[],
): string | null {
  if (files.length > 3) return "Mỗi lần gửi chỉ được đính kèm tối đa 3 ảnh.";
  if (files.some((file) => !TICKET_IMAGE_TYPES.has(file.type))) {
    return "Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.";
  }
  if (files.some((file) => file.size > MAX_TICKET_IMAGE_BYTES)) {
    return "Mỗi ảnh phải nhỏ hơn hoặc bằng 5 MB.";
  }
  return null;
}

export interface TicketStats {
  pending: number;
  processing: number;
  resolvedThisWeek: number;
}

/** nowMs truyền vào thay vì gọi Date.now() bên trong để test cố định được mốc. */
export function computeTicketStats(
  tickets: SupportTicket[],
  nowMs: number,
): TicketStats {
  const weekAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
  return {
    pending: tickets.filter((t) => t.status === "pending").length,
    processing: tickets.filter((t) => t.status === "processing").length,
    resolvedThisWeek: tickets.filter(
      (t) => t.status === "resolved" && new Date(t.updatedAt).getTime() >= weekAgo,
    ).length,
  };
}

export function filterTickets(
  tickets: SupportTicket[],
  search: string,
  status: SupportTicketStatus | "all",
  topic: SupportTicketTopic | "all",
): SupportTicket[] {
  const q = search.trim().toLowerCase();
  return tickets.filter((t) => {
    const matchStatus = status === "all" || t.status === status;
    const matchTopic = topic === "all" || t.topic === topic;
    const matchSearch =
      !q || t.title.toLowerCase().includes(q) || t.code.toLowerCase().includes(q);
    return matchStatus && matchTopic && matchSearch;
  });
}
