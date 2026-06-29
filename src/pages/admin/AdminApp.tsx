import React, { useState, useEffect } from "react";
import { GraduationCap, LogOut, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { AdminPage } from "./AdminPage";
import { CheckCircle2, Info, AlertTriangle, X } from "lucide-react";
import { ToastType } from "../../lib/toast";
import { AnimatePresence, motion } from "motion/react";

export const AdminApp: React.FC = () => {
  const [user, setUser] = useState<{ id: string; email: string; role: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [activeToast, setActiveToast] = useState<{ message: string; type: ToastType; id: number } | null>(null);

  // Toast listener
  useEffect(() => {
    const handler = (e: Event) => {
      const { message, type } = (e as CustomEvent<{ message: string; type: ToastType }>).detail;
      setActiveToast({ message, type, id: Date.now() });
    };
    window.addEventListener("app-toast", handler);
    return () => window.removeEventListener("app-toast", handler);
  }, []);

  useEffect(() => {
    if (activeToast) {
      const t = setTimeout(() => setActiveToast(null), 4500);
      return () => clearTimeout(t);
    }
  }, [activeToast]);

  // Check existing session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const role = (session.user.app_metadata?.role as string) ?? "user";
        if (role === "admin") {
          setUser({ id: session.user.id, email: session.user.email ?? "", role });
        } else {
          // Logged in but not admin — sign out silently
          supabase.auth.signOut();
        }
      }
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const role = (session.user.app_metadata?.role as string) ?? "user";
        if (role === "admin") {
          setUser({ id: session.user.id, email: session.user.email ?? "", role });
        }
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoginLoading(false);

    if (error) {
      setLoginError("Email hoặc mật khẩu không đúng.");
      return;
    }

    const role = (data.user?.app_metadata?.role as string) ?? "user";
    if (role !== "admin") {
      await supabase.auth.signOut();
      setLoginError("Tài khoản này không có quyền truy cập Admin.");
      return;
    }

    setUser({ id: data.user.id, email: data.user.email ?? "", role });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setEmail("");
    setPassword("");
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  // Admin panel (authenticated)
  if (user) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans antialiased">
        {/* Admin topbar */}
        <header className="sticky top-0 z-50 bg-slate-950 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-white text-sm">DeutschPath</span>
              <span className="text-slate-600 text-xs">/</span>
              <span className="text-orange-400 text-xs font-bold uppercase tracking-widest">Admin</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-orange-400" />
              <span>{user.email}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" /> Đăng xuất
            </button>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <AdminPage userRole={user.role} onNavigateHome={() => window.location.href = "/"} />
        </main>

        {/* Toast */}
        <AnimatePresence>
          {activeToast && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 15, scale: 0.95 }}
              className="fixed bottom-6 right-6 z-[9999] max-w-sm w-[calc(100%-3rem)] bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 flex items-start gap-3"
            >
              {activeToast.type === "success" && <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />}
              {activeToast.type === "info" && <Info className="w-5 h-5 text-sky-500 shrink-0 mt-0.5" />}
              {activeToast.type === "warning" && <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
              <p className="text-xs font-sans font-medium text-slate-700 leading-normal flex-1">{activeToast.message}</p>
              <button onClick={() => setActiveToast(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition shrink-0">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Login form
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 bg-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-900/40">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <div className="text-center">
            <h1 className="font-display font-extrabold text-white text-xl">DeutschPath</h1>
            <p className="text-slate-400 text-xs mt-0.5 font-bold uppercase tracking-widest">Admin Portal</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@example.com"
              required
              className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5">Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-sm rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 transition"
            />
          </div>

          {loginError && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/50 border border-red-900/50 rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {loginError}
            </div>
          )}

          <button
            type="submit"
            disabled={loginLoading}
            className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-60 text-white font-display font-bold text-sm py-2.5 rounded-xl transition-colors mt-2"
          >
            {loginLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Đăng nhập Admin
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-4">
          Trang này chỉ dành cho quản trị viên được cấp quyền.
        </p>
      </div>
    </div>
  );
};
