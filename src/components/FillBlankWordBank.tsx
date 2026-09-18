import React from "react";
import {
  WORD_BANK_DRAG_MIME,
  type WordBank,
  type WordBankMode,
} from "../lib/grammarFillInBlank";

interface FillBlankWordBankProps {
  wordBank: WordBank;
  usedWordIndexes: ReadonlySet<number>;
  onChipActivate: (wordIndex: number, word: string, mode: WordBankMode) => void;
}

/** Word-bank chips: drag onto blanks (primary) or click to fill focused/next blank. */
export const FillBlankWordBank: React.FC<FillBlankWordBankProps> = ({
  wordBank,
  usedWordIndexes,
  onChipActivate,
}) => (
  <div className="space-y-2">
    <p className="text-[11px] font-bold text-orange-700/80">
      Kéo từ vào ô trống (hoặc bấm để điền ô đang chọn)
    </p>
    <div className="flex flex-wrap gap-2 rounded-xl border border-orange-100 bg-orange-50/50 p-3">
      {wordBank.words.map((word, wordIndex) => {
        const used = usedWordIndexes.has(wordIndex);
        const disabled = wordBank.mode === "single_use" && used;
        return (
          <button
            key={`${wordIndex}:${word}`}
            type="button"
            disabled={disabled}
            draggable={!disabled}
            onDragStart={(event) => {
              if (disabled) {
                event.preventDefault();
                return;
              }
              event.dataTransfer.setData(WORD_BANK_DRAG_MIME, String(wordIndex));
              event.dataTransfer.setData("text/plain", word);
              event.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => {
              if (disabled) return;
              onChipActivate(wordIndex, word, wordBank.mode);
            }}
            className={`cursor-grab rounded-full border px-3 py-1.5 text-xs font-bold transition active:cursor-grabbing ${
              used
                ? "border-orange-200 bg-orange-100 text-orange-500 opacity-60"
                : "border-orange-300 bg-white text-orange-700 hover:bg-orange-100"
            } disabled:cursor-not-allowed`}
          >
            {word}
          </button>
        );
      })}
    </div>
  </div>
);
