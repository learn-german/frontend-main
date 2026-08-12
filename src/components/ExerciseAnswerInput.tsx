import React, { useMemo, useState } from "react";
import { MultipleChoiceOptions } from "./MultipleChoiceOptions";
import { GrammarExercise } from "../lib/appTypes";
import { parseAnswer, type ParsedAnswer } from "../lib/grammarAnswerCodec";

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
  matchedPairs = {},
  onMatch,
}) => {
  const letter = numberLabel;
  const [selectedClassificationItem, setSelectedClassificationItem] = useState<string | null>(null);

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
          <div className="flex flex-wrap gap-1.5">
            {(exercise.classificationItems ?? [])
              .filter((item) => !itemGroups[item])
              .map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setSelectedClassificationItem((prev) => (prev === item ? null : item))}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    selectedClassificationItem === item
                      ? "bg-orange-50 border-orange-400 text-orange-700"
                      : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {item}
                </button>
              ))}
            {(exercise.classificationItems ?? []).length > 0 &&
              (exercise.classificationItems ?? []).every((item) => itemGroups[item]) && (
                <span className="text-[11px] text-slate-400 italic">Đã xếp hết</span>
              )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(exercise.classificationGroups ?? []).map((group) => (
              <button
                key={group}
                type="button"
                onClick={() => {
                  if (!selectedClassificationItem) return;
                  onItemGroupChange(selectedClassificationItem, group);
                  setSelectedClassificationItem(null);
                }}
                className={`rounded-lg border p-2 text-left transition-colors ${
                  selectedClassificationItem ? "border-orange-300 bg-orange-50/40 animate-pulse" : "border-slate-200 bg-slate-50/50"
                }`}
              >
                <span className="block text-xs font-bold text-slate-700 uppercase mb-1">{group}</span>
                <div className="flex flex-wrap gap-1">
                  {(exercise.classificationItems ?? [])
                    .filter((item) => itemGroups[item] === group)
                    .map((item) => (
                      <span
                        key={item}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedClassificationItem((prev) => (prev === item ? null : item));
                        }}
                        className={`px-2 py-1 rounded-md border text-xs cursor-pointer transition-colors ${
                          selectedClassificationItem === item
                            ? "bg-orange-50 border-orange-400 text-orange-700"
                            : "bg-white border-slate-200 text-slate-700 hover:border-orange-300"
                        }`}
                      >
                        {item}
                      </span>
                    ))}
                </div>
              </button>
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

/** Read-only echo of what the learner typed, tinted by whether it was graded correct. */
export const SubmittedAnswer: React.FC<{ value: string; correct: boolean | undefined }> = ({
  value,
  correct,
}) => (
  <div
    className={`mb-2 rounded-lg border px-2.5 py-2 text-xs font-medium whitespace-pre-wrap ${
      correct === true
        ? "border-green-300 bg-green-50 text-green-800"
        : correct === false
          ? "border-red-300 bg-red-50 text-red-800"
          : "border-slate-200 bg-slate-50 text-slate-700"
    }`}
  >
    <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wider opacity-60">
      Bài làm của bạn
    </span>
    {value.trim() ? value : "— chưa trả lời —"}
  </div>
);

/** Đáp án đúng cho classification, parse từ correctAnswerRaw (wire format
 * "item:group|...") — chỉ có giá trị thật khi revealed, dùng thẳng
 * parseAnswer thay vì viết lại logic split/parse riêng. */
function getCorrectGroups(exercise: GrammarExercise, correctAnswerRaw: string | undefined): Record<string, string> {
  if (!correctAnswerRaw) return {};
  const parsed: ParsedAnswer = parseAnswer(exercise, correctAnswerRaw);
  return parsed.kind === "groups" ? parsed.values : {};
}

/** Đáp án đúng cho fill_in_the_blank, parse từ correctAnswerRaw (JSON array)
 * — chỉ có giá trị thật khi revealed. */
function getCorrectBlanks(exercise: GrammarExercise, correctAnswerRaw: string | undefined): string[] {
  if (!correctAnswerRaw) return [];
  const parsed: ParsedAnswer = parseAnswer(exercise, correctAnswerRaw);
  return parsed.kind === "blanks" ? parsed.values : [];
}

export const ExerciseResultReview: React.FC<{
  exercise: GrammarExercise;
  numberLabel: string;
  revealed: boolean;
  submittedText: string;
  exerciseCorrect: boolean | undefined;
  correctAnswerRaw: string | undefined;
  userGroups: Record<string, string>;
  classificationResults: boolean[] | undefined;
  blankValues: string[];
  blankResults: boolean[] | undefined;
  selectedChoice: number | undefined;
  choiceResult: boolean | undefined;
  matchedPairs: Record<string, string>;
  explanation: string | undefined;
}> = ({
  exercise,
  numberLabel,
  revealed,
  submittedText,
  exerciseCorrect,
  correctAnswerRaw,
  userGroups,
  classificationResults,
  blankValues,
  blankResults,
  selectedChoice,
  choiceResult,
  matchedPairs,
  explanation,
}) => (
  <div className="p-3 rounded-xl border border-slate-100 bg-slate-50/40 text-xs">
    <p className="font-display font-bold text-slate-800 leading-tight mb-1 whitespace-pre-wrap">
      {numberLabel} {exercise.promptText ?? "Phân loại"}
    </p>

    {(exercise.type === "word_reorder"
      || exercise.type === "error_correction"
      || exercise.type === "translation"
      || exercise.type === "sentence_transformation"
      || exercise.type === "guided_sentence_writing") && (
      <>
        <SubmittedAnswer value={submittedText} correct={exerciseCorrect} />
        {revealed && exerciseCorrect === false && (
          <p className="mb-2 text-[11px] text-green-700">
            <b>Đáp án đúng:</b> {correctAnswerRaw || "—"}
          </p>
        )}
      </>
    )}

    {exercise.type === "classification" && (
      <div className="mb-2 space-y-2">
        {(exercise.classificationGroups ?? []).map((group) => {
          const itemsInGroup = (exercise.classificationItems ?? []).filter((item) => userGroups[item] === group);
          if (itemsInGroup.length === 0) return null;
          return (
            <div key={group} className="rounded-lg border border-slate-200 bg-white p-2">
              <span className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{group}</span>
              <div className="flex flex-wrap gap-1.5">
                {itemsInGroup.map((item) => {
                  const itemIndex = (exercise.classificationItems ?? []).indexOf(item);
                  const correctGroup = revealed ? getCorrectGroups(exercise, correctAnswerRaw)[item] : undefined;
                  const isCorrect = classificationResults?.[itemIndex] ?? false;
                  return (
                    <span
                      key={item}
                      className={`rounded-md border px-2 py-1 text-xs font-bold ${
                        isCorrect
                          ? "border-green-300 bg-green-50 text-green-700"
                          : "border-red-300 bg-red-50 text-red-700"
                      }`}
                    >
                      {item}
                      {revealed && !isCorrect && correctGroup && (
                        <span className="ml-1 text-[10px] text-green-700">→ {correctGroup}</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
        {(() => {
          const unanswered = (exercise.classificationItems ?? []).filter((item) => !userGroups[item]);
          if (unanswered.length === 0) return null;
          return (
            <div className="rounded-lg border border-dashed border-slate-200 p-2">
              <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Chưa trả lời</span>
              <div className="flex flex-wrap gap-1.5">
                {unanswered.map((item) => (
                  <span key={item} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    )}

    {exercise.type === "fill_in_the_blank" && (
      <div className="mb-2 text-xs leading-9 text-slate-700">
        {(exercise.promptText ?? "")
          .split("___")
          .map((segment, index, segments) => {
            const isCorrect = blankResults?.[index];
            const correctBlank = revealed ? getCorrectBlanks(exercise, correctAnswerRaw)[index] : undefined;
            return (
              <React.Fragment key={`${index}:${segment}`}>
                <span className="whitespace-pre-wrap">{segment}</span>
                {index < segments.length - 1 && (
                  <>
                    <span className={`mx-1 inline-block min-w-20 rounded-md border px-2 py-1 text-center font-bold ${
                      isCorrect
                        ? "border-green-300 bg-green-50 text-green-700"
                        : "border-red-300 bg-red-50 text-red-700"
                    }`}>
                      {blankValues[index] ?? "—"}
                    </span>
                    {revealed && !isCorrect && correctBlank && (
                      <span className="mx-1 inline-block min-w-20 rounded-md border border-green-300 bg-green-50 px-2 py-1 text-center font-bold text-green-700">
                        {correctBlank}
                      </span>
                    )}
                  </>
                )}
              </React.Fragment>
            );
          })}
      </div>
    )}

    {exercise.type === "multiple_choice" && (
      <div className="mb-2">
        <MultipleChoiceOptions
          options={exercise.options ?? []}
          selectedIndex={selectedChoice}
          onSelect={() => {}}
          exerciseId={exercise.id}
          result={choiceResult}
          correctIndex={revealed ? Number(correctAnswerRaw) : undefined}
        />
      </div>
    )}

    {exercise.type === "matching" && (
      <div className="mb-2 space-y-1">
        {(exercise.matchingPairs ?? []).map((pair) => {
          const userVi = matchedPairs[pair.de];
          const isRight = userVi === pair.vi;
          return (
            <div key={pair.de} className="flex items-center gap-2 text-xs">
              <span className="flex-1 text-slate-700">{pair.de}</span>
              <span
                className={`rounded-md border px-2 py-1 font-bold ${
                  isRight
                    ? "border-green-300 bg-green-50 text-green-700"
                    : "border-red-300 bg-red-50 text-red-700"
                }`}
              >
                {userVi ?? "—"}
              </span>
              {revealed && !isRight && (
                <span className="rounded-md border border-green-300 bg-green-50 px-2 py-1 font-bold text-green-700">
                  {pair.vi}
                </span>
              )}
            </div>
          );
        })}
      </div>
    )}

    {explanation && (
      <p className="text-slate-500 text-[11px] leading-relaxed">
        <b>Giải thích:</b> {explanation}
      </p>
    )}
  </div>
);
