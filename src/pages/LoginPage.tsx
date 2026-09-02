/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { BrandLogo } from "../components/BrandLogo";
import { signInWithGoogle } from "../lib/auth";

interface LoginPageProps {
  onNavigateHome: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigateHome }) => {
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setError("");
    setIsLoading(true);

    const { error: oauthError } = await signInWithGoogle();
    if (oauthError) {
      setError(oauthError.message);
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <section
        id="login-card-container"
        className="grid w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-xl md:grid-cols-2"
      >
        <div className="flex min-h-[600px] flex-col justify-center px-8 py-12 sm:px-14 lg:px-20">
          <button
            id="login-brand"
            type="button"
            onClick={onNavigateHome}
            className="mb-14 flex w-fit items-center gap-3 text-left select-none"
            aria-label="Về trang chủ DeutschSelbst"
          >
            <BrandLogo size="lg" />
            <span className="font-display text-2xl font-extrabold tracking-tight text-slate-900">
              DeutschSelbst
            </span>
          </button>

          <div className="text-center">
            <h1 className="font-display text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">
              Chào mừng trở lại!
            </h1>
            <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-slate-500 sm:text-lg">
              Đồng hành cùng DeutschSelbst trên con đường chinh phục ngoại ngữ
            </p>

            {error && (
              <div role="alert" className="mt-6 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <button
              id="btn-google-auth"
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="mt-12 flex w-full items-center justify-center gap-4 rounded-xl border border-slate-300 bg-white px-5 py-4 font-display text-base font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              ) : (
                <svg className="h-6 w-6" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.45a5.51 5.51 0 0 1-2.39 3.61v3h3.87c2.27-2.09 3.56-5.17 3.56-8.85Z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.89l-3.87-3a7.2 7.2 0 0 1-10.72-3.79h-4v3.09A12 12 0 0 0 12 24Z" />
                  <path fill="#FBBC05" d="M5.36 14.32A7.2 7.2 0 0 1 5 12c0-.81.14-1.59.36-2.32V6.59h-4A12 12 0 0 0 0 12c0 1.93.46 3.75 1.36 5.41l4-3.09Z" />
                  <path fill="#EA4335" d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44A11.56 11.56 0 0 0 12 0 12 12 0 0 0 1.36 6.59l4 3.09A7.15 7.15 0 0 1 12 4.77Z" />
                </svg>
              )}
              <span>{isLoading ? "Đang chuyển hướng…" : "Đăng nhập qua Google"}</span>
            </button>

            <p className="mt-8 text-sm leading-relaxed text-slate-500">
              Bằng việc tiếp tục, bạn đồng ý với{" "}
              <span className="font-medium text-blue-600">Điều khoản</span> và{" "}
              <span className="font-medium text-blue-600">Chính sách bảo mật</span>.
            </p>
          </div>
        </div>

        <div
          className="hidden min-h-[600px] bg-slate-950 bg-cover bg-center md:block"
          style={{ backgroundImage: 'url("/login-illustration.png")' }}
          role="img"
          aria-label="Học viên DeutschSelbst đang học tiếng Đức"
        />
      </section>
    </main>
  );
};
