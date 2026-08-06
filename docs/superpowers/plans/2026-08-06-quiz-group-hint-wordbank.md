# Phase 3b — Quiz Group/Hint/Word-bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Học viên làm bài nghe/đọc (`QuizSetListPage.tsx`) nhìn thấy group theo "Bài N", hint, và word-bank chip picker giống hệt ngữ pháp (`GrammarExercisePage.tsx`), đồng thời card kết quả hết 3 gap hardcode rỗng (submittedText/userGroups/classificationResults).

**Architecture:** Port nguyên logic grouping/hint/word-bank/snapshot từ `GrammarExerciseSetBody` sang `QuizExerciseSetBody` — cả 2 component vốn đã duplicate ~90% logic hydrate/autosave/submit/retry từ trước. Chỉ sửa `QuizSetListPage.tsx`; `GrammarExercisePage.tsx` chỉ đổi 1 dòng (export thêm hằng số).

**Tech Stack:** React 19 + TypeScript 5.8. Không có logic thuần mới — mọi hàm dùng lại (`groupGrammarExercises`, `applyChipToBlank`, v.v.) đã có test từ trước.

## Global Constraints

- Không dùng `any`.
- Không đổi hành vi `GrammarExerciseSetBody`/`GrammarExercisePage.tsx` hiện có (trừ 1 export mới).
- Không đổi `ExerciseAnswerInput.tsx`/`ExerciseResultReview.tsx` (Phase 1/2) — props interface đã đủ dùng.
- Không đổi backend (`grammar-submit`, DB schema).
- Chạy `npm run lint` sau mỗi task đụng TypeScript, chạy lại toàn bộ test suite (131 test hiện có) — không được fail.

---

### Task 1: Export `GRAMMAR_TYPE_INSTRUCTIONS`, chuẩn bị import ở `QuizSetListPage.tsx`

**Files:**
- Modify: `src/pages/GrammarExercisePage.tsx:66`
- Modify: `src/pages/QuizSetListPage.tsx:1-50`

**Interfaces:**
- Produces: `GRAMMAR_TYPE_INSTRUCTIONS: Record<GrammarExercise["type"], string>` (export, dùng ở Task 3).

- [ ] **Step 1: Export `GRAMMAR_TYPE_INSTRUCTIONS`** — trong `src/pages/GrammarExercisePage.tsx`, đổi dòng 66:

```ts
const GRAMMAR_TYPE_INSTRUCTIONS: Record<GrammarExercise["type"], string> = {
```

thành:

```ts
export const GRAMMAR_TYPE_INSTRUCTIONS: Record<GrammarExercise["type"], string> = {
```

- [ ] **Step 2: `npm run lint` phải pass** (chỉ đổi 1 từ khoá, không đổi hành vi).

- [ ] **Step 3: Sửa import trong `src/pages/QuizSetListPage.tsx`** — thay dòng 17 hiện tại:

```ts
import { countBlankMarkers } from "../lib/grammarFillInBlank";
```

thành:

```ts
import {
  applyChipToBlank,
  applyTypedBlankAnswer,
  countBlankMarkers,
  findBlankTarget,
  getUsedWordIndexes,
  type BlankAssignments,
  type BlankFocus,
} from "../lib/grammarFillInBlank";
```

Thêm 3 import mới ngay sau dòng 18 (`import { ExerciseAnswerInput, ExerciseResultReview } from "../components/ExerciseAnswerInput";`):

```ts
import { groupGrammarExercises } from "../lib/grammarExerciseGroups";
import { GrammarExerciseHint } from "../components/GrammarExerciseHint";
import { GRAMMAR_TYPE_LABELS, GRAMMAR_TYPE_INSTRUCTIONS } from "./GrammarExercisePage";
```

- [ ] **Step 4: Xoá `QUIZ_TYPE_LABELS` cục bộ** — xoá khối dòng 46-50:

```ts
const QUIZ_TYPE_LABELS: Record<string, string> = {
  multiple_choice: "Trắc nghiệm",
  text_fill_blank: "Điền vào chỗ trống",
  matching: "Ghép cặp",
};
```

(2 chỗ đang dùng `QUIZ_TYPE_LABELS` — dòng 301 và 365 — sẽ báo lỗi "not defined" tạm thời, sửa ở Task 3-4. Nếu lint chặn cứng, có thể tạm thay `QUIZ_TYPE_LABELS[...] ?? ...` bằng `GRAMMAR_TYPE_LABELS[...] ?? ...` ngay bước này để giữ file compile được liên tục — làm luôn 2 chỗ đó tại đây.)

