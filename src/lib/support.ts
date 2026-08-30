import { supabase } from "./supabase";
import type {
  SupportTicket,
  SupportTicketMessage,
  SupportTicketStatus,
  SupportTicketTopic,
} from "./appTypes";
import {
  mapMessage,
  mapTicket,
  type MessageRow,
  type TicketRow,
} from "./supportMappers";

const TICKET_COLUMNS = "id, code, user_id, title, topic, status, created_at, updated_at";
const MESSAGE_COLUMNS = "id, ticket_id, author_id, is_staff, body, image_keys, created_at";

/**
 * Nhúng thường (không !inner) và kiểu nullable, đúng như AdminWritingSection
 * đang làm: một ticket thiếu profile vẫn phải hiện ra thay vì biến mất.
 */
const ADMIN_TICKET_COLUMNS = `${TICKET_COLUMNS}, profiles(email, full_name)`;

/** Ticket của chính người đang đăng nhập — RLS lo phần lọc. */
export async function listMyTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from("support_tickets")
    .select(TICKET_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapTicket(row as TicketRow));
}

/** Toàn bộ ticket kèm thông tin học viên — chỉ admin gọi được (RLS chặn). */
export async function listAllTickets(): Promise<SupportTicket[]> {
  const { data, error } = await supabase
    .from("support_tickets")
    .select(ADMIN_TICKET_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapTicket(row as unknown as TicketRow));
}

export async function listMessages(ticketId: string): Promise<SupportTicketMessage[]> {
  const { data, error } = await supabase
    .from("support_ticket_messages")
    .select(MESSAGE_COLUMNS)
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapMessage(row as MessageRow));
}

/**
 * Tạo ticket kèm tin nhắn đầu trong một transaction. Ném lỗi khi vượt trần 5
 * ticket đang mở — người gọi bắt và hiện thông báo cho người dùng.
 */
export async function createTicket(
  title: string,
  topic: SupportTicketTopic,
  body: string,
  imageKeys: string[] = [],
): Promise<SupportTicket> {
  const { data, error } = await supabase.rpc("create_support_ticket", {
    p_title: title,
    p_topic: topic,
    p_body: body,
    p_image_keys: imageKeys,
  });
  if (error) throw error;
  return mapTicket(data as unknown as TicketRow);
}

/** author_id và is_staff đều do server điền — client không gửi hai cột đó. */
export async function sendMessage(ticketId: string, body: string, imageKeys: string[] = []): Promise<void> {
  const { error } = await supabase
    .from("support_ticket_messages")
    .insert({ ticket_id: ticketId, body, image_keys: imageKeys });
  if (error) throw error;
}

/** Chỉ admin gọi được — RLS chặn học viên. */
export async function updateTicketStatus(
  ticketId: string,
  status: SupportTicketStatus,
): Promise<void> {
  const { error } = await supabase
    .from("support_tickets")
    .update({ status })
    .eq("id", ticketId);
  if (error) throw error;
}
