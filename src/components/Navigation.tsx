/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  BookOpen,
  Map,
  Compass,
  GraduationCap,
  User,
  Menu,
  X,
  LogOut,
  TrendingUp,
  Globe,
  Trophy,
  Gift,
  HelpCircle
} from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { Button } from "./DesignSystem";
import type { AppNotification } from "../lib/hooks/useNotifications";

interface NavigationProps {
  currentPage: string;
  onNavigate: (page: "landing" | "login" | "dashboard" | "roadmap" | "lesson-detail" | "quiz" | "leaderboard") => void;
  user: { email: string; fullName: string; role?: string } | null;
  onLogout: () => void;
  streak: number;
  xp: number;
  onNotificationNavigate?: (n: AppNotification) => void;
}

export const Navbar: React.FC<NavigationProps> = ({
  currentPage,
  onNavigate,
  user,
  onLogout,
  streak,
  xp,
  onNotificationNavigate
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="w-full flex flex-col shrink-0">
      {/* Subtle German flag-inspired micro-stripe (un-equal proportions, non-political accenting) */}
      <div className="w-full h-1 bg-slate-100 flex select-none pointer-events-none">
        <div className="w-10 bg-slate-950" />
        <div className="w-14 bg-red-600" />
        <div className="w-6 bg-yellow-400" />
        <div className="flex-1 bg-slate-100" />
      </div>

      <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur border-b border-slate-200 px-4 md:px-8 py-3.5 flex justify-between items-center">
        {/* Brand logo */}
        <div 
          id="nav-logo"
          className="flex items-center gap-2 cursor-pointer select-none"
          onClick={() => onNavigate(user ? "dashboard" : "landing")}
        >
          <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center text-white">
            <GraduationCap className="w-5.5 h-5.5" />
          </div>
          <span className="font-display font-extrabold text-xl tracking-tight text-slate-900 font-sans">
            SelbstDeutsch
          </span>
        </div>

        {/* Desktop Menu - For logged out / landing page */}
        {!user ? (
          <nav className="hidden md:flex items-center gap-6">
            <span 
              id="nav-link-landing"
              onClick={() => onNavigate("landing")} 
              className={`text-sm font-display font-medium cursor-pointer transition ${
                currentPage === "landing" ? "text-orange-600 font-bold" : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Trang chủ
            </span>
            <span 
              onClick={() => {
                const el = document.getElementById("features");
                if (el) el.scrollIntoView({ behavior: "smooth" });
                else onNavigate("landing");
              }} 
              className="text-sm font-display font-medium text-slate-500 hover:text-slate-900 cursor-pointer transition"
            >
              Tính năng
            </span>
            <span 
              onClick={() => {
                const el = document.getElementById("pricing");
                if (el) el.scrollIntoView({ behavior: "smooth" });
                else onNavigate("landing");
              }} 
              className="text-sm font-display font-medium text-slate-500 hover:text-slate-900 cursor-pointer transition"
            >
              Học phí
            </span>
            <div className="h-4 w-[1px] bg-slate-200" />
            <Button id="btn-nav-login" variant="ghost" size="sm" onClick={() => onNavigate("login")}>
              Đăng nhập
            </Button>
            <Button id="btn-nav-start" variant="primary" size="sm" onClick={() => onNavigate("login")}>
              Học thử miễn phí A1
            </Button>
          </nav>
        ) : (
          /* Desktop Menu - For logged in */
          <nav className="hidden md:flex items-center gap-6">
            <NotificationBell onNavigate={onNotificationNavigate} />

            <div className="h-4 w-[1px] bg-slate-200" />

            {/* User profile dropdown snippet */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-full pl-2 pr-3.5 py-1">
              <div className="w-7 h-7 bg-slate-800 text-white rounded-full flex items-center justify-center font-display font-bold text-xs">
                {user.fullName.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-display font-semibold text-slate-700 max-w-[100px] truncate">
                {user.fullName}
              </span>
              <button 
                id="btn-nav-logout"
                onClick={onLogout} 
                className="text-slate-400 hover:text-rose-500 ml-1.5 cursor-pointer transition"
                title="Đăng xuất"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </nav>
        )}

      {/* Flag decoration & Mobile Toggle */}
      <div className="flex items-center gap-3">
        {!user && (
          <div className="flex items-center gap-1 text-[13px] bg-gray-50 border border-gray-100 px-2.5 py-1.5 rounded-full font-sans select-none text-gray-500">
            <Globe className="w-3.5 h-3.5 text-gray-400 mr-0.5" />
            <span>DE</span>
            <span className="text-gray-300">|</span>
            <span>VI</span>
          </div>
        )}

        {/* Mobile menu button */}
        <button
          id="btn-mobile-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 text-gray-600 hover:text-gray-900 rounded-xl hover:bg-gray-50 focus:outline-none transition cursor-pointer"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile drop menu */}
      {mobileMenuOpen && (
        <div 
          id="mobile-drawer"
          className="absolute top-full left-0 right-0 bg-white border-b border-gray-100 shadow-lg px-4 py-5 flex flex-col gap-4 md:hidden animate-in fade-in"
        >
          {!user ? (
            <>
              <button 
                id="mob-landing"
                onClick={() => { onNavigate("landing"); setMobileMenuOpen(false); }}
                className="text-left py-2 text-sm font-display font-semibold text-gray-700 border-b border-gray-50"
              >
                Trang chủ
              </button>
              <button 
                onClick={() => {
                  setMobileMenuOpen(false);
                  setTimeout(() => {
                    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
                  }, 100);
                }}
                className="text-left py-2 text-sm font-display font-semibold text-gray-700 border-b border-gray-50"
              >
                Tính năng
              </button>
              <button 
                onClick={() => {
                  setMobileMenuOpen(false);
                  setTimeout(() => {
                    document.getElementById("pricing")?.scrollIntoView({ behavior: "smooth" });
                  }, 100);
                }}
                className="text-left py-2 text-sm font-display font-semibold text-gray-700 border-b border-gray-50"
              >
                Học phí
              </button>
              <div className="flex flex-col gap-2 mt-2">
                <Button id="btn-mob-login" variant="secondary" size="md" onClick={() => { onNavigate("login"); setMobileMenuOpen(false); }}>
                  Đăng nhập
                </Button>
                <Button id="btn-mob-start" variant="primary" size="md" onClick={() => { onNavigate("login"); setMobileMenuOpen(false); }}>
                  Đăng ký miễn phí
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 bg-green-500 text-white rounded-full flex items-center justify-center font-display font-bold text-sm">
                    {user.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-sm font-display font-bold text-gray-800">{user.fullName}</h4>
                    <span className="text-xs text-gray-400">{user.email}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="text-xs font-display font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/50">
                    🔥 {streak} Ngày
                  </div>
                  <div className="text-xs font-display font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/50">
                    🏆 {xp} XP
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  id="mob-dash"
                  onClick={() => { onNavigate("dashboard"); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-2.5 p-3 rounded-xl text-sm font-display font-semibold transition ${
                    currentPage === "dashboard" ? "bg-green-50 text-green-700" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Compass className="w-5 h-5 text-gray-400" />
                  Bảng điều khiển
                </button>
                <button
                  id="mob-road"
                  onClick={() => { onNavigate("roadmap"); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-2.5 p-3 rounded-xl text-sm font-display font-semibold transition ${
                    currentPage === "roadmap" ? "bg-green-50 text-green-700" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Map className="w-5 h-5 text-gray-400" />
                  Lộ trình học
                </button>
                <button
                  id="mob-leaderboard"
                  onClick={() => { onNavigate("leaderboard"); setMobileMenuOpen(false); }}
                  className={`flex items-center gap-2.5 p-3 rounded-xl text-sm font-display font-semibold transition ${
                    currentPage === "leaderboard" ? "bg-green-50 text-green-700" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Trophy className="w-5 h-5 text-gray-400" />
                  Bảng xếp hạng
                </button>
              </div>

              <Button id="btn-mob-logout" variant="danger" size="md" onClick={() => { onLogout(); setMobileMenuOpen(false); }} className="mt-2 w-full">
                <LogOut className="w-4 h-4 mr-2" /> Đăng xuất
              </Button>
            </>
          )}
        </div>
      )}
    </header>
    </div>
  );
};