Cụ thể, đổi dòng 301:
```ts
                numberLabel={`Câu ${index + 1} · ${QUIZ_TYPE_LABELS[ex.type] ?? ex.type}`}
```
thành:
```ts
                numberLabel={`Câu ${index + 1} · ${GRAMMAR_TYPE_LABELS[ex.type] ?? ex.type}`}
```
và dòng 365:
```ts
            numberLabel={`Câu ${index + 1} · ${QUIZ_TYPE_LABELS[exercise.type] ?? exercise.type}`}
```
thành:
```ts
            numberLabel={`Câu ${index + 1} · ${GRAMMAR_TYPE_LABELS[exercise.type] ?? exercise.type}`}
```

(Đây là bước trung gian để file compile được — Task 3/4 sẽ thay toàn bộ khối chứa 2 dòng này bằng cấu trúc group, lúc đó numberLabel đổi định dạng luôn.)

- [ ] **Step 5: `npm run lint` phải pass.**

- [ ] **Step 6: Chạy lại toàn bộ test suite**

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts"`
Expected: PASS toàn bộ 131 test (không có test nào cần sửa ở task này).

- [ ] **Step 7: Commit**

```bash
git add src/pages/GrammarExercisePage.tsx src/pages/QuizSetListPage.tsx
git commit -m "refactor: chuẩn bị import group/hint/word-bank dùng chung cho QuizSetListPage"
```

---

### Task 2: Thêm state group/hint/word-bank/snapshot + sửa `QuizResult`

**Files:**
- Modify: `src/pages/QuizSetListPage.tsx`

**Interfaces:**
- Consumes: `groupGrammarExercises`, `BlankAssignments`, `BlankFocus` (Task 1 import).
- Produces: state `groups`, `expandedGroupKeys`, `blankAssignments`, `focusedBlank`, `submittedAnswerSnapshot`; hàm `getSubmittedTextFor(exercise: GrammarExercise): string`; `QuizResult.classificationResults: Record<string, boolean[]>`.

- [ ] **Step 1: Thêm field `classificationResults` vào `QuizResult`** — trong khối interface (dòng 29-44), thêm ngay sau `exerciseResults: Record<string, boolean>;`:

```ts
  classificationResults: Record<string, boolean[]>;
```

- [ ] **Step 2: Thêm state mới trong `QuizExerciseSetBody`** — ngay sau dòng khai báo 3 hook đầu (`useGrammarExercises`/`useExerciseSetAttempt`/`useExerciseSetDraft`, dòng 60-62), thêm:

```ts
  const groups = useMemo(() => groupGrammarExercises(exercises), [exercises]);
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(new Set());
```

Trong khối state hiện có (dòng 64-70), thêm 2 dòng sau `const [blankAnswersByExercise, setBlankAnswersByExercise] = useState<Record<string, string[]>>({});`:

```ts
  const [blankAssignments, setBlankAssignments] = useState<BlankAssignments>({});
  const [focusedBlank, setFocusedBlank] = useState<BlankFocus | null>(null);
  const [submittedAnswerSnapshot, setSubmittedAnswerSnapshot] = useState<Record<string, string>>({});
```

- [ ] **Step 3: Thêm hàm `getSubmittedTextFor`** — ngay sau hàm `applyAnswers` (kết thúc ở dòng 101 hiện tại, trước `React.useEffect` đầu tiên), thêm:

```ts
  /** Text-typed submitted answer for the results card, read from the one
   * snapshot shared by the live-submit and hydrate-after-refresh paths. */
  const getSubmittedTextFor = (exercise: GrammarExercise): string => {
    const raw = submittedAnswerSnapshot[exercise.id];
    if (raw === undefined) return "";
    const parsed = parseAnswer(exercise, raw);
    return parsed.kind === "text" ? parsed.value : "";
  };
```

- [ ] **Step 4: Wire `classificationResults` + `submittedAnswerSnapshot` vào effect hydrate-từ-attempt** — trong effect (dòng 103-127), sửa khối `setResult({...})`:

```ts
    setResult({
      score: attempt.score,
      total: attempt.total,
      correct: Math.round((attempt.score / 100) * attempt.total),
      isPassed: attempt.isPassed,
      revealed: attempt.revealed,
      xpEarned: 0,
      bestScore: attempt.bestScore,
      attemptCount: attempt.attemptCount,
      lessonQuizScore: 0,
      blankResults: attempt.blankResults,
      choiceResults: attempt.choiceResults,
      exerciseResults: attempt.exerciseResults,
      classificationResults: attempt.classificationResults,
    });
    applyAnswers(attempt.answers);
    setSubmittedAnswerSnapshot(attempt.answers ?? {});
```

