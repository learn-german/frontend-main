# Phase 1 — Shared Exercise Answer Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Học viên nhập được đủ 10 loại câu hỏi (không chỉ 3) ở nghe/đọc, dùng chung logic render + serialize với ngữ pháp, không đổi hành vi ngữ pháp hiện có.

**Architecture:** Mở rộng `grammarAnswerCodec.ts` để `serializeAnswer`/`parseAnswer`/`parseAnswersIntoFormState` phủ thêm `text_fill_blank` và `matching` (dùng lại helper sẵn có trong `quizAnswerCodec.ts`). Tách `ExerciseCard` khỏi `GrammarExercisePage.tsx` thành `src/components/ExerciseAnswerInput.tsx`, thêm 2 nhánh còn thiếu, dùng ở cả `GrammarExercisePage.tsx` và `QuizSetListPage.tsx`.

**Tech Stack:** React 19 + TypeScript 5.8. Test bằng `node:test` qua `npx tsx --test <path>`.

## Global Constraints

- Không dùng `any`.
- Ngữ pháp không đổi hành vi hiện có (không có exercise `text_fill_blank`/`matching` thực tế, nhưng props mới phải optional-safe).
- Chỉ phần **nhập bài làm** (pre-submit) — không đụng phần hiển thị kết quả sau khi nộp (Phase 2) ở cả 2 file.
- Word-bank chip gợi ý (`fill_in_the_blank` có word bank) giữ nguyên là tính năng riêng của `GrammarExercisePage.tsx`, không port sang Quiz.
- Chạy `npm run lint` sau mỗi task đụng TypeScript.

---

### Task 1: `countBlankTokens` chuyển vào `quizAnswerCodec.ts`

**Files:**
- Modify: `src/lib/quizAnswerCodec.ts`
- Modify: `src/lib/quizAnswerCodec.test.ts`
- Modify: `src/pages/QuizSetListPage.tsx:50-52` (xoá định nghĩa cũ, import từ quizAnswerCodec thay vì tự định nghĩa)

**Interfaces:**
- Produces: `countBlankTokens(promptText: string): number` (dùng đếm số `{{blank}}` trong prompt — khác `countBlankMarkers` trong `grammarFillInBlank.ts` vốn đếm `___`).

- [ ] **Step 1: Write the failing test** — thêm vào cuối `src/lib/quizAnswerCodec.test.ts`:

```ts
test("countBlankTokens: đếm đúng số {{blank}} trong prompt", () => {
  assert.equal(countBlankTokens("Ich {{blank}} und du {{blank}}."), 2);
  assert.equal(countBlankTokens("Không có ô trống."), 0);
});
```

Và sửa import ở đầu file test thành:
```ts
import { joinBlankAnswers, splitBlankAnswers, serializeMatching, parseMatching, countBlankTokens } from "./quizAnswerCodec";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/quizAnswerCodec.test.ts`
Expected: FAIL — `countBlankTokens is not a function` (hoặc export không tồn tại)

- [ ] **Step 3: Write minimal implementation** — thêm vào `src/lib/quizAnswerCodec.ts`:

```ts
/** Đếm số ô {{blank}} trong prompt_text của text_fill_blank. */
export function countBlankTokens(promptText: string): number {
  return (promptText.match(/\{\{blank\}\}/g) ?? []).length;
}
```

- [ ] **Step 4: Xoá định nghĩa cũ trong `QuizSetListPage.tsx`** — xoá đúng khối này (dòng 50-52):

```ts
function countBlankTokens(promptText: string): number {
  return (promptText.match(/\{\{blank\}\}/g) ?? []).length;
}
```

Thêm `countBlankTokens` vào import từ `quizAnswerCodec` đã có sẵn ở đầu file (dòng 16):

```ts
import { joinBlankAnswers, splitBlankAnswers, serializeMatching, parseMatching, countBlankTokens } from "../lib/quizAnswerCodec";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --test src/lib/quizAnswerCodec.test.ts`
Expected: PASS

- [ ] **Step 6: `npm run lint` phải pass**

- [ ] **Step 7: Commit**

```bash
git add src/lib/quizAnswerCodec.ts src/lib/quizAnswerCodec.test.ts src/pages/QuizSetListPage.tsx
git commit -m "refactor: move countBlankTokens into quizAnswerCodec.ts"
```