interface SidebarProps {
  currentPage: string;
  onNavigate: (page: "landing" | "login" | "dashboard" | "roadmap" | "lesson-detail" | "quiz") => void;
  streak: number;
  currentLessonTitle?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onNavigate, streak, currentLessonTitle }) => {
  const links = [
    { id: "dashboard", label: "Dashboard", desc: "Bảng tổng quan", icon: Compass },
    { id: "roadmap", label: "Lộ trình", desc: "Sơ đồ khóa học", icon: Map },
    { id: "lesson-detail", label: "Bài học hiện tại", desc: currentLessonTitle ? `Đang học: ${currentLessonTitle}` : "Bài học đang xem", icon: BookOpen },
    { id: "packages", label: "Gói học", desc: "Xem gói & quyền lợi", icon: Gift },
    { id: "leaderboard", label: "Bảng xếp hạng", desc: "Thành tích học tập", icon: Trophy },
    { id: "help", label: "Trợ giúp học tập", desc: "Giải đáp thắc mắc", icon: HelpCircle },
  ];

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 p-5 shrink-0 sticky top-[73px] h-[calc(100vh-73px)]">
      {/* Dynamic Nav List */}
      <div className="flex flex-col gap-1.5 flex-1">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = currentPage === link.id || (link.id === "lesson-detail" && currentPage === "quiz");
          return (
            <button
              id={`sidebar-link-${link.id}`}
              key={link.id}
              onClick={() => onNavigate(link.id as any)}
              className={`flex items-center gap-3.5 px-5 py-3 rounded-xl text-left transition duration-150 group cursor-pointer ${
                isActive
                  ? "bg-orange-50/40 text-orange-700 border-r-4 border-orange-600 font-medium"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-950"
              }`}
            >
              <Icon className={`w-5 h-5 shrink-0 ${isActive ? "text-orange-600" : "text-slate-400 group-hover:text-slate-600"}`} />
              <div>
                <p className="text-sm font-display font-bold leading-tight">{link.label}</p>
                <p className={`text-[11px] font-sans mt-0.5 ${isActive ? "text-orange-500/80" : "text-slate-400"}`}>{link.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      { /* Decorative minimalist Card */ }
      <div className="bg-yellow-50/50 border border-yellow-200/50 p-4 rounded-xl relative overflow-hidden">
        <div className="absolute right-[-10px] bottom-[-10px] text-5xl opacity-10 rotate-12 select-none">🔥</div>
        <h4 className="text-xs font-display font-bold text-amber-805 text-amber-900">Streak hằng ngày!</h4>
        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
          Học tối thiểu 1 bài học mỗi ngày để duy trì chuỗi đỏ lấp lánh của bạn. Tích cực lên nhé!
        </p>
        <div className="mt-3 flex items-center gap-1">
          <span className="text-sm">🔥</span>
          <span className="text-xs font-display font-bold text-amber-800">{streak > 0 ? `${streak} ngày liên tiếp` : "Học 15 phút để bắt đầu streak"}</span>
        </div>
      </div>
    </aside>
  );
};
