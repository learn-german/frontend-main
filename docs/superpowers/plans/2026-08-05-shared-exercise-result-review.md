# Phase 2 — Shared Exercise Result Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Card kết quả sau khi nộp bài hiển thị đúng/sai + đáp án đúng cho đủ 10 loại câu hỏi ở cả ngữ pháp lẫn nghe/đọc, dùng chung 1 component. `text_fill_blank` chấm điểm đúng và hiện được ô nhập (2 bug thật, điều kiện tiên quyết).

**Architecture:** Sửa 2 bug nền trước (thiếu `prompt_text` trong select edge function; quy ước đánh dấu chỗ trống `{{blank}}` sai). Thêm `ExerciseResultReview` vào `src/components/ExerciseAnswerInput.tsx` (dùng `parseAnswer` có sẵn để đọc đáp án đúng thay vì viết lại), nối vào cả 2 card kết quả.

**Tech Stack:** React 19 + TypeScript 5.8, Deno (Edge Function). Test bằng `node:test` qua `npx tsx --test <path>`.

## Global Constraints

- Không dùng `any`.
- Ngữ pháp không đổi hành vi hiển thị kết quả hiện có.
- Không đổi cách tính điểm/pass, không đổi phần nhập bài làm (Phase 1), không đổi form Admin (Phase 3).
- Chạy `npm run lint` sau mỗi task đụng TypeScript.

---

### Task 1: Fix `text_fill_blank` chấm điểm sai — thiếu `prompt_text` trong select

**Files:**
- Modify: `supabase/functions/grammar-submit/index.ts:69`
- Modify: `supabase/functions/grammar-submit/scoring.ts` (`deriveCorrectAnswers`)
- Test: `supabase/functions/grammar-submit/scoring.test.ts`

**Interfaces:**
- Consumes: `extractBlanks` (hàm nội bộ có sẵn trong `scoring.ts`, không export — dùng trực tiếp trong cùng file).
- Produces: `deriveCorrectAnswers` trả đúng chuỗi JSON đáp án cho `text_fill_blank` thay vì `""`.

- [ ] **Step 1: Write the failing test** — thêm vào cuối `supabase/functions/grammar-submit/scoring.test.ts`:

```ts
test("deriveCorrectAnswers: text_fill_blank trả JSON mảng biến thể đầu tiên mỗi ô", () => {
  const ex = textFillBlank({ prompt_text: "Ich {{bin|Bin}} und du {{bist}}." });
  const result = deriveCorrectAnswers([ex]);
  assert.deepEqual(JSON.parse(result.tfb1), ["bin", "bist"]);
});

test("deriveCorrectAnswers: text_fill_blank không có blank nào trả mảng rỗng, không throw", () => {
  const ex = textFillBlank({ prompt_text: "Không có ô trống." });
  const result = deriveCorrectAnswers([ex]);
  assert.deepEqual(JSON.parse(result.tfb1), []);
});
```

Sửa import ở đầu file thành:
```ts
import { computeGrammarScore, deriveCorrectAnswers, projectAnswers, type ScorableGrammarExercise } from "./scoring.ts";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test supabase/functions/grammar-submit/scoring.test.ts`
Expected: FAIL — `result.tfb1` là `""`, `JSON.parse("")` throw `SyntaxError`.

- [ ] **Step 3: Write minimal implementation** — sửa `deriveCorrectAnswers` trong `supabase/functions/grammar-submit/scoring.ts`:

```ts
export function deriveCorrectAnswers(exercises: ScorableGrammarExercise[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const ex of exercises) {
    if (ex.type === "classification") {
      const items = ex.classification_items ?? [];
      result[ex.id] = items.map((it) => `${it.item}:${it.group}`).join("|");
      continue;
    }
    if (ex.type === "fill_in_the_blank") {
      const blanks = Array.isArray(ex.blanks) ? ex.blanks : [];
      result[ex.id] = JSON.stringify(blanks.map((b) => b?.acceptedAnswers?.[0] ?? ""));
      continue;
    }
    if (ex.type === "text_fill_blank") {
      const blanks = extractBlanks(ex.prompt_text ?? "");
      result[ex.id] = JSON.stringify(blanks.map((variants) => variants[0] ?? ""));
      continue;
    }
    result[ex.id] = ex.correct_answer ?? "";
  }
  return result;
}
```

