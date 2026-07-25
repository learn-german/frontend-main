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

export function useNotifications() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(() => {
    setLoading(true);
    supabase
      .from("notifications")
      .select("id, type, lesson_id, message, read_at, created_at")
      .eq("for_admin", false)
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
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  };

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  return { notifications, unreadCount, loading, markRead };
}
