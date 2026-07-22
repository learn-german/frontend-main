import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface AdminModuleGroupProps {
  title: string;
  subtitle: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export const AdminModuleGroup: React.FC<AdminModuleGroupProps> = ({
  title,
  subtitle,
  expanded,
  onToggle,
  children,
}) => (
  <div className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
    >
      {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      <div className="flex-1">
        <p className="font-display font-black text-slate-900 text-sm">{title}</p>
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
    </button>
    {expanded && <div className="border-t border-slate-100 p-3 space-y-3">{children}</div>}
  </div>
);
