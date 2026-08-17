/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  Mail,
  Lock,
  ArrowRight,
  User,
  CheckCircle2,
  GraduationCap,
  Loader2
} from "lucide-react";
import { Button, Input } from "../components/DesignSystem";
import { showToast } from "../lib/toast";
import { signIn, signUp, signInWithGoogle, resetPassword } from "../lib/auth";

interface LoginPageProps {
  onNavigateHome: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onNavigateHome
}) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Vui lòng nhập đầy đủ email và mật khẩu.");
      return;
    }
    if (isRegister && !fullName) {
      setError("Vui lòng nhập họ và tên của bạn.");
      return;
    }

    setIsLoading(true);
    try {
      if (isRegister) {
        const { error: signUpError } = await signUp(email, password, fullName);
        if (signUpError) throw signUpError;
        showToast("Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản.", "success");
      } else {
        const { error: signInError } = await signIn(email, password);
        if (signInError) throw signInError;
        // App.tsx sẽ lắng nghe onAuthStateChange và chuyển trang
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Đã có lỗi xảy ra, vui lòng thử lại.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    const { error: oauthError } = await signInWithGoogle();
    if (oauthError) {
      setError(oauthError.message);
      setIsLoading(false);
    }
    // Nếu thành công, browser sẽ redirect sang Google — không cần xử lý thêm
  };

  const handleForgotPassword = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Vui lòng nhập email của bạn rồi bấm 'Quên mật khẩu?'.");
      return;
    }
    setIsLoading(true);
    const { error: resetError } = await resetPassword(email);
    setIsLoading(false);
    if (resetError) {
      setError(resetError.message);
    } else {
      showToast("Email khôi phục mật khẩu đã được gửi. Vui lòng kiểm tra hộp thư.", "success");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      {/* Container card */}
      <div 
        id="login-card-container"
        className="max-w-4xl w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200/60 grid grid-cols-1 md:grid-cols-12 min-h-[540px]"
      >
        {/* Left column - Form */}
        <div className="md:col-span-6 p-8 sm:p-10 flex flex-col justify-between">
          <div className="w-full">
            {/* Header / Logo */}
            <div 
              id="login-brand"
              onClick={onNavigateHome} 
              className="flex items-center gap-2 cursor-pointer select-none mb-8"
            >
              <div className="w-8 h-8 bg-orange-600 rounded-lg flex items-center justify-center text-white">
                <GraduationCap className="w-4.5 h-4.5" />
              </div>
              <span className="font-display font-extrabold text-lg tracking-tight text-slate-900">
                SelbstDeutsch
              </span>
            </div>

            <div className="space-y-2 mb-6">
              <h2 className="text-2xl font-display font-black text-slate-900 tracking-tight">
                {isRegister ? "Đăng ký tài khoản mới" : "Chào mừng trở lại!"}
              </h2>
              <p className="text-sm text-slate-500 leading-normal">
                {isRegister 
                  ? "Bắt đầu học tiếng Đức miễn phí ngay hôm nay" 
                  : "Đồng hành cùng SelbstDeutsch trên con đường chinh phục ngoại ngữ"
                }
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs mb-4">
                {error}
              </div>
            )}

            {/* Login/Register Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && (
                <div className="relative">
                  <Input
                    id="reg-fullname"
                    label="Họ và tên"
                    placeholder="Nguyễn Văn Lâm"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                  <User className="absolute right-3.5 top-[39px] w-4.5 h-4.5 text-slate-400" />
                </div>
              )}

              <div className="relative">
                <Input
                  id="login-email"
                  label="Địa chỉ Email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <Mail className="absolute right-3.5 top-[39px] w-4.5 h-4.5 text-slate-400" />
              </div>

              <div className="relative">
                <Input
                  id="login-password"
                  label="Mật khẩu"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Lock className="absolute right-3.5 top-[39px] w-4.5 h-4.5 text-slate-400" />
              </div>

              {!isRegister && (
                <div className="flex justify-between items-center text-xs mt-1">
                  <label className="flex items-center gap-1.5 text-slate-500 select-none cursor-pointer">
                    <input type="checkbox" className="rounded text-orange-600 accent-orange-600" defaultChecked />
                    Ghi nhớ đăng nhập
                  </label>
                  <a
                    id="btn-forgot-pwd"
                    href="#"
                    onClick={handleForgotPassword}
                    className="text-orange-600 hover:text-orange-700 font-display font-semibold transition"
                  >
                    Quên mật khẩu?
                  </a>
                </div>
              )}

              <Button
                id="btn-login-submit"
                type="submit"
                variant="primary"
                className="w-full mt-2"
                disabled={isLoading}
              >
                {isLoading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <>{isRegister ? "Đăng ký ngay" : "Đăng nhập bằng Email"}<ArrowRight className="w-4 h-4 ml-2" /></>
                }
              </Button>
            </form>

            <div className="relative my-6 text-center select-none">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-100" />
              </div>
              <span className="relative bg-white px-3.5 text-xs text-slate-400 font-sans">hoặc tiếp tục với</span>
            </div>

            {/* Google OAuth */}
            <button
              id="btn-google-auth"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 font-display font-semibold text-slate-700 text-sm active:scale-95 duration-150 transition cursor-pointer shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading
                ? <Loader2 className="w-4.5 h-4.5 animate-spin text-slate-400" />
                : (
                  <svg className="w-4.5 h-4.5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.9h6.6c-.28 1.5-.1.8-1.5 1.76v2.9h2.4c1.4-1.3 2.2-3.3 2.2-5.5v-.99z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.97-1.1 7.96-2.9l-3.86-3c-1.1.7-2.5 1.1-4.1 1.1-3.14 0-5.8-2.1-6.75-5H1.32v3.1C3.3 21.3 7.37 24 12 24z" />
                    <path fill="#FBBC05" d="M5.25 14.2c-.25-.7-.38-1.5-.38-2.2s.13-1.5.38-2.2V6.7H1.32C.48 8.4 0 10.15 0 12s.48 3.6 1.32 5.3l3.93-3.1z" />
                    <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.6 4.6 1.8l3.43-3.4C17.96 1.2 15.24 0 12 0 7.37 0 3.3 2.7 1.32 5.7l3.93 3.1c.95-2.9 3.61-5 6.75-5z" />
                  </svg>
                )
              }
              <span>Đăng nhập qua Google (Đề xuất)</span>
            </button>
          </div>

          {/* Bottom Switch link */}
          <div className="pt-6 text-center text-xs text-slate-500 border-t border-slate-100 mt-6 select-none">
            {isRegister ? (
              <p>
                Đã có tài khoản?{" "}
                <button
                  id="btn-toggle-login"
                  type="button"
                  onClick={() => { setIsRegister(false); setError(""); }}
                  className="text-orange-600 hover:text-orange-700 font-display font-semibold hover:underline cursor-pointer"
                >
                  Đăng nhập tại đây
                </button>
              </p>
            ) : (
              <p>
                Bạn mới sử dụng SelbstDeutsch?{" "}
                <button
                  id="btn-toggle-register"
                  type="button"
                  onClick={() => { setIsRegister(true); setError(""); }}
                  className="text-orange-600 hover:text-orange-700 font-display font-semibold hover:underline cursor-pointer"
                >
                  Đăng ký miễn phí
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Right column - Illustration/Branding panel */}
        <div className="hidden md:col-span-6 bg-slate-900 border-l border-slate-800 p-8 text-white flex-col justify-between relative overflow-hidden select-none">
          {/* Decorative background grid and shapes */}
          <div className="absolute top-1/4 right-0 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-10 left-[-20px] w-48 h-48 bg-yellow-400/5 rounded-full blur-2xl pointer-events-none" />

          {/* Top section */}
          <div className="relative space-y-4">
            <span className="font-mono text-xs text-yellow-400 tracking-wider uppercase font-semibold">DEUTSCHPATH ACADEMY</span>
            <h3 className="text-3xl font-display font-black leading-tight">
              Lộ trình Đức tiến <br />
              giúp bứt tốc tương lai
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed max-w-xs">
              Hệ thống được tùy biến hoàn hảo cho người Việt tự học hiệu quả, tự tin thi lấy chứng chỉ bay và hòa nhập cuộc sống phương Tây.
            </p>
          </div>

          {/* Center decorative illustration (Modern CSS/HTML based graphics) */}
          <div className="relative bg-slate-800/80 backdrop-blur border border-slate-700/80 p-5 rounded-2xl shadow-xl mt-6 space-y-4">
            <div className="flex gap-2">
              <span className="w-2.5 h-2.5 bg-rose-400 rounded-full" />
              <span className="w-2.5 h-2.5 bg-yellow-400 rounded-full" />
              <span className="w-2.5 h-2.5 bg-green-400 rounded-full" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 bg-slate-900/60 p-2 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-xs font-sans text-slate-350">Lộ trình được tinh gọn (A1 → B1)</span>
              </div>
              <div className="flex items-center gap-2 bg-slate-900/60 p-2 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-xs font-sans text-slate-350">800+ câu hỏi luyện tập trực quan</span>
              </div>
            </div>

            {/* German flag vector block representation */}
            <div className="flex items-center gap-2 bg-white/5 p-2 rounded-xl border border-white/10">
              <div className="w-8 h-5.5 rounded overflow-hidden flex flex-col shadow-sm border border-black/10">
                <div className="h-1/3 bg-black" />
                <div className="h-1/3 bg-red-600" />
                <div className="h-1/3 bg-yellow-500" />
              </div>
              <span className="text-xs font-mono font-bold text-slate-300">Đích đến: Nước Đức thành công!</span>
            </div>
          </div>

          {/* Bottom citation */}
          <div className="relative pt-6 border-t border-slate-800 text-[11px] text-slate-400">
            Ứng dụng hỗ trợ ghi nhớ từ vựng Duolingo, bài học giải thích chi tiết ngữ pháp Khan Academy nâng tầm tri thức.
          </div>
        </div>
      </div>
    </div>
  );
};