Cũng xoá comment `ponytail:` cũ phía trên hàm (dòng 205-208, "text_fill_blank không có nguồn ở đây...") — đã hết hiệu lực sau fix này.

- [ ] **Step 4: Thêm `prompt_text` vào select trong `index.ts`** — sửa dòng 69:

```ts
      .select("id, type, correct_answer, acceptable_answers, classification_items, blanks, options, explanation, prompt_text")
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --test supabase/functions/grammar-submit/scoring.test.ts`
Expected: PASS — toàn bộ test cũ + 2 test mới đều xanh.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/grammar-submit/index.ts supabase/functions/grammar-submit/scoring.ts supabase/functions/grammar-submit/scoring.test.ts
git commit -m "fix: text_fill_blank không chấm điểm được do thiếu prompt_text trong select"
```

---

### Task 2: Fix quy ước đánh dấu chỗ trống `text_fill_blank` lệch giữa frontend/backend

**Files:**
- Modify: `src/lib/quizAnswerCodec.ts`
- Modify: `src/lib/quizAnswerCodec.test.ts`
- Modify: `src/components/ExerciseAnswerInput.tsx`

**Interfaces:**
- Produces: `countBlankTokens(promptText: string): number` — đếm số nhóm `{{...}}` bất kỳ nội dung, khớp đúng `BLANK_PATTERN` trong `scoring.ts` (`/\{\{([^}]*)\}\}/g`), thay vì chỉ khớp chuỗi đúng nghĩa đen `"{{blank}}"`.

- [ ] **Step 1: Write the failing test** — sửa test đã có trong `src/lib/quizAnswerCodec.test.ts` (test cũ dùng literal `{{blank}}`, không còn phản ánh đúng quy ước thật — sửa lại theo mẫu Admin thật dùng):

```ts
test("countBlankTokens: đếm đúng số nhóm {{...}} trong prompt, không phân biệt nội dung bên trong", () => {
  assert.equal(countBlankTokens("Ich {{bin|Bin}} und du {{bist}}."), 2);
  assert.equal(countBlankTokens("Không có ô trống."), 0);
});
```

(thay thế nguyên văn test `"countBlankTokens: đếm đúng số {{blank}} trong prompt"` đã có — cùng tên hàm, đổi nội dung chuỗi mẫu.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/quizAnswerCodec.test.ts`
Expected: FAIL — `countBlankTokens("Ich {{bin|Bin}} und du {{bist}}.")` trả `0` (regex cũ không khớp).

- [ ] **Step 3: Write minimal implementation** — sửa `src/lib/quizAnswerCodec.ts`:

```ts
/** Đếm số ô {{...}} trong prompt_text của text_fill_blank — khớp đúng nhóm
 * bất kỳ nội dung (đáp án nằm trong ngoặc, vd "{{bin|Bin}}"), cùng quy ước
 * BLANK_PATTERN đang dùng để chấm điểm ở grammar-submit/scoring.ts. */
export function countBlankTokens(promptText: string): number {
  return (promptText.match(/\{\{[^}]*\}\}/g) ?? []).length;
}
```

- [ ] **Step 4: Sửa `ExerciseAnswerInput.tsx`'s `text_fill_blank` split** — đổi `.split("{{blank}}")` thành regex, tìm đúng khối JSX (nhánh `exercise.type === "text_fill_blank"`):

```tsx
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
```

