import React, { useEffect, useMemo } from "react";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  HelpCircle,
  LogOut,
  ChevronRight,
  AlertTriangle,
  PenLine,
  MessageSquare,
  Video,
} from "lucide-react";
import { Button } from "../../components/DesignSystem";
import {
  canAccessAdminSection,
  getVisibleAdminSections,
  isAdminPortalRole,
  type AdminSection,
} from "../../lib/adminAcl";
import { AdminDashboardSection } from "./AdminDashboardSection";
import { AdminUsersSection } from "./AdminUsersSection";
import { AdminContentSection } from "./AdminContentSection";
import { AdminQuizSection } from "./AdminQuizSection";
import { AdminWritingSection } from "./AdminWritingSection";
import { AdminSupportSection } from "./AdminSupportSection";
import { AdminMeetingSection } from "./AdminMeetingSection";

export type { AdminSection };

interface AdminPageProps {
  userRole: string;
  onNavigateHome: () => void;
  section: AdminSection;
  onSectionChange: (s: AdminSection) => void;
}

const NAV_META: Record<AdminSection, { label: string; Icon: React.FC<{ className?: string }> }> = {
  dashboard: { label: "Tổng quan", Icon: LayoutDashboard },
  users: { label: "Người dùng", Icon: Users },
  content: { label: "Nội dung", Icon: BookOpen },
  quiz: { label: "Bài tập", Icon: HelpCircle },
  writing: { label: "Chấm bài viết", Icon: PenLine },
  support: { label: "Hỗ trợ", Icon: MessageSquare },
  meetings: { label: "Lịch meeting", Icon: Video },
};

export const AdminPage: React.FC<AdminPageProps> = ({ userRole, onNavigateHome, section, onSectionChange }) => {
  const isTutor = userRole === "tutor";
  const visibleSections = useMemo(() => getVisibleAdminSections(userRole), [userRole]);

  useEffect(() => {
    if (!canAccessAdminSection(userRole, section)) {
      onSectionChange("dashboard");
    }
  }, [userRole, section, onSectionChange]);

  if (!isAdminPortalRole(userRole)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500" />
        <h2 className="text-lg font-display font-bold text-slate-700">Không có quyền truy cập</h2>
        <p className="text-sm text-slate-500">Trang này chỉ dành cho quản trị viên hoặc gia sư.</p>
        <Button variant="secondary" onClick={onNavigateHome}>Quay về Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="flex gap-6 min-h-screen">
      <aside className="w-52 shrink-0">
        <div className="sticky top-6 space-y-1">
          <p className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-widest px-3 mb-3">
            {isTutor ? "Gia sư" : "Admin Panel"}
          </p>
          {visibleSections.map((id) => {
            const { label, Icon } = NAV_META[id];
            return (
              <button
                key={id}
                onClick={() => onSectionChange(id)}
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
            );
          })}
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

      <main className="flex-1 min-w-0">
        {section === "dashboard" && <AdminDashboardSection />}
        {section === "users" && !isTutor && <AdminUsersSection />}
        {section === "content" && !isTutor && <AdminContentSection />}
        {section === "quiz" && <AdminQuizSection />}
        {section === "writing" && <AdminWritingSection />}
        {section === "support" && <AdminSupportSection />}
        {section === "meetings" && <AdminMeetingSection />}
      </main>
    </div>
  );
};