(thêm dòng `classificationResults: attempt.classificationResults,` vào object, và dòng `setSubmittedAnswerSnapshot(attempt.answers ?? {});` ngay sau `applyAnswers(attempt.answers);`.)

- [ ] **Step 5: Wire `submittedAnswerSnapshot` vào `handleSubmit`** — trong `handleSubmit` (dòng 178-196), sau dòng `setResult(res);`, thêm:

```ts
    setSubmittedAnswerSnapshot(finalAnswers);
```

- [ ] **Step 6: Reset state mới trong `handleRetry`** — trong `handleRetry` (dòng 198-210), thêm 3 dòng sau `submissionIdRef.current = crypto.randomUUID();`:

```ts
    setExpandedGroupKeys(new Set());
    setBlankAssignments({});
    setFocusedBlank(null);
```

- [ ] **Step 7: `npm run lint` phải pass** — sẽ có cảnh báo "declared but never read" cho `groups`/`expandedGroupKeys`/`blankAssignments`/`focusedBlank`/`getSubmittedTextFor` ở bước này (chưa dùng tới JSX, dùng ở Task 3-4) — nếu compiler chặn cứng biến chưa dùng thì bỏ qua bước lint ở task này, chạy lại đầy đủ ở cuối Task 4.

- [ ] **Step 8: Commit**

```bash
git add src/pages/QuizSetListPage.tsx
git commit -m "feat: thêm state group/hint/word-bank/snapshot cho QuizExerciseSetBody"
```

---

### Task 3: Render group/hint/word-bank ở phần đang làm bài

**Files:**
- Modify: `src/pages/QuizSetListPage.tsx`

**Interfaces:**
- Consumes: state từ Task 2 (`groups`, `expandedGroupKeys`, `blankAssignments`, `focusedBlank`), `GRAMMAR_TYPE_LABELS`/`GRAMMAR_TYPE_INSTRUCTIONS`/`GrammarExerciseHint` (Task 1).
- Produces: hàm `renderGroupContent(group, groupIndex)` dùng lại ở JSX chính.

- [ ] **Step 1: Thêm hàm `renderGroupContent`** — chèn ngay trước dòng `return (` mở JSX chính (dòng 333 hiện tại, sau khối tính `awaitingHydration`/loading/error ở trên):