---

### Task 2: Mở rộng `grammarAnswerCodec.ts` phủ `text_fill_blank` và `matching`

**Files:**
- Modify: `src/lib/grammarAnswerCodec.ts`
- Modify: `src/lib/grammarAnswerCodec.test.ts`

**Interfaces:**
- Consumes: `countBlankTokens`, `joinBlankAnswers`, `splitBlankAnswers`, `serializeMatching`, `parseMatching` từ `./quizAnswerCodec` (Task 1).
- Produces: `ParsedAnswer` thêm variant `{ kind: "matching"; values: Record<string, string> }`; `ParsedFormState` thêm field `matchedPairs: Record<string, Record<string, string>>`.

- [ ] **Step 1: Write the failing test** — thêm vào cuối `src/lib/grammarAnswerCodec.test.ts`:

```ts
const textFillBlank = (over: Partial<GrammarExercise> = {}): GrammarExercise =>
  base({ id: "tfb1", type: "text_fill_blank", promptText: "Ich {{blank}} und du {{blank}}.", ...over });

const matching = (over: Partial<GrammarExercise> = {}): GrammarExercise =>
  base({
    id: "m1",
    type: "matching",
    matchingPairs: [{ de: "der Tisch", vi: "cái bàn" }, { de: "die Lampe", vi: "cái đèn" }],
    ...over,
  });

test("text_fill_blank: round-trip qua joinBlankAnswers/splitBlankAnswers", () => {
  const ex = textFillBlank();
  const raw = "bin|bist";
  assert.deepEqual(parseAnswer(ex, raw), { kind: "blanks", values: ["bin", "bist"] });
  assert.equal(serializeAnswer(ex, { kind: "blanks", values: ["bin", "bist"] }), raw);
});

test("text_fill_blank: thiếu 1 ô thì serialize ra chuỗi rỗng", () => {
  const ex = textFillBlank();
  assert.equal(serializeAnswer(ex, { kind: "blanks", values: ["bin", "  "] }), "");
});

test("matching: round-trip qua serializeMatching/parseMatching", () => {
  const ex = matching();
  const raw = "der Tisch:cái bàn|die Lampe:cái đèn";
  assert.deepEqual(parseAnswer(ex, raw), {
    kind: "matching",
    values: { "der Tisch": "cái bàn", "die Lampe": "cái đèn" },
  });
  assert.equal(serializeAnswer(ex, parseAnswer(ex, raw)), raw);
});

test("matching: chưa ghép hết cặp thì serialize ra chuỗi rỗng", () => {
  const ex = matching();
  assert.equal(serializeAnswer(ex, { kind: "matching", values: { "der Tisch": "cái bàn" } }), "");
});

test("emptyAnswer: text_fill_blank và matching", () => {
  assert.deepEqual(emptyAnswer(textFillBlank()), { kind: "blanks", values: ["", ""] });
  assert.deepEqual(emptyAnswer(matching()), { kind: "matching", values: {} });
});

test("parseAnswersIntoFormState: matching phục hồi vào matchedPairs", () => {
  const exercises = [matching()];
  const result = parseAnswersIntoFormState(exercises, { m1: "der Tisch:cái bàn|die Lampe:cái đèn" });
  assert.deepEqual(result.matchedPairs.m1, { "der Tisch": "cái bàn", "die Lampe": "cái đèn" });
});
```

Cập nhật import ở đầu `grammarAnswerCodec.test.ts` — thêm `emptyAnswer` nếu chưa có (đã có sẵn theo test cũ), không cần đổi gì khác.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/grammarAnswerCodec.test.ts`
Expected: FAIL — `type "matching"` chưa được `parseAnswer`/`serializeAnswer` xử lý (rơi vào nhánh mặc định sai), `result.matchedPairs` là `undefined`.

- [ ] **Step 3: Write minimal implementation** — sửa `src/lib/grammarAnswerCodec.ts`:

Thêm import ở đầu file:
```ts
import { countBlankTokens, joinBlankAnswers, splitBlankAnswers, serializeMatching, parseMatching } from "./quizAnswerCodec";
```

Sửa `ParsedAnswer`:
```ts
export type ParsedAnswer =
  | { kind: "text"; value: string }
  | { kind: "blanks"; values: string[] }
  | { kind: "choice"; index: number | undefined }
  | { kind: "groups"; values: Record<string, string> }
  | { kind: "matching"; values: Record<string, string> };
