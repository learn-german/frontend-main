import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";

export interface AppNotification {
  id: string;
  type: string;
  lessonId: string | null;
  message: string;
  readAt: string | null;
  createdAt: string;
}

// Chỉ tải thông báo CHƯA đọc — thông báo đã đọc (bấm xem, hoặc admin mở
// chuông) biến mất khỏi danh sách ngay từ lần tải sau, không cần lọc tay.
export function useNotifications(forAdmin: boolean = false) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(() => {
    setLoading(true);
    supabase
      .from("notifications")
      .select("id, type, lesson_id, message, read_at, created_at")
      .eq("for_admin", forAdmin)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        setNotifications(
          (data ?? []).map((n) => ({
            id: n.id as string,
            type: n.type as string,
            lessonId: n.lesson_id as string | null,
            message: n.message as string,
            readAt: n.read_at as string | null,
            createdAt: n.created_at as string,
          })),
        );
        setLoading(false);
      });
  }, [forAdmin]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markRead = async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  };

  // Đánh dấu đã đọc TOÀN BỘ danh sách hiện có (dùng khi admin mở chuông —
  // không cần bấm từng cái). Giữ nguyên item trong state để admin vẫn thấy
  // được nội dung trong phiên mở này; lần tải lại kế tiếp (đóng dropdown)
  // mới thực sự loại các item đã đọc khỏi danh sách.
  const markAllRead = async () => {
    const ids = notifications.map((n) => n.id);
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: now })));
    await supabase.from("notifications").update({ read_at: now }).in("id", ids);
  };

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return { notifications, unreadCount, loading, markRead, markAllRead, refetch: fetchNotifications };
}
