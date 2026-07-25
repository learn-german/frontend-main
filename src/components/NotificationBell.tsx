import React, { useState } from "react";
import { Bell } from "lucide-react";
import { useNotifications, type AppNotification } from "../lib/hooks/useNotifications";

export const NotificationBell: React.FC<{ dark?: boolean; onNavigate?: (n: AppNotification) => void }> = ({ dark = false, onNavigate }) => {
  const { notifications, unreadCount, markRead } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        id="btn-notification-bell"
        onClick={() => setOpen((o) => !o)}
        className={`relative p-2 rounded-xl transition ${dark ? "text-slate-400 hover:text-white hover:bg-slate-800" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"}`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-lg z-50 py-2">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">Chưa có thông báo nào.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => { markRead(n.id); setOpen(false); onNavigate?.(n); }}
                  className={`w-full text-left px-4 py-2.5 text-xs font-sans hover:bg-slate-50 transition ${n.readAt ? "text-slate-400" : "text-slate-800 font-semibold bg-orange-50/40"}`}
                >
                  {n.message}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};