```

Sửa `emptyAnswer` — thêm 2 nhánh trước dòng `return { kind: "text", value: "" };`:
```ts
  if (exercise.type === "text_fill_blank") {
    return { kind: "blanks", values: Array(countBlankTokens(exercise.promptText ?? "")).fill("") };
  }
  if (exercise.type === "matching") return { kind: "matching", values: {} };
```

Sửa `serializeAnswer` — thêm 2 nhánh trước `if (answer.kind !== "text") return "";`:
```ts
  if (exercise.type === "text_fill_blank") {
    if (answer.kind !== "blanks") return "";
    const blankCount = countBlankTokens(exercise.promptText ?? "");
    if (blankCount === 0 || answer.values.length !== blankCount) return "";
    if (answer.values.some((value) => !value.trim())) return "";
    return joinBlankAnswers(answer.values);
  }

  if (exercise.type === "matching") {
    if (answer.kind !== "matching") return "";
    const total = exercise.matchingPairs?.length ?? 0;
    if (total === 0 || Object.keys(answer.values).length < total) return "";
    return serializeMatching(answer.values);
  }
```

Sửa `parseAnswer` — thêm 2 nhánh trước `return { kind: "text", value: raw };`:
```ts
  if (exercise.type === "text_fill_blank") {
    const blankCount = countBlankTokens(exercise.promptText ?? "");
    return { kind: "blanks", values: splitBlankAnswers(raw, blankCount) };
  }

  if (exercise.type === "matching") {
    return { kind: "matching", values: parseMatching(raw) };
  }