(chỉ đổi `.split("{{blank}}")` → `.split(/\{\{[^}]*\}\}/)`, không đổi gì khác trong khối này.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --test src/lib/quizAnswerCodec.test.ts`
Expected: PASS.

- [ ] **Step 6: `npm run lint` phải pass**

- [ ] **Step 7: Commit**

```bash
git add src/lib/quizAnswerCodec.ts src/lib/quizAnswerCodec.test.ts src/components/ExerciseAnswerInput.tsx
git commit -m "fix: text_fill_blank blank marker không khớp giữa frontend và backend"
```

---

### Task 3: `ExerciseResultReview` + `SubmittedAnswer` dùng chung

**Files:**
- Modify: `src/components/ExerciseAnswerInput.tsx` (thêm vào cuối file)
- Modify: `src/pages/GrammarExercisePage.tsx` (xoá `SubmittedAnswer` cục bộ, dòng còn lại sau Task Phase 1 — tìm đúng theo nội dung, không theo số dòng cố định vì đã đổi qua Phase 1)

**Interfaces:**
- Consumes: `ParsedAnswer`, `parseAnswer` từ `../lib/grammarAnswerCodec` (đã có từ Phase 1); `GrammarExercise` từ `../lib/appTypes`.
- Produces: `ExerciseResultReview` (React component, export), `SubmittedAnswer` (export, dùng lại ở Task 4).

- [ ] **Step 1: Thêm import vào đầu `src/components/ExerciseAnswerInput.tsx`**:

```ts
import { parseAnswer, type ParsedAnswer } from "../lib/grammarAnswerCodec";
```

- [ ] **Step 2: Thêm `SubmittedAnswer` + `ExerciseResultReview` vào cuối `src/components/ExerciseAnswerInput.tsx`**:

```tsx
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
      <div className="mb-2 space-y-1">
        {(exercise.classificationItems ?? []).map((item, itemIndex) => {
          const userGroup = userGroups[item] ?? "—";
          const correctGroup = revealed ? getCorrectGroups(exercise, correctAnswerRaw)[item] : undefined;
          const isCorrect = classificationResults?.[itemIndex] ?? false;
          return (
            <div key={item} className="flex items-center gap-2 text-xs">
              <span className="flex-1 text-slate-700">{item}</span>
              <span
                className={`rounded-md border px-2 py-1 font-bold ${
                  isCorrect
                    ? "border-green-300 bg-green-50 text-green-700"
                    : "border-slate-200 bg-slate-50 text-slate-600"
                }`}
              >
                {userGroup}
              </span>
              {revealed && !isCorrect && correctGroup && (
                <span className="rounded-md border border-green-300 bg-green-50 px-2 py-1 font-bold text-green-700">
                  {correctGroup}
                </span>
              )}
            </div>
          );
        })}
      </div>
    )}

    {(exercise.type === "fill_in_the_blank" || exercise.type === "text_fill_blank") && (
      <div className="mb-2 text-xs leading-9 text-slate-700">
        {(exercise.promptText ?? "")
          .split(exercise.type === "fill_in_the_blank" ? "___" : /\{\{[^}]*\}\}/)
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
```

Ghi chú `matching`: không cần prop `correctPairs` riêng — `exercise.matchingPairs` mỗi phần tử đã tự là 1 cặp đúng (`pair.de`/`pair.vi`), so khớp trực tiếp với `matchedPairs[pair.de]`, đúng cách `QuizSetListPage.tsx` bản cũ đã làm.

- [ ] **Step 3: Xoá `SubmittedAnswer` cục bộ trong `GrammarExercisePage.tsx`** — tìm khối:

```tsx
/** Read-only echo of what the learner typed, tinted by whether it was graded correct. */
const SubmittedAnswer: React.FC<{ value: string; correct: boolean | undefined }> = ({
  value,
  correct,
}) => (
  ...
);
```

Xoá toàn bộ khối này, thêm `SubmittedAnswer` vào import đã có sẵn từ Phase 1:

```ts
import { ExerciseAnswerInput, SubmittedAnswer, ExerciseResultReview } from "../components/ExerciseAnswerInput";
```

(thay dòng `import { ExerciseAnswerInput } from "../components/ExerciseAnswerInput";` đã có.)

- [ ] **Step 4: `npm run lint` phải pass** — sẽ còn lỗi "declared but never read" cho `ExerciseResultReview` ở bước này (chưa dùng tới, dùng ở Task 4) — bỏ qua, chỉ cần không lỗi cú pháp/type. Nếu compiler chặn cứng biến import chưa dùng thì tạm bỏ qua bước lint ở task này, chạy lại đầy đủ ở cuối Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/components/ExerciseAnswerInput.tsx src/pages/GrammarExercisePage.tsx
git commit -m "feat: add shared ExerciseResultReview + move SubmittedAnswer"
```

---

### Task 4: Wire `GrammarExercisePage.tsx` dùng `ExerciseResultReview`

**Files:**
- Modify: `src/pages/GrammarExercisePage.tsx`

**Interfaces:**
- Consumes: `ExerciseResultReview` (Task 3).

- [ ] **Step 1: Xoá `getCorrectGroupsFor`/`getCorrectBlanksFor`** — tìm và xoá 2 hàm:

```ts
  const getCorrectGroupsFor = (exerciseId: string): Record<string, string> =>
    Object.fromEntries(
      (result?.correctAnswers?.[exerciseId] ?? "")
        .split("|")
        .filter(Boolean)
        .map((pair) => pair.split(":") as [string, string]),
    );

  const getCorrectBlanksFor = (exerciseId: string): string[] => {
    try {
      return JSON.parse(result?.correctAnswers?.[exerciseId] ?? "[]");
    } catch {
      return [];
    }
  };
```

(logic tương đương giờ nằm trong `ExerciseResultReview`, nhận `correctAnswerRaw` qua prop thay vì tự đọc `result.correctAnswers`.)

- [ ] **Step 2: Thay khối JSX per-type trong result card** — tìm khối bắt đầu từ `{group.exercises.map((ex, childIndex) => (` (bên trong `{groups.map((group, groupIndex) => (`) đến hết `))}` tương ứng — nguyên khối hiện tại:

```tsx
                {group.exercises.map((ex, childIndex) => (
                  <div key={ex.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/40 text-xs">
                    <p className="font-display font-bold text-slate-800 leading-tight mb-1 whitespace-pre-wrap">
                      {groupIndex + 1}.{childIndex + 1} {ex.promptText ?? "Phân loại"}
                    </p>
                    {(ex.type === "word_reorder"
                      ...
                    {result.explanations?.[ex.id] && (
                      <p className="text-slate-500 text-[11px] leading-relaxed">
                        <b>Giải thích:</b> {result.explanations[ex.id]}
                      </p>
                    )}
                  </div>
                ))}
```

Thay bằng:

```tsx
                {group.exercises.map((ex, childIndex) => (
                  <ExerciseResultReview
                    key={ex.id}
                    exercise={ex}
                    numberLabel={`${groupIndex + 1}.${childIndex + 1}`}
                    revealed={revealed}
                    submittedText={getSubmittedTextFor(ex)}
                    exerciseCorrect={result.exerciseResults?.[ex.id]}
                    correctAnswerRaw={result.correctAnswers?.[ex.id]}
                    userGroups={itemGroupsByExercise[ex.id] ?? {}}
                    classificationResults={result.classificationResults?.[ex.id]}
                    blankValues={blankAnswersByExercise[ex.id] ?? []}
                    blankResults={result.blankResults?.[ex.id]}
                    selectedChoice={choiceByExercise[ex.id]}
                    choiceResult={result.choiceResults?.[ex.id]}
                    matchedPairs={{}}
                    explanation={result.explanations?.[ex.id]}
                  />
                ))}
```

`matchedPairs={{}}` — ngữ pháp không có exercise loại `matching` trong thực tế, truyền rỗng an toàn (nhánh `matching` trong `ExerciseResultReview` sẽ không được kích hoạt vì không có exercise loại này).

- [ ] **Step 3: `npm run lint` phải pass**

- [ ] **Step 4: Chạy lại toàn bộ test suite**

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts"`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add src/pages/GrammarExercisePage.tsx
git commit -m "refactor: GrammarExercisePage dùng ExerciseResultReview dùng chung"
```

---

### Task 5: Wire `QuizSetListPage.tsx` dùng `ExerciseResultReview`

**Files:**
- Modify: `src/pages/QuizSetListPage.tsx`

**Interfaces:**
- Consumes: `ExerciseResultReview` (Task 3).

- [ ] **Step 1: Thêm `ExerciseResultReview` vào import đã có** (từ Phase 1):

```ts
import { ExerciseAnswerInput, ExerciseResultReview } from "../components/ExerciseAnswerInput";
```

- [ ] **Step 2: Thay khối JSX per-type trong result card** — tìm khối bắt đầu `{exercises.map((ex, index) => (` (trong nhánh `if (result) { ... }`) đến hết `))}` tương ứng — nguyên khối hiện tại:

```tsx
            {exercises.map((ex, index) => (
              <div key={ex.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/40 text-xs">
                <p className="font-display font-bold text-slate-800 leading-tight mb-1 whitespace-pre-wrap">
                  Câu {index + 1} · {QUIZ_TYPE_LABELS[ex.type] ?? ex.type}
                </p>
                {ex.type === "multiple_choice" && (
                  ...
                {result.explanations?.[ex.id] && (
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    <b>Giải thích:</b> {result.explanations[ex.id]}
                  </p>
                )}
              </div>
            ))}
```

Thay bằng:

```tsx
            {exercises.map((ex, index) => (
              <ExerciseResultReview
                key={ex.id}
                exercise={ex}
                numberLabel={`Câu ${index + 1} · ${QUIZ_TYPE_LABELS[ex.type] ?? ex.type}`}
                revealed={revealed}
                submittedText=""
                exerciseCorrect={result.exerciseResults?.[ex.id]}
                correctAnswerRaw={result.correctAnswers?.[ex.id]}
                userGroups={{}}
                classificationResults={undefined}
                blankValues={textFillBlankByExercise[ex.id] ?? []}
                blankResults={result.blankResults?.[ex.id]}
                selectedChoice={choiceByExercise[ex.id]}
                choiceResult={result.choiceResults?.[ex.id]}
                matchedPairs={matchedPairsByExercise[ex.id] ?? {}}
                explanation={result.explanations?.[ex.id]}
              />
            ))}
```

`submittedText=""`/`userGroups={{}}`/`classificationResults={undefined}` — nghe/đọc hiện tại không có exercise loại text-based (`word_reorder`/`error_correction`/...) hay `classification` thật trong dữ liệu (7 loại mới chỉ nhập được từ Phase 1, chưa có UI Admin tạo — Phase 3), nhưng `ExerciseResultReview` phải sẵn sàng nhận đúng shape ngay khi có dữ liệu thật; nếu về sau chèn thẳng DB 1 câu `word_reorder` để test (như Task 6 dưới), phần `submittedText` sẽ hiện rỗng — chấp nhận được ở Phase 2 vì `QuizExerciseSetBody` chưa lưu `submittedAnswerSnapshot` riêng (khác `GrammarExerciseSetBody` đã có `getSubmittedTextFor`); không thuộc phạm vi spec này (chỉ cần đúng/sai + đáp án đúng hiện đúng, phần "echo bài làm gốc" cho loại text-based ở nghe/đọc để phase sau nếu cần).

- [ ] **Step 3: `npm run lint` phải pass**

- [ ] **Step 4: Chạy lại toàn bộ test suite**

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts"`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add src/pages/QuizSetListPage.tsx
git commit -m "refactor: QuizSetListPage dùng ExerciseResultReview dùng chung"
```

---

### Task 6: Xác minh thủ công trên trình duyệt

**Files:** không sửa code.

- [ ] **Step 1: `npm run lint` lần cuối trên toàn repo** — 0 lỗi.
- [ ] **Step 2: Chạy lại toàn bộ test suite lần cuối** — PASS.
- [ ] **Step 3: Ngữ pháp không đổi hành vi** — nộp 1 bài `classification` và 1 bài `fill_in_the_blank`, xác nhận card kết quả hiện đúng/sai + đáp án đúng giống hệt trước Phase 2.
- [ ] **Step 4: Tạo 1 câu `text_fill_blank` thật qua Admin** (theo đúng mẫu `{{đáp_án}}` trong gợi ý form) cho 1 set ngữ pháp hoặc nghe/đọc — mở làm bài, xác nhận **hiện được ô nhập** (bug đã sửa ở Task 2), nộp bài, xác nhận chấm điểm đúng (bug đã sửa ở Task 1), nộp đủ 5 lần hoặc đúng hết để `revealed = true`, xác nhận hiện đúng đáp án cụ thể.
- [ ] **Step 5: Chèn thẳng DB 1 câu mỗi loại còn thiếu** (`word_reorder`, `error_correction`, `classification`, `matching`, ...) cho 1 set nghe/đọc — nộp bài, xác nhận card kết quả hiện đúng/sai + đáp án đúng (khi revealed) giống hệt bên ngữ pháp.

## Self-Review

**Spec coverage:** Fix bug 1 (prompt_text/deriveCorrectAnswers) → Task 1. Fix bug 2 (marker mismatch) → Task 2. `ExerciseResultReview` dùng `parseAnswer` thay hàm tự viết → Task 3. Wiring 2 file → Task 4, 5. Testing/AC → Task 6.

**Placeholder scan:** không còn TBD — mọi step có code đầy đủ, kể cả phần giải thích tại sao `submittedText`/`userGroups` truyền rỗng ở Task 5 (không phải chỗ thiếu code, mà là giới hạn dữ liệu thật chưa có).

**Type consistency:** `ExerciseResultReview` props định nghĩa 1 lần ở Task 3, dùng đúng tên ở Task 4 (`GrammarExercisePage.tsx`) và Task 5 (`QuizSetListPage.tsx`) — cả 2 nơi cùng truyền `matchedPairs`/`classificationResults`/`blankValues` đúng shape đã khai báo.