```tsx
  const renderGroupContent = (group: (typeof groups)[number], groupIndex: number) => {
    const wordBank = group.exercises[0]?.wordBank;
    const groupExerciseIds = new Set(group.exercises.map((exercise) => exercise.id));
    const groupAssignments = Object.fromEntries(
      Object.entries(blankAssignments).filter(([key]) => groupExerciseIds.has(key.slice(0, key.lastIndexOf(":")))),
    );
    const usedWordIndexes = getUsedWordIndexes(groupAssignments);

    return (
      <div className="space-y-3">
        <GrammarExerciseHint hint={group.exercises[0]?.hint} groupKey={group.key} />
        <p className="text-sm text-slate-500">{GRAMMAR_TYPE_INSTRUCTIONS[group.type]}</p>
        {group.type === "fill_in_the_blank" && wordBank && (
          <div className="flex flex-wrap gap-2 rounded-xl border border-orange-100 bg-orange-50/50 p-3">
            {wordBank.words.map((word, wordIndex) => {
              const used = usedWordIndexes.has(wordIndex);
              const disabled = wordBank.mode === "single_use" && used;
              return (
                <button
                  key={`${wordIndex}:${word}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const answersWithDefaults = Object.fromEntries(group.exercises.map((exercise) => [
                      exercise.id,
                      blankAnswersByExercise[exercise.id]
                        ?? Array(countBlankMarkers(exercise.promptText ?? "")).fill(""),
                    ]));
                    const target = findBlankTarget(
                      group.exercises.map((exercise) => exercise.id),
                      answersWithDefaults,
                      focusedBlank,
                    );
                    if (!target) return;
                    const next = applyChipToBlank(
                      { ...blankAnswersByExercise, ...answersWithDefaults },
                      blankAssignments,
                      target,
                      wordIndex,
                      word,
                      wordBank.mode,
                    );
                    setBlankAnswersByExercise(next.answers);
                    setBlankAssignments(next.assignments);
                    setFocusedBlank(target);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
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
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {group.exercises.map((exercise, childIndex) => (
            <ExerciseAnswerInput
              key={exercise.id}
              exercise={exercise}
              numberLabel={`${groupIndex + 1}.${childIndex + 1}`}
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
              onItemGroupChange={(item, itemGroup) => setItemGroupsByExercise((prev) => ({
                ...prev,
                [exercise.id]: { ...(prev[exercise.id] ?? {}), [item]: itemGroup },
              }))}
              blankAnswers={blankAnswersByExercise[exercise.id]
                ?? Array(countBlankMarkers(exercise.promptText ?? "")).fill("")}
              onBlankFocus={(blankIndex) => setFocusedBlank({ exerciseId: exercise.id, blankIndex })}
              onBlankAnswerChange={(blankIndex, value) => {
                const target = { exerciseId: exercise.id, blankIndex };
                const answersWithDefaults = {
                  ...blankAnswersByExercise,
                  [exercise.id]: blankAnswersByExercise[exercise.id]
                    ?? Array(countBlankMarkers(exercise.promptText ?? "")).fill(""),
                };
                const next = applyTypedBlankAnswer(answersWithDefaults, blankAssignments, target, value);
                setBlankAnswersByExercise(next.answers);
                setBlankAssignments(next.assignments);
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
      </div>
    );
  };
```

- [ ] **Step 2: Thay khối JSX grid phẳng bằng group/accordion** — tìm khối (dòng 360-414 hiện tại):

```tsx
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {exercises.map((exercise, index) => (
          <ExerciseAnswerInput
            ...
          />
        ))}
      </div>
```

(toàn bộ khối từ `<div className="grid...">` đến `</div>` đóng tương ứng, chứa `ExerciseAnswerInput` với đủ props như bản gốc) — thay bằng:

```tsx
      <div className="space-y-3">
        {groups.length === 1 ? (
          renderGroupContent(groups[0], 0)
        ) : (
          groups.map((group, groupIndex) => {
            const isExpanded = expandedGroupKeys.has(group.key);
            const isComplete = group.exercises.every((exercise) => getAnswerStringFor(exercise) !== "");
            return (
              <section key={group.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setExpandedGroupKeys((previous) => {
                    const next = new Set(previous);
                    if (next.has(group.key)) next.delete(group.key);
                    else next.add(group.key);
                    return next;
                  })}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-slate-50"
                >
                  {isExpanded ? <ChevronDown className="h-5 w-5 text-slate-400" /> : <ChevronRight className="h-5 w-5 text-slate-400" />}
                  <span className="text-base font-display font-black text-slate-900">Bài {groupIndex + 1}</span>
                  <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700">{GRAMMAR_TYPE_LABELS[group.type]}</span>
                  <span className="text-xs text-slate-400">{group.exercises.length} câu</span>
                  {isComplete && <CheckCircle2 className="ml-auto h-5 w-5 text-green-500" />}
                </button>
                {isExpanded && (
                  <div className="border-t border-slate-100 p-4">
                    {renderGroupContent(group, groupIndex)}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
```

(vị trí không đổi — vẫn nằm giữa khối banner audio/đoạn văn phía trên và `{submitError && ...}` phía dưới.)

- [ ] **Step 3: `npm run lint` phải pass.**

- [ ] **Step 4: Chạy lại toàn bộ test suite**

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts"`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```bash
git add src/pages/QuizSetListPage.tsx
git commit -m "feat: hiện group/hint/word-bank khi làm bài nghe/đọc"
```

---

### Task 4: Sửa card kết quả — group + 3 gap (submittedText/userGroups/classificationResults) + bug `blankValues`

**Files:**
- Modify: `src/pages/QuizSetListPage.tsx`

**Interfaces:**
- Consumes: `getSubmittedTextFor` (Task 2), `groups` (Task 2), `GRAMMAR_TYPE_LABELS` (Task 1).

- [ ] **Step 1: Thay khối JSX card kết quả** — tìm khối (dòng 292-317 hiện tại):

```tsx
        <div className="text-left space-y-3 pt-4 border-t border-slate-100">
          <h4 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest">
            {revealed ? "Giải thích từng câu hỏi:" : "Câu đúng / câu sai:"}
          </h4>
          <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
            {exercises.map((ex, index) => (
              <ExerciseResultReview
                key={ex.id}
                exercise={ex}
                numberLabel={`Câu ${index + 1} · ${GRAMMAR_TYPE_LABELS[ex.type] ?? ex.type}`}
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
          </div>
        </div>
```

Thay bằng:

```tsx
        <div className="text-left space-y-3 pt-4 border-t border-slate-100">
          <h4 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest">
            {revealed ? "Giải thích từng câu hỏi:" : "Câu đúng / câu sai:"}
          </h4>
          <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
            {groups.map((group, groupIndex) => (
              <div key={group.key} className="space-y-1.5">
                <p className="text-xs font-display font-bold text-slate-700">
                  Bài {groupIndex + 1}: {GRAMMAR_TYPE_LABELS[group.type]}
                </p>
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
                    blankValues={ex.type === "fill_in_the_blank"
                      ? (blankAnswersByExercise[ex.id] ?? [])
                      : (textFillBlankByExercise[ex.id] ?? [])}
                    blankResults={result.blankResults?.[ex.id]}
                    selectedChoice={choiceByExercise[ex.id]}
                    choiceResult={result.choiceResults?.[ex.id]}
                    matchedPairs={matchedPairsByExercise[ex.id] ?? {}}
                    explanation={result.explanations?.[ex.id]}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
```

Lưu ý `blankValues`: bản cũ luôn đọc `textFillBlankByExercise[ex.id]` bất kể type — sai với câu loại `fill_in_the_blank` (nay có thể tạo được cho nghe/đọc từ Phase 3a), vì loại đó lưu giá trị vào `blankAnswersByExercise` (state riêng, dùng `JSON.stringify` khi serialize) chứ không phải `textFillBlankByExercise` (dùng `joinBlankAnswers`). Sửa luôn thành rẽ nhánh theo `ex.type` như trên.

- [ ] **Step 2: `npm run lint` phải pass.**

- [ ] **Step 3: Chạy lại toàn bộ test suite**

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts"`
Expected: PASS toàn bộ.

- [ ] **Step 4: Commit**

```bash
git add src/pages/QuizSetListPage.tsx
git commit -m "fix: card kết quả nghe/đọc hiện đúng group, bài làm gốc, kết quả phân loại và blankValues theo type"
```

---

### Task 5: Xác minh thủ công + cập nhật roadmap

**Files:** `requirement.md` (cập nhật trạng thái), không sửa code khác.

- [ ] **Step 1: `npm run lint` lần cuối trên toàn repo** — 0 lỗi.
- [ ] **Step 2: Chạy lại toàn bộ test suite lần cuối** — PASS.
- [ ] **Step 3: Ngữ pháp không đổi hành vi** — mở 1 set ngữ pháp có group/hint/word-bank, xác nhận hiển thị giống hệt trước Phase 3b (không bị ảnh hưởng vì chỉ đổi 1 export).
- [ ] **Step 4: Set nghe/đọc nhiều group chung hint/word-bank** — tạo (qua Admin, Phase 3a) 1 set nghe hoặc đọc có >1 group `fill_in_the_blank` cùng word-bank, xác nhận hiện đúng: hint ở đầu mỗi group, chip word-bank dùng chung, accordion "Bài N" theo group, banner audio/đoạn văn vẫn ở đúng vị trí cũ (không theo group).
- [ ] **Step 5: Card kết quả** — nộp bài set trên, xác nhận card kết quả group đúng theo group, hiện đúng "bài làm của bạn" cho câu loại text-based (word_reorder/error_correction/...), hiện đúng/sai từng item cho câu `classification`, hiện đúng ô trống cho cả `fill_in_the_blank` lẫn `text_fill_blank`.
- [ ] **Step 6: Cập nhật `requirement.md`** — đánh dấu Phase 3b xong, đóng luôn mục cha "Áp dụng toàn bộ kiểu câu hỏi từ ngữ pháp sang nghe/đọc" (3/3 phase xong).

```bash
git add requirement.md
git commit -m "docs: đánh dấu Phase 3b đã xong, đóng roadmap 'áp dụng toàn bộ kiểu câu hỏi'"
```

## Self-Review

**Spec coverage:** Grouping (spec §1) → Task 3. Hint + word bank (spec §2) → Task 3. Banner audio/đoạn văn không đổi (spec §3) → không có task riêng vì không đổi gì (đã note ở Task 3 Step 2). 3 gap card kết quả (spec §4) → Task 4. Type labels dùng chung (spec §5) → Task 1. Numbering (spec §6) → Task 3 (đang làm bài) + Task 4 (kết quả). Testing/verification → Task 5.

**Placeholder scan:** không còn TBD — kể cả bug `blankValues` phát hiện thêm lúc viết plan (không có trong spec gốc) đã ghi rõ nguyên nhân và cách sửa tại Task 4, không phải chỗ thiếu code.

**Type consistency:** `getSubmittedTextFor`, `groups`, `expandedGroupKeys`, `blankAssignments`, `focusedBlank` định nghĩa ở Task 2, dùng đúng tên ở Task 3, 4. `GRAMMAR_TYPE_LABELS`/`GRAMMAR_TYPE_INSTRUCTIONS` import ở Task 1, dùng đúng ở Task 3, 4. `QuizResult.classificationResults` thêm ở Task 2, dùng ở Task 4.
