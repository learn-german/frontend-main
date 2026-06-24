/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Level } from "../lib/appTypes";

// Button Component
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "disabled" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  children,
  className = "",
  disabled,
  ...props
}) => {
  const baseStyles = "inline-flex items-center justify-center font-display font-semibold transition-all duration-150 active:scale-95 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 rounded-xl select-none";
  
  const variants = {
    primary: "bg-orange-600 hover:bg-orange-700 text-white shadow-sm hover:shadow border border-transparent",
    secondary: "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 shadow-sm",
    ghost: "bg-transparent hover:bg-slate-100 text-slate-500 hover:text-slate-800",
    disabled: "bg-slate-100 text-slate-400 border border-slate-200/60 cursor-not-allowed transform-none active:scale-100",
    danger: "bg-rose-600 hover:bg-rose-700 text-white shadow-sm",
    success: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm",
  };

  const sizes = {
    sm: "px-3.5 py-1.5 text-xs rounded-lg",
    md: "px-5 py-2.5 text-sm rounded-xl",
    lg: "px-7 py-3.5 text-base rounded-2xl",
  };

  const isBtnDisabled = variant === "disabled" || disabled;

  return (
    <button
      disabled={isBtnDisabled}
      className={`${baseStyles} ${isBtnDisabled ? variants.disabled : variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

// Input Component
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  id: string; // Ensure unique ID attribute is provided
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  id,
  className = "",
  ...props
}) => {
  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-display font-semibold text-gray-700">
          {label}
        </label>
      )}
      <input
        id={id}
        className={`w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-sans text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/10 focus:border-orange-500 transition-all duration-150 ${
          error ? "border-rose-400 focus:ring-rose-500/10 focus:border-rose-500" : ""
        } ${className}`}
        {...props}
      />
      {error && <span className="text-xs font-sans text-rose-500 mt-0.5">{error}</span>}
    </div>
  );
};

// Level Badge Component
export const LevelBadge: React.FC<{ level: Level; className?: string }> = ({
  level,
  className = ""
}) => {
  const styles = {
    A1: "bg-emerald-50 text-emerald-700 border-emerald-100",
    A2: "bg-blue-50 text-blue-700 border-blue-100",
    B1: "bg-slate-100 text-slate-400 border-slate-200/60",
  };

  return (
    <span
      className={`inline-flex items-center justify-center font-display font-bold text-xs uppercase px-2.5 py-1 rounded-lg border ${styles[level]} ${className}`}
    >
      {level}
    </span>
  );
};

// Progress Bar Component
export const ProgressBar: React.FC<{
  value: number;
  max?: number;
  className?: string;
  showText?: boolean;
}> = ({ value, max = 100, className = "", showText = false }) => {
  const percent = Math.min(Math.max(Math.round((value / max) * 100), 0), 100);

  return (
    <div className={`w-full ${className}`}>
      {showText && (
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-display font-semibold text-slate-500">Tiến trình</span>
          <span className="text-xs font-display font-bold text-slate-800">{percent}%</span>
        </div>
      )}
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/40">
        <div
          className="h-full bg-green-600 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};
