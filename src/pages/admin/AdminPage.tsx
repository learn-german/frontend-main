import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  HelpCircle,
  LogOut,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/DesignSystem";
import { AdminDashboardSection } from "./AdminDashboardSection";
import { AdminUsersSection } from "./AdminUsersSection";
import { AdminContentSection } from "./AdminContentSection";
import { AdminQuizSection } from "./AdminQuizSection";

type AdminSection = "dashboard" | "users" | "content" | "quiz";

interface AdminPageProps {
  userRole: string;
  onNavigateHome: () => void;
}

const NAV_ITEMS: { id: AdminSection; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: "dashboard", label: "Tổng quan", Icon: LayoutDashboard },
  { id: "users", label: "Người dùng", Icon: Users },
  { id: "content", label: "Nội dung", Icon: BookOpen },
  { id: "quiz", label: "Bài tập", Icon: HelpCircle },
];

export const AdminPage: React.FC<AdminPageProps> = ({ userRole, onNavigateHome }) => {
  const [section, setSection] = useState<AdminSection>("dashboard");

  // Guard: redirect non-admins
  if (userRole !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500" />
        <h2 className="text-lg font-display font-bold text-slate-700">Không có quyền truy cập</h2>
        <p className="text-sm text-slate-500">Trang này chỉ dành cho quản trị viên.</p>
        <Button variant="secondary" onClick={onNavigateHome}>Quay về Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="flex gap-6 min-h-screen">
      {/* Sidebar */}
      <aside className="w-52 shrink-0">
        <div className="sticky top-6 space-y-1">
          <p className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-widest px-3 mb-3">
            Admin Panel
          </p>
          {NAV_ITEMS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-display font-semibold transition-colors ${
                section === id
                  ? "bg-orange-50 text-orange-700 border border-orange-200"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
              {section === id && <ChevronRight className="w-3 h-3 ml-auto text-orange-400" />}
            </button>
          ))}
          <div className="pt-4 border-t border-slate-100 mt-4">
            <button
              onClick={onNavigateHome}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-display font-semibold text-slate-500 hover:bg-slate-50 transition-colors"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              Thoát Admin
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0">
        {section === "dashboard" && <AdminDashboardSection />}
        {section === "users" && <AdminUsersSection />}
        {section === "content" && <AdminContentSection />}
        {section === "quiz" && <AdminQuizSection />}
      </main>
    </div>
  );
};
