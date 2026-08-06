import React, { useMemo, useState } from "react";
import { MultipleChoiceOptions } from "./MultipleChoiceOptions";
import { GrammarExercise } from "../lib/appTypes";

/** Auto-growing answer box so long answers stay fully visible instead of scrolling out of a one-line input. */
const TextAnswerField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}> = ({ value, onChange, placeholder }) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      rows={2}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
      className="w-full resize-none overflow-hidden break-words px-2.5 py-2 text-xs leading-relaxed border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
      placeholder={placeholder}
    />
  );
};

/** Click-để-ghép: chọn 1 từ Đức + 1 nghĩa Việt, khớp đúng thì khoá lại. Xáo trộn 1 lần khi mount (useMemo theo `pairs`, không đổi lại giữa các lần render). */
const MatchingExercise: React.FC<{
  pairs: { de: string; vi: string }[];
  matched: Record<string, string>;
  onMatch: (de: string, vi: string) => void;
}> = ({ pairs, matched, onMatch }) => {
  const [selectedDe, setSelectedDe] = useState("");
  const [selectedVi, setSelectedVi] = useState("");
  const shuffledDe = useMemo(() => [...pairs.map((p) => p.de)].sort(() => Math.random() - 0.5), [pairs]);
  const shuffledVi = useMemo(() => [...pairs.map((p) => p.vi)].sort(() => Math.random() - 0.5), [pairs]);

  React.useEffect(() => {
    if (!selectedDe || !selectedVi) return;
    onMatch(selectedDe, selectedVi);
    setSelectedDe("");
    setSelectedVi("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDe, selectedVi]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        {shuffledDe.map((de) => {
          const isMatched = !!matched[de];
          return (
            <button
              key={de}
              type="button"
              disabled={isMatched}
              onClick={() => setSelectedDe(de)}
              className={`w-full rounded-lg border px-2 py-1.5 text-xs font-bold text-center transition-colors ${
                isMatched
                  ? "bg-green-50 border-green-200 text-green-700 opacity-60 cursor-not-allowed"
                  : selectedDe === de
                    ? "border-orange-500 bg-orange-50 text-orange-700"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {de}
            </button>
          );
        })}
      </div>
      <div className="space-y-1.5">
        {shuffledVi.map((vi) => {
          const isMatched = Object.values(matched).includes(vi);
          return (
            <button
              key={vi}
              type="button"
              disabled={isMatched}
              onClick={() => setSelectedVi(vi)}
              className={`w-full rounded-lg border px-2 py-1.5 text-xs font-semibold text-center transition-colors ${
                isMatched
                  ? "bg-green-50 border-green-200 text-green-700 opacity-60 cursor-not-allowed"
                  : selectedVi === vi
                    ? "border-orange-500 bg-orange-50 text-orange-700"
                    : "border-slate-200 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {vi}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const ExerciseAnswerInput: React.FC<{
  exercise: GrammarExercise;
  numberLabel: string;
  selectedTokens: string[];
  onToggleToken: (token: string, tokenIdx: number) => void;
  onClearTokens: () => void;
  textAnswer: string;
  onTextAnswerChange: (value: string) => void;
  itemGroups: Record<string, string>;
  onItemGroupChange: (item: string, group: string) => void;
  blankAnswers: string[];
  onBlankFocus: (blankIndex: number) => void;
  onBlankAnswerChange: (blankIndex: number, value: string) => void;
  blankResults?: boolean[];
  selectedChoice: number | undefined;
  onSelectChoice: (index: number) => void;
  choiceResult?: boolean;
  textFillBlankValues?: string[];
  onTextFillBlankChange?: (blankIndex: number, value: string) => void;
  matchedPairs?: Record<string, string>;
  onMatch?: (de: string, vi: string) => void;
}> = ({
  exercise,
  numberLabel,
  selectedTokens,
  onToggleToken,
  onClearTokens,
  textAnswer,
  onTextAnswerChange,
  itemGroups,
  onItemGroupChange,
  blankAnswers,
  onBlankFocus,
  onBlankAnswerChange,
  blankResults,
  selectedChoice,
  onSelectChoice,
  choiceResult,
  textFillBlankValues = [],
  onTextFillBlankChange,
  matchedPairs = {},
  onMatch,
}) => {
  const letter = numberLabel;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2">
      {exercise.type === "word_reorder" && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-display font-bold text-slate-400 shrink-0">{letter}</span>
            {(exercise.tokens ?? []).map((token, i) => {
              const key = `${i}:${token}`;
              const selected = selectedTokens.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => onToggleToken(token, i)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
                    selected
                      ? "bg-orange-50 border-orange-300 text-orange-700"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {token}
                </button>
              );
            })}
          </div>
          <div className="min-h-[2.5rem] p-2.5 bg-slate-50/50 rounded-lg border border-dashed border-slate-200 text-xs font-medium text-slate-800">
            {selectedTokens.length > 0
              ? selectedTokens.map((t) => t.split(":").slice(1).join(":")).join(" ")
              : "Câu của bạn sẽ hiện ở đây..."}
          </div>
          {selectedTokens.length > 0 && (
            <button onClick={onClearTokens} className="text-[11px] font-bold text-slate-400 hover:text-slate-600">
              Xóa hết
            </button>
          )}
        </>
      )}

      {exercise.type === "error_correction" && (
        <>
          <p className="text-xs bg-red-50 text-red-700 rounded-lg px-2.5 py-2">
            <span className="font-bold text-red-400">{letter}</span> {exercise.promptText}
          </p>
          <TextAnswerField value={textAnswer} onChange={onTextAnswerChange} placeholder="Nhập câu đúng..." />
        </>
      )}

      {exercise.type === "translation" && (
        <>
          <p className="text-xs bg-slate-50 text-slate-700 rounded-lg px-2.5 py-2">
            <span className="font-bold text-slate-400">{letter}</span> {exercise.promptText}
          </p>
          <TextAnswerField value={textAnswer} onChange={onTextAnswerChange} placeholder="Nhập câu tiếng Đức..." />
        </>
      )}

      {exercise.type === "sentence_transformation" && (
        <>
          <p className="text-xs bg-slate-50 text-slate-700 rounded-lg px-2.5 py-2">
            <span className="font-bold text-slate-400">{letter}</span> {exercise.promptText}
          </p>
          {exercise.transformationHint && (
            <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 uppercase">
              Yêu cầu: {exercise.transformationHint}
            </span>
          )}
          <TextAnswerField value={textAnswer} onChange={onTextAnswerChange} placeholder="Nhập câu sau khi biến đổi..." />
        </>
      )}

      {exercise.type === "guided_sentence_writing" && (
        <>
          <p className="text-xs bg-slate-50 text-slate-700 rounded-lg px-2.5 py-2">
            <span className="font-bold text-slate-400">{letter}</span> {exercise.promptText}
          </p>
          <TextAnswerField value={textAnswer} onChange={onTextAnswerChange} placeholder="Viết câu hoàn chỉnh..." />
        </>
      )}

      {exercise.type === "classification" && (
        <>
          <span className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-wider">{letter}</span>
          <div className="space-y-1.5">
            {(exercise.classificationItems ?? []).map((item) => (
              <div key={item} className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-800 flex-1">{item}</span>
                <select
                  value={itemGroups[item] ?? ""}
                  onChange={(e) => onItemGroupChange(item, e.target.value)}
                  className="px-2 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                >
                  <option value="">-- Chọn nhóm --</option>
                  {(exercise.classificationGroups ?? []).map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </>
      )}

      {exercise.type === "fill_in_the_blank" && (
        <div className="text-xs leading-9 text-slate-700">
          <span className="mr-1 font-bold text-slate-400">{letter}</span>
          {(exercise.promptText ?? "").split("___").map((segment, index, segments) => (
            <React.Fragment key={`${index}:${segment}`}>
              <span className="whitespace-pre-wrap">{segment}</span>
              {index < segments.length - 1 && (
                <input
                  type="text"
                  value={blankAnswers[index] ?? ""}
                  onFocus={() => onBlankFocus(index)}
                  onChange={(event) => onBlankAnswerChange(index, event.target.value)}
                  className={`mx-1 inline-block w-28 rounded-lg border px-2 py-1.5 text-center text-xs focus:outline-none focus:ring-2 ${
                    blankResults?.[index] === true
                      ? "border-green-400 bg-green-50 text-green-800 focus:ring-green-500/20"
                      : blankResults?.[index] === false
                        ? "border-red-400 bg-red-50 text-red-800 focus:ring-red-500/20"
                        : "border-slate-200 bg-white focus:border-orange-500 focus:ring-orange-500/20"
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {exercise.type === "multiple_choice" && (
        <>
          <p className="text-xs bg-slate-50 text-slate-700 rounded-lg px-2.5 py-2">
            <span className="font-bold text-slate-400">{letter}</span> {exercise.promptText}
          </p>
          <MultipleChoiceOptions
            options={exercise.options ?? []}
            selectedIndex={selectedChoice}
            onSelect={onSelectChoice}
            exerciseId={exercise.id}
            result={choiceResult}
          />
        </>
      )}

      {exercise.type === "text_fill_blank" && (
        <div className="text-xs leading-9 text-slate-700">
          <span className="mr-1 font-bold text-slate-400">{letter}</span>
          {(exercise.promptText ?? "").split(/\{\{[^}]*\}\}/).map((segment, index, segments) => (
            <React.Fragment key={`${index}:${segment}`}>
              <span className="whitespace-pre-wrap">{segment}</span>
              {index < segments.length - 1 && (
                <input
                  type="text"
                  value={textFillBlankValues[index] ?? ""}
                  onChange={(event) => onTextFillBlankChange?.(index, event.target.value)}
                  className="mx-1 inline-block w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {exercise.type === "matching" && (
        <>
          <span className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-wider">{letter}</span>
          <MatchingExercise
            pairs={exercise.matchingPairs ?? []}
            matched={matchedPairs}
            onMatch={(de, vi) => onMatch?.(de, vi)}
          />
        </>
      )}
    </div>
  );
};
