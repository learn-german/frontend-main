import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Lightbulb } from "lucide-react";

interface GrammarExerciseHintProps {
  hint?: string;
  groupKey: string;
}

export const GrammarExerciseHint: React.FC<GrammarExerciseHintProps> = ({ hint, groupKey }) => {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [groupKey]);

  if (!hint?.trim()) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 overflow-hidden">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-display font-bold text-amber-800 hover:bg-amber-100/60 transition-colors"
      >
        <Lightbulb className="w-4 h-4 shrink-0" />
        <span className="flex-1">{expanded ? "Ẩn gợi ý" : "Xem gợi ý"}</span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {expanded && (
        <p className="border-t border-amber-200 px-4 py-3 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap break-words">
          {hint}
        </p>
      )}
    </div>
  );
};
