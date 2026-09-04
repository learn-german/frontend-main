import React from "react";
import { optionLabel } from "../lib/grammarMultipleChoice";

export const MultipleChoiceOptions: React.FC<{
  options: string[];
  selectedIndex: number | undefined;
  onSelect: (index: number) => void;
  exerciseId: string;
  result?: boolean;
  /** Chỉ truyền khi đã revealed — tô xanh phương án đúng dù học viên không chọn nó. */
  correctIndex?: number;
  layout?: "vertical" | "horizontal";
}> = ({ options, selectedIndex, onSelect, exerciseId, result, correctIndex, layout = "vertical" }) => {
  const groupCls = layout === "horizontal" ? "flex flex-wrap gap-2" : "space-y-1.5";

  return (
    <div role="radiogroup" className={groupCls}>
      {options.map((option, index) => {
        const selected = selectedIndex === index;
        const stateCls = selected
          ? result === true
            ? "border-green-400 bg-green-50 text-green-800"
            : result === false
              ? "border-red-400 bg-red-50 text-red-800"
              : "border-orange-300 bg-orange-50 text-orange-700"
          : correctIndex === index
            ? "border-green-400 bg-green-50 text-green-800"
            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
        const buttonCls = layout === "horizontal"
          ? "inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition-colors"
          : "flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-xs transition-colors";
        const labelCls = "whitespace-pre-wrap";
        return (
          <button
            key={`${exerciseId}:${index}`}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(index)}
            className={`${buttonCls} ${stateCls}`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[10px] font-display font-bold">
              {optionLabel(index)}
            </span>
            <span className={labelCls}>{option}</span>
          </button>
        );
      })}
    </div>
  );
};