```

Sửa `ParsedFormState`:
```ts
export interface ParsedFormState {
  textAnswers: Record<string, string>;
  blankAnswers: Record<string, string[]>;
  itemGroups: Record<string, Record<string, string>>;
  choices: Record<string, number>;
  selectedTokens: Record<string, string[]>;
  matchedPairs: Record<string, Record<string, string>>;
}
```

Sửa `parseAnswersIntoFormState`:
```ts
export function parseAnswersIntoFormState(
  exercises: GrammarExercise[],
  answers: Record<string, string>,
): ParsedFormState {
  const textAnswers: Record<string, string> = {};
  const blankAnswers: Record<string, string[]> = {};
  const itemGroups: Record<string, Record<string, string>> = {};
  const choices: Record<string, number> = {};
  const selectedTokens: Record<string, string[]> = {};
  const matchedPairs: Record<string, Record<string, string>> = {};

  for (const exercise of exercises) {
    const raw = answers[exercise.id];
    const parsed: ParsedAnswer = raw === undefined ? emptyAnswer(exercise) : parseAnswer(exercise, raw);
    if (parsed.kind === "text") {
      textAnswers[exercise.id] = parsed.value;
      if (exercise.type === "word_reorder") {
        selectedTokens[exercise.id] = reconstructWordReorderTokens(exercise.tokens ?? [], parsed.value);
      }
    } else if (parsed.kind === "blanks") blankAnswers[exercise.id] = parsed.values;
    else if (parsed.kind === "groups") itemGroups[exercise.id] = parsed.values;
    else if (parsed.kind === "matching") matchedPairs[exercise.id] = parsed.values;
    else if (parsed.index !== undefined) choices[exercise.id] = parsed.index;
  }

  return { textAnswers, blankAnswers, itemGroups, choices, selectedTokens, matchedPairs };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/grammarAnswerCodec.test.ts`
Expected: PASS — toàn bộ test cũ + mới đều xanh.

- [ ] **Step 5: `npm run lint` phải pass**

- [ ] **Step 6: Commit**

```bash
git add src/lib/grammarAnswerCodec.ts src/lib/grammarAnswerCodec.test.ts
git commit -m "feat: extend grammarAnswerCodec to cover text_fill_blank and matching"
```

---

### Task 3: Tách `ExerciseAnswerInput` thành component dùng chung

**Files:**
- Create: `src/components/ExerciseAnswerInput.tsx`
- Modify: `src/pages/GrammarExercisePage.tsx:79-291` (xoá `TextAnswerField`, `ExerciseCard`, import từ file mới)

**Interfaces:**
- Consumes: `MultipleChoiceOptions` từ `./MultipleChoiceOptions` (đã có).
- Produces: `ExerciseAnswerInput` (React component, export), `MatchingExercise` (export, dùng lại ở Task 5).

- [ ] **Step 1: Tạo file mới** — copy nguyên `TextAnswerField` (dòng 79-107) và `ExerciseCard` (dòng 109-291) từ `GrammarExercisePage.tsx` sang, đổi tên `ExerciseCard` → `ExerciseAnswerInput`, export, thêm 4 prop mới + 2 nhánh JSX, copy `MatchingExercise` từ `QuizSetListPage.tsx` (dòng 55-121) vào cuối file (không export, chỉ dùng nội bộ):

```tsx
// src/components/ExerciseAnswerInput.tsx
import React, { useMemo, useState } from "react";
import { MultipleChoiceOptions } from "./MultipleChoiceOptions";
import { GrammarExercise } from "../lib/appTypes";
import { countBlankTokens } from "../lib/quizAnswerCodec";

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
          {(exercise.promptText ?? "").split("{{blank}}").map((segment, index, segments) => (
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
```

- [ ] **Step 2: Xoá `TextAnswerField` và `ExerciseCard` khỏi `GrammarExercisePage.tsx`** (dòng 79-291) — thay bằng import:

```ts
import { ExerciseAnswerInput } from "../components/ExerciseAnswerInput";
```

- [ ] **Step 3: Đổi tên chỗ dùng `ExerciseCard` trong `renderGroupContent`** (dòng ~797) thành `ExerciseAnswerInput` — không đổi prop nào khác, vẫn đúng interface cũ (4 prop mới đều optional).

- [ ] **Step 4: `npm run lint` phải pass**

- [ ] **Step 5: Commit**

```bash
git add src/components/ExerciseAnswerInput.tsx src/pages/GrammarExercisePage.tsx
git commit -m "refactor: extract ExerciseAnswerInput as shared component, add text_fill_blank/matching"
```

---

### Task 4: Xác nhận ngữ pháp không đổi hành vi

**Files:** không sửa code — chỉ chạy test + lint.

- [ ] **Step 1: Chạy toàn bộ test suite**

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts"`
Expected: PASS toàn bộ (không có test nào fail do refactor Task 3).

- [ ] **Step 2: `npm run lint` trên toàn repo**

Expected: 0 lỗi.

- [ ] **Step 3: Commit** (chỉ nếu có thay đổi nhỏ phát sinh khi sửa lint — thường không cần)

---

### Task 5: Wire `QuizSetListPage.tsx` dùng chung `ExerciseAnswerInput` + `grammarAnswerCodec`

**Files:**
- Modify: `src/pages/QuizSetListPage.tsx`

**Interfaces:**
- Consumes: `ExerciseAnswerInput` (Task 3); `parseAnswersIntoFormState`, `parseAnswer`, `serializeAnswer`, `emptyAnswer`, `type ParsedAnswer` từ `../lib/grammarAnswerCodec` (Task 2); `reconstructWordReorderTokens` không cần import trực tiếp (đã dùng nội bộ trong `parseAnswersIntoFormState`).

- [ ] **Step 1: Xoá `MatchingExercise` định nghĩa cục bộ** (dòng 55-121) — đã chuyển sang `ExerciseAnswerInput.tsx`.

- [ ] **Step 2: Sửa import ở đầu file** — xoá `MultipleChoiceOptions` nếu không còn dùng trực tiếp (kiểm tra: vẫn dùng ở result card dòng 355/475 — GIỮ LẠI), thêm:

```ts
import { ExerciseAnswerInput } from "../components/ExerciseAnswerInput";
import { parseAnswer, parseAnswersIntoFormState, serializeAnswer, emptyAnswer, type ParsedAnswer } from "../lib/grammarAnswerCodec";
```

- [ ] **Step 3: Thêm state còn thiếu trong `QuizExerciseSetBody`** (sau dòng 137, cạnh `matchedPairsByExercise`) — đặt đúng tên khớp `GrammarExercisePage.tsx` để 2 nơi cùng shape dữ liệu:

```ts
  const [selectedTokensByExercise, setSelectedTokensByExercise] = useState<Record<string, string[]>>({});
  const [textAnswerByExercise, setTextAnswerByExercise] = useState<Record<string, string>>({});
  const [itemGroupsByExercise, setItemGroupsByExercise] = useState<Record<string, Record<string, string>>>({});
  const [blankAnswersByExercise, setBlankAnswersByExercise] = useState<Record<string, string[]>>({});
```

(giữ nguyên `choiceByExercise`, `blankValuesByExercise` — dùng cho `text_fill_blank`, đổi tên biến này thành `textFillBlankByExercise` cho rõ nghĩa không lẫn với `blankAnswersByExercise` của `fill_in_the_blank`: đổi mọi chỗ dùng `blankValuesByExercise`/`setBlankValuesByExercise` trong file thành `textFillBlankByExercise`/`setTextFillBlankByExercise`.)

- [ ] **Step 4: Thay `applyAnswers` bằng `parseAnswersIntoFormState`** — xoá toàn bộ hàm `applyAnswers` (dòng 147-164), thay 2 chỗ gọi nó bằng:

```ts
  const applyAnswers = (answers: Record<string, string>) => {
    const parsed = parseAnswersIntoFormState(exercises, answers);
    setTextAnswerByExercise(parsed.textAnswers);
    setSelectedTokensByExercise(parsed.selectedTokens);
    setItemGroupsByExercise(parsed.itemGroups);
    setChoiceByExercise(parsed.choices);
    setMatchedPairsByExercise(parsed.matchedPairs);
    // blankAnswers dùng chung cho cả fill_in_the_blank (ngữ pháp) lẫn
    // text_fill_blank — tách theo type vì 2 loại serialize khác nhau
    // (JSON.stringify vs joinBlankAnswers), parseAnswersIntoFormState gộp
    // chung vào 1 field theo đúng field đã định nghĩa ở Task 2.
    const grammarBlanks: Record<string, string[]> = {};
    const quizBlanks: Record<string, string[]> = {};
    for (const exercise of exercises) {
      const values = parsed.blankAnswers[exercise.id];
      if (!values) continue;
      if (exercise.type === "fill_in_the_blank") grammarBlanks[exercise.id] = values;
      else if (exercise.type === "text_fill_blank") quizBlanks[exercise.id] = values;
    }
    setBlankAnswersByExercise(grammarBlanks);
    setTextFillBlankByExercise(quizBlanks);
  };
```

(giữ nguyên chữ ký hàm `applyAnswers(answers)` và 2 chỗ gọi nó ở 2 effect hydrate — không đổi gì khác ở đó.)

- [ ] **Step 5: Thay `getAnswerStringFor`/`collectAllAnswers`** (dòng 198-220) bằng cách dùng `serializeAnswer` giống `GrammarExercisePage.tsx`:

```ts
  const getParsedAnswerFor = (exercise: GrammarExercise): ParsedAnswer => {
    if (exercise.type === "word_reorder") {
      const tokens = selectedTokensByExercise[exercise.id] ?? [];
      return { kind: "text", value: tokens.map((t) => t.split(":").slice(1).join(":")).join(" ") };
    }
    if (exercise.type === "classification") {
      return { kind: "groups", values: itemGroupsByExercise[exercise.id] ?? {} };
    }
    if (exercise.type === "fill_in_the_blank") {
      const blankCount = countBlankMarkers(exercise.promptText ?? "");
      return { kind: "blanks", values: blankAnswersByExercise[exercise.id] ?? Array(blankCount).fill("") };
    }
    if (exercise.type === "text_fill_blank") {
      const count = countBlankTokens(exercise.promptText ?? "");
      return { kind: "blanks", values: textFillBlankByExercise[exercise.id] ?? Array(count).fill("") };
    }
    if (exercise.type === "multiple_choice") {
      return { kind: "choice", index: choiceByExercise[exercise.id] };
    }
    if (exercise.type === "matching") {
      return { kind: "matching", values: matchedPairsByExercise[exercise.id] ?? {} };
    }
    return { kind: "text", value: textAnswerByExercise[exercise.id] ?? "" };
  };

  const getAnswerStringFor = (exercise: GrammarExercise): string =>
    serializeAnswer(exercise, getParsedAnswerFor(exercise));

  const allAnswered = exercises.every((exercise) => getAnswerStringFor(exercise) !== "");
  const collectAllAnswers = (): Record<string, string> =>
    Object.fromEntries(exercises.map((exercise) => [exercise.id, getAnswerStringFor(exercise)]));
```

Thêm import `countBlankMarkers` từ `../lib/grammarFillInBlank` (cho `fill_in_the_blank`).

- [ ] **Step 6: Sửa autosave debounce effect** (dòng 222-231) — thêm state mới vào dependency array:

```ts
  React.useEffect(() => {
    if (result !== null || exercises.length === 0) return;
    const timer = setTimeout(() => {
      saveDraft(collectAllAnswers()).then(({ error }) => {
        if (!error) onDraftSaved(true);
      });
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choiceByExercise, textFillBlankByExercise, matchedPairsByExercise, selectedTokensByExercise, textAnswerByExercise, itemGroupsByExercise, blankAnswersByExercise, result]);
```

- [ ] **Step 7: Sửa `handleRetry`** (dòng 253-261) — reset đủ state mới:

```ts
  const handleRetry = () => {
    submissionIdRef.current = crypto.randomUUID();
    setChoiceByExercise({});
    setTextFillBlankByExercise({});
    setMatchedPairsByExercise({});
    setSelectedTokensByExercise({});
    setTextAnswerByExercise({});
    setItemGroupsByExercise({});
    setBlankAnswersByExercise({});
    setResult(null);
    setSubmitError(null);
    setRetrying(true);
  };
```

- [ ] **Step 8: Thay khối JSX vẽ từng câu hỏi lúc đang làm bài** (dòng 468-521, phần `<div className="grid ...">{exercises.map(...)}</div>` — KHÔNG phải phần result card ở trên, phần đó giữ nguyên) bằng:

```tsx
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {exercises.map((exercise, index) => (
          <ExerciseAnswerInput
            key={exercise.id}
            exercise={exercise}
            numberLabel={`${index + 1}`}
            selectedTokens={selectedTokensByExercise[exercise.id] ?? []}
            onToggleToken={(token, tokenIdx) => {
              const key = `${tokenIdx}:${token}`;
              setSelectedTokensByExercise((prev) => {
                const current = prev[exercise.id] ?? [];
                const next = current.includes(key) ? current.filter((t) => t !== key) : [...current, key];
                return { ...prev, [exercise.id]: next };
              });
            }}
            onClearTokens={() => setSelectedTokensByExercise((prev) => ({ ...prev, [exercise.id]: [] }))}
            textAnswer={textAnswerByExercise[exercise.id] ?? ""}
            onTextAnswerChange={(value) => setTextAnswerByExercise((prev) => ({ ...prev, [exercise.id]: value }))}
            itemGroups={itemGroupsByExercise[exercise.id] ?? {}}
            onItemGroupChange={(item, group) => setItemGroupsByExercise((prev) => ({
              ...prev,
              [exercise.id]: { ...(prev[exercise.id] ?? {}), [item]: group },
            }))}
            blankAnswers={blankAnswersByExercise[exercise.id]
              ?? Array(countBlankMarkers(exercise.promptText ?? "")).fill("")}
            onBlankFocus={() => {}}
            onBlankAnswerChange={(blankIndex, value) => {
              const count = countBlankMarkers(exercise.promptText ?? "");
              const current = blankAnswersByExercise[exercise.id] ?? Array(count).fill("");
              const next = [...current];
              next[blankIndex] = value;
              setBlankAnswersByExercise((prev) => ({ ...prev, [exercise.id]: next }));
            }}
            selectedChoice={choiceByExercise[exercise.id]}
            onSelectChoice={(idx) => setChoiceByExercise((prev) => ({ ...prev, [exercise.id]: idx }))}
            textFillBlankValues={textFillBlankByExercise[exercise.id] ?? []}
            onTextFillBlankChange={(blankIndex, value) => {
              const count = countBlankTokens(exercise.promptText ?? "");
              const current = textFillBlankByExercise[exercise.id] ?? Array(count).fill("");
              const next = [...current];
              next[blankIndex] = value;
              setTextFillBlankByExercise((prev) => ({ ...prev, [exercise.id]: next }));
            }}
            matchedPairs={matchedPairsByExercise[exercise.id] ?? {}}
            onMatch={(de, vi) => {
              const correct = (exercise.matchingPairs ?? []).find((p) => p.de === de && p.vi === vi);
              if (!correct) return;
              setMatchedPairsByExercise((prev) => ({
                ...prev,
                [exercise.id]: { ...(prev[exercise.id] ?? {}), [de]: vi },
              }));
            }}
          />
        ))}
      </div>
```

`onBlankFocus` truyền no-op (`() => {}`) — word-bank chip (thứ duy nhất cần biết ô nào đang focus) không port sang Quiz ở phase này, theo đúng "Out of scope" trong spec.

- [ ] **Step 9: `npm run lint` phải pass** — sửa hết mọi chỗ còn tham chiếu `blankValuesByExercise`/`setBlankValuesByExercise` cũ (đổi tên ở Step 3) nếu compiler báo sót.

- [ ] **Step 10: Commit**

```bash
git add src/pages/QuizSetListPage.tsx
git commit -m "feat: nghe/đọc nhập được đủ 10 loại câu hỏi qua ExerciseAnswerInput dùng chung"
```

---

### Task 6: Xác minh thủ công trên trình duyệt

**Files:** không sửa code — cần chèn dữ liệu mẫu vào DB để test (chưa có Admin UI tạo 7 loại mới cho nghe/đọc, đó là Phase 3).

- [ ] **Step 1: `npm run lint` lần cuối trên toàn repo** — 0 lỗi.
- [ ] **Step 2: Chạy lại toàn bộ test suite** — `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts"` — PASS.
- [ ] **Step 3: Ngữ pháp không đổi hành vi** — mở 1 lesson, làm 1 bài `word_reorder` và 1 bài `classification` ở tab ngữ pháp như thường lệ, xác nhận giao diện/hành vi giống hệt trước refactor.
- [ ] **Step 4: Chèn 1 câu hỏi loại `word_reorder` thẳng vào DB cho 1 set nghe/đọc đã có** (qua Supabase Studio hoặc `execute_sql`, set `category` của `exercise_sets` chứa nó là `nghe` hoặc `doc`) — mở tab Nghe/Đọc tương ứng, xác nhận chọn từ ghép câu hoạt động đúng như bên ngữ pháp, lưu draft, mở lại, xác nhận token phục hồi đúng (không lặp lại bug đã sửa cho ngữ pháp).
- [ ] **Step 5: Lặp lại Step 4 cho `classification` và `matching`** — xác nhận nhập được, nộp bài không lỗi (chấm điểm qua `grammar-submit` vốn đã category-agnostic).

## Self-Review

**Spec coverage:** phần "Kiến trúc" của spec (tách `ExerciseAnswerInput`, thêm 2 nhánh) → Task 3. "Wiring" (`GrammarExercisePage.tsx` không đổi hành vi, `QuizSetListPage.tsx` thêm state + dùng `serializeAnswer`) → Task 3-5. "Hydrate draft/attempt" (dùng `parseAnswersIntoFormState` thay `applyAnswers` tự viết) → Task 5 Step 4. "Out of scope" (word-bank chip, hiển thị kết quả, form Admin) → không có task nào chạm 3 phần này, đúng chủ đích.

**Placeholder scan:** không còn TBD — mọi step có code đầy đủ, kể cả phần đổi tên biến (Task 5 Step 3) đã liệt kê rõ.

**Type consistency:** `ParsedAnswer` thêm `matching` kind ở Task 2, dùng đúng tên ở Task 5 (`getParsedAnswerFor`). `ExerciseAnswerInput` props (`textFillBlankValues`, `onTextFillBlankChange`, `matchedPairs`, `onMatch`) định nghĩa ở Task 3, dùng đúng tên ở Task 5 Step 8. `ParsedFormState.matchedPairs` (Task 2) dùng đúng tên ở Task 5 Step 4 (`parsed.matchedPairs`).
