/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { BrandLogo } from "../components/BrandLogo";
import { validateDisplayName } from "../lib/profileOnboarding";

interface RegistrationPageProps {
  email: string;
  onSubmit: (fullName: string) => Promise<string | null>;
  onLogout: () => void;
}

const RegistrationPageContent: React.FC<RegistrationPageProps> = ({
  email,
  onSubmit,
  onLogout,
}) => {
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = validateDisplayName(fullName);
    if (result.error) {
      setError(result.error);
      return;
    }

    setError("");
    setIsLoading(true);
    const submitError = await onSubmit(result.value);
    if (submitError) {
      setError(submitError);
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      <section className="grid w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-xl md:grid-cols-2">
        <form onSubmit={handleSubmit} className="flex min-h-[600px] flex-col justify-center px-8 py-12 sm:px-14 lg:px-20">
          <BrandLogo size="lg" />
          <h1 className="mt-10 font-display text-4xl font-black tracking-tight text-slate-900 sm:text-5xl">
            Hoàn tất đăng ký
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-500 sm:text-lg">
            Chọn tên sẽ hiển thị trong DeutschSelbst.
          </p>
          <label htmlFor="registration-full-name" className="mt-8 text-sm font-semibold text-slate-900">
            Tên hiển thị
          </label>
          <input
            id="registration-full-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            minLength={2}
            maxLength={80}
            disabled={isLoading}
            autoComplete="name"
            className="mt-2 rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
          />
          {error && (
            <div role="alert" className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}
          <button
            id="btn-complete-registration"
            type="submit"
            disabled={isLoading}
            className="mt-8 rounded-xl bg-blue-600 px-5 py-4 font-display text-base font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Đang lưu…" : "Bắt đầu học"}
          </button>
          <button
            type="button"
            onClick={onLogout}
            disabled={isLoading}
            className="mt-4 rounded-xl px-5 py-3 font-display text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Đăng xuất
          </button>
          <span className="mt-6 text-sm text-slate-400">{email}</span>
        </form>
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

export const RegistrationPage = (props: RegistrationPageProps) => (
  <RegistrationPageContent {...props} />
);
