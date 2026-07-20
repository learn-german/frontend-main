# Ngữ pháp then chốt: Tab + Grouped Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move "Ngữ pháp then chốt" (grammar theory) into its own default-open tab next to Nghe/Nói/Đọc/Viết, let admins batch-create same-type grammar questions with a "+" button, and show the student-facing grammar exercise page grouped by question type in a wide 2-column layout that fits ~10 questions per screen without scrolling.

**Architecture:** Three independent UI surfaces change: `LessonDetailPage.tsx` (tab restructure), `AdminGrammarExerciseSection.tsx` (multi-entry create modal), and `GrammarExercisePage.tsx` (paginated grouped display, backed by a new pure helper `src/lib/grammarExercisePaging.ts`). No DB schema, Edge Function, or hook changes.

**Tech Stack:** React 19 + TypeScript 5.8, Tailwind CSS v4, Supabase JS client, lucide-react icons.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-20-grammar-tab-and-grouped-display-design.md`.
- Ngôn ngữ code: English (biến/hàm/type); nội dung hiển thị cho user: Tiếng Việt.
- Không dùng `any` trong TypeScript.
- Không dùng `window.alert()`/`window.confirm()` — dùng `showToast()`.
- Không thêm npm package mới. Không sửa `src/lib/database.types.ts` bằng tay.
- **Không có test runner (jest/vitest) trong repo.** Verification convention của dự án là: `npm run lint` (`tsc --noEmit`) sau mỗi task, cộng với kiểm thử thủ công trên browser. `tsx` (devDependency có sẵn) được dùng cho 1 lần kiểm tra thủ công logic thuần (pure function) khi cần, không phải test tự động.
- Mọi thay đổi chỉ chạm vào 3 file nêu trên + 1 file helper mới — không refactor gì ngoài phạm vi.

---

### Task 1: "Ngữ pháp then chốt" thành tab riêng, mặc định mở đầu tiên

**Files:**
- Modify: `src/pages/LessonDetailPage.tsx:33` (type `BottomTab`)
- Modify: `src/pages/LessonDetailPage.tsx:46-53` (mảng `BOTTOM_TABS`)
- Modify: `src/pages/LessonDetailPage.tsx:163-193` (xoá khối full-width cũ)
- Modify: `src/pages/LessonDetailPage.tsx:216-218` (thêm nội dung tab mới ngay trước tab `quiz`)

**Interfaces:**
- Consumes: `lesson.grammarMd?: string`, `lesson.grammar: GrammarExplanation` (từ `src/lib/appTypes.ts`, không đổi).
- Produces: không có API mới — thay đổi thuần UI nội bộ component.

- [ ] **Step 1: Thêm giá trị tab mới vào type `BottomTab`**

Mở `src/pages/LessonDetailPage.tsx`, dòng 33:

```ts
type BottomTab = "quiz" | "nghe" | "doc" | "tuvung" | "noi" | "viet";
```

Sửa thành:

```ts
type BottomTab = "nguphapthenchot" | "quiz" | "nghe" | "doc" | "tuvung" | "noi" | "viet";
```

- [ ] **Step 2: Thêm tab mới vào đầu mảng `BOTTOM_TABS`**

Dòng 46-53 hiện tại:

```tsx
  const BOTTOM_TABS: { id: BottomTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: "tuvung", label: "Wortschatz", Icon: BookOpen },
    { id: "quiz", label: "Grammatikübungen", Icon: HelpCircle },
    { id: "doc", label: "Lesen", Icon: FileText },
    { id: "nghe", label: "Hören", Icon: Headphones },
    { id: "viet", label: "Schreiben", Icon: PenLine },
    { id: "noi", label: "Sprechen", Icon: Mic },
  ];
```

Sửa thành (thêm entry mới ở đầu mảng — vị trí đầu mảng quyết định tab mặc định vì `useState(() => visibleTabs[0]?.id ?? "tuvung")` ở dòng 72 chọn phần tử đầu tiên của `visibleTabs`):

```tsx
  const BOTTOM_TABS: { id: BottomTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: "nguphapthenchot", label: "Ngữ pháp then chốt", Icon: GraduationCap },
    { id: "tuvung", label: "Wortschatz", Icon: BookOpen },
    { id: "quiz", label: "Grammatikübungen", Icon: HelpCircle },
    { id: "doc", label: "Lesen", Icon: FileText },
    { id: "nghe", label: "Hören", Icon: Headphones },
    { id: "viet", label: "Schreiben", Icon: PenLine },
    { id: "noi", label: "Sprechen", Icon: Mic },
  ];
```

`GraduationCap` đã được import sẵn ở dòng 7 (dùng cho phần "Mục tiêu bài học") — không cần thêm import mới.

Không cần sửa `visibleTabs` filter (dòng 62-70): hàm này có nhánh `else return true;` ngầm định (không có `if` case nào khớp `"nguphapthenchot"`), nên tab mới luôn hiển thị — đúng hành vi cũ vì khối lý thuyết ngữ pháp trước đây luôn hiển thị không điều kiện.

- [ ] **Step 3: Xoá khối full-width "Ngữ pháp then chốt" cũ**

Xoá toàn bộ khối sau (dòng 163-193, ngay dưới comment `{/* Row 2: Grammar — full width, markdown or legacy structured */}`):

```tsx
      {/* Row 2: Grammar — full width, markdown or legacy structured */}
      <div className="bg-slate-50/50 border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-display font-bold text-yellow-400 bg-slate-950 border border-slate-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
            Ngữ pháp then chốt
          </span>
          {lesson.grammarMd && (
            <span className="text-[10px] text-slate-400">Click từ được tô sáng để nghe phát âm</span>
          )}
        </div>

        {lesson.grammarMd ? (
          <MarkdownBlock content={lesson.grammarMd} onWordClick={handlePronounce} />
        ) : (
          <>
            <h3 className="text-base font-display font-bold text-slate-900">{lesson.grammar.title}</h3>
            <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap font-sans">{lesson.grammar.rule}</p>
            {lesson.grammar.examples.length > 0 && (
              <div className="space-y-2 mt-4">
                <span className="text-[10px] font-display font-bold text-slate-400 block uppercase">Ví dụ minh họa:</span>
                {lesson.grammar.examples.map((ex, i) => (
                  <div key={i} className="bg-white p-3 rounded-xl border border-slate-150 shadow-sm text-xs">
                    <p className="font-display font-bold text-slate-900 leading-normal">🇩🇪 {ex.de}</p>
                    <p className="text-slate-500 mt-1 font-sans italic">🇻🇳 {ex.vi}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

```

(Xoá cả dòng trống ngay sau `</div>` đóng khối, giữ nguyên comment `{/* Bottom tabbed section: ... */}` và phần còn lại phía dưới không đổi.)

- [ ] **Step 4: Thêm nội dung cho tab mới vào vùng tab content**

Ngay sau dòng `{/* Tab content */}` và `<div className="p-6">` (trước dòng `{/* Bài tập ngữ pháp tab */}` / `{bottomTab === "quiz" && (`), thêm khối JSX mới:

```tsx
          {/* Ngữ pháp then chốt tab */}
          {bottomTab === "nguphapthenchot" && (
            <div className="space-y-4">
              {lesson.grammarMd && (
                <div className="flex justify-end">
                  <span className="text-[10px] text-slate-400">Click từ được tô sáng để nghe phát âm</span>
                </div>
              )}
              {lesson.grammarMd ? (
                <MarkdownBlock content={lesson.grammarMd} onWordClick={handlePronounce} />
              ) : (
                <>
                  <h3 className="text-base font-display font-bold text-slate-900">{lesson.grammar.title}</h3>
                  <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap font-sans">{lesson.grammar.rule}</p>
                  {lesson.grammar.examples.length > 0 && (
                    <div className="space-y-2 mt-4">
                      <span className="text-[10px] font-display font-bold text-slate-400 block uppercase">Ví dụ minh họa:</span>
                      {lesson.grammar.examples.map((ex, i) => (
                        <div key={i} className="bg-white p-3 rounded-xl border border-slate-150 shadow-sm text-xs">
                          <p className="font-display font-bold text-slate-900 leading-normal">🇩🇪 {ex.de}</p>
                          <p className="text-slate-500 mt-1 font-sans italic">🇻🇳 {ex.vi}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

```

- [ ] **Step 5: Type-check**

Run: `npm run lint`
Expected: không có lỗi TypeScript liên quan đến `LessonDetailPage.tsx`.

- [ ] **Step 6: Kiểm thử thủ công trên browser**

Chạy `npm run dev` (qua `preview_start` với config `dev` trong `.claude/launch.json` nếu có, hoặc `npm run dev` trực tiếp), mở 1 bài học bất kỳ có nội dung `grammarMd` hoặc `grammar.rule`:
- Xác nhận tab "Ngữ pháp then chốt" hiển thị **đầu tiên** trong tab bar và **được mở mặc định** khi vào trang.
- Xác nhận nội dung lý thuyết (markdown hoặc ví dụ minh họa) hiển thị đúng như trước, click từ tô sáng vẫn phát âm được (nếu `grammarMd` có từ tô sáng).
- Chuyển sang tab "Grammatikübungen" — xác nhận nút "Bắt đầu bài tập ngữ pháp" vẫn hoạt động như cũ, không bị ảnh hưởng.
- Kiểm tra các tab khác (Wortschatz, Lesen, Hören, Schreiben, Sprechen) vẫn hiển thị/ẩn đúng như trước (không có tab nào bị lệch vị trí ngoài ý muốn).

- [ ] **Step 7: Commit**

```bash
git add src/pages/LessonDetailPage.tsx
git commit -m "feat: move grammar theory into its own default-open tab"
```

---

### Task 2: Pure helper nhóm bài tập theo loại + phân trang tối đa 10 câu

**Files:**
- Create: `src/lib/grammarExercisePaging.ts`

**Interfaces:**
- Consumes: `GrammarExercise` type từ `src/lib/appTypes.ts` (không đổi).
- Produces: `groupExercisesIntoPages(exercises: GrammarExercise[]): GrammarExercise[][]` — dùng bởi Task 3.

- [ ] **Step 1: Viết helper**

Tạo file `src/lib/grammarExercisePaging.ts`:

```ts
import { GrammarExercise } from "./appTypes";

const MAX_QUESTIONS_PER_PAGE = 10;

/**
 * Nhóm các bài tập cùng loại lại với nhau, giữ thứ tự xuất hiện đầu tiên
 * của mỗi loại (dựa trên thứ tự order_index đã được sắp xếp sẵn từ query).
 * Mỗi nhóm được chia tiếp thành các trang tối đa MAX_QUESTIONS_PER_PAGE câu.
 */
export function groupExercisesIntoPages(exercises: GrammarExercise[]): GrammarExercise[][] {
  const byType = new Map<GrammarExercise["type"], GrammarExercise[]>();
  for (const exercise of exercises) {
    const group = byType.get(exercise.type);
    if (group) {
      group.push(exercise);
    } else {
      byType.set(exercise.type, [exercise]);
    }
  }

  const pages: GrammarExercise[][] = [];
  for (const group of byType.values()) {
    for (let i = 0; i < group.length; i += MAX_QUESTIONS_PER_PAGE) {
      pages.push(group.slice(i, i + MAX_QUESTIONS_PER_PAGE));
    }
  }
  return pages;
}
```

- [ ] **Step 2: Kiểm tra logic bằng script chạy 1 lần với `tsx`**

Repo không có test runner (jest/vitest), theo quy ước dự án dùng type-check + kiểm thử thủ công. Vì đây là hàm thuần (pure function), viết 1 script tạm để chạy 1 lần bằng `tsx` (devDependency sẵn có), xác nhận hành vi đúng, rồi xoá — không add dependency mới, không phải test tự động lưu lại trong repo.

Tạo file tạm `/tmp/verify-grammar-paging.ts`:

```ts
import { groupExercisesIntoPages } from "../Users/thangnv/Documents/web-gemany/.claude/worktrees/fervent-zhukovsky-e5cdea/src/lib/grammarExercisePaging";
import { GrammarExercise } from "../Users/thangnv/Documents/web-gemany/.claude/worktrees/fervent-zhukovsky-e5cdea/src/lib/appTypes";

const makeExercise = (id: string, type: GrammarExercise["type"]): GrammarExercise => ({
  id,
  lessonId: "lesson-1",
  type,
  explanation: "",
});

// 4 câu loại A, 15 câu loại B (xen kẽ thứ tự order_index: A,B,A,B,B,B,...)
const exercises: GrammarExercise[] = [
  makeExercise("a1", "translation"),
  makeExercise("b1", "word_reorder"),
  makeExercise("a2", "translation"),
  ...Array.from({ length: 13 }, (_, i) => makeExercise(`b${i + 2}`, "word_reorder")),
];

const pages = groupExercisesIntoPages(exercises);

console.log("Số trang:", pages.length);
console.log("Kích thước mỗi trang:", pages.map((p) => p.length));
console.log("Loại mỗi trang:", pages.map((p) => p[0].type));

// Kỳ vọng: 3 trang — [2 câu translation], [10 câu word_reorder], [4 câu word_reorder]
if (pages.length !== 3) throw new Error("FAIL: expected 3 pages, got " + pages.length);
if (pages[0].length !== 2 || pages[0][0].type !== "translation") throw new Error("FAIL: page 1 mismatch");
if (pages[1].length !== 10 || pages[1][0].type !== "word_reorder") throw new Error("FAIL: page 2 mismatch");
if (pages[2].length !== 4 || pages[2][0].type !== "word_reorder") throw new Error("FAIL: page 3 mismatch");
console.log("PASS: grouping + pagination đúng như kỳ vọng.");
```

Run:

```bash
npx tsx /tmp/verify-grammar-paging.ts
```

Expected output: in ra `Số trang: 3`, `Kích thước mỗi trang: [ 2, 10, 4 ]`, `Loại mỗi trang: [ 'translation', 'word_reorder', 'word_reorder' ]`, kết thúc bằng `PASS: grouping + pagination đúng như kỳ vọng.` (không throw lỗi).

Nếu FAIL, sửa lại `groupExercisesIntoPages` cho đến khi script chạy PASS.

- [ ] **Step 3: Xoá script tạm**

```bash
rm /tmp/verify-grammar-paging.ts
```

- [ ] **Step 4: Type-check**

Run: `npm run lint`
Expected: không có lỗi TypeScript liên quan đến `grammarExercisePaging.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/grammarExercisePaging.ts
git commit -m "feat: add pure helper to group grammar exercises by type into pages"
```

---

### Task 3: Trang làm bài — gộp theo loại, lưới 2 cột, ~10 câu/trang

**Files:**
- Modify: `src/pages/GrammarExercisePage.tsx` (rewrite toàn bộ file)

**Interfaces:**
- Consumes: `groupExercisesIntoPages` từ Task 2 (`src/lib/grammarExercisePaging.ts`); `GrammarExercise` type từ `src/lib/appTypes.ts`; `useGrammarExercises(lessonId)` hook (không đổi, trả `{ exercises, loading, error }`, `exercises` đã sort theo `order_index`).
- Produces: không có API mới — component nội bộ `ExerciseCard` chỉ dùng trong file này.

- [ ] **Step 1: Thay toàn bộ nội dung file**

Đây là 1 rewrite toàn diện (đổi state từ "1 câu/lần" sang "1 trang nhiều câu"), nên thay thế **toàn bộ nội dung** `src/pages/GrammarExercisePage.tsx` bằng:

```tsx
import React, { useState, useMemo } from "react";
import { Loader2, ArrowRight, RotateCcw } from "lucide-react";
import { Button, ProgressBar } from "../components/DesignSystem";
import { Lesson, GrammarExercise } from "../lib/appTypes";
import { useGrammarExercises } from "../lib/hooks/useGrammarExercises";
import { groupExercisesIntoPages } from "../lib/grammarExercisePaging";
import { supabase } from "../lib/supabase";

interface GrammarExercisePageProps {
  lesson: Lesson;
  onQuizFinished: (scorePercentage: number, xpEarned: number) => void;
  onNavigateHome: () => void;
  onNextLesson: () => void;
  onBackToLesson: () => void;
}

interface GrammarResult {
  score: number;
  total: number;
  passed: boolean;
  xp_earned: number;
}

const ExerciseCard: React.FC<{
  exercise: GrammarExercise;
  index: number;
  selectedTokens: string[];
  onToggleToken: (token: string, tokenIdx: number) => void;
  onClearTokens: () => void;
  textAnswer: string;
  onTextAnswerChange: (value: string) => void;
  itemGroups: Record<string, string>;
  onItemGroupChange: (item: string, group: string) => void;
}> = ({
  exercise,
  index,
  selectedTokens,
  onToggleToken,
  onClearTokens,
  textAnswer,
  onTextAnswerChange,
  itemGroups,
  onItemGroupChange,
}) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
    <span className="text-[10px] font-display font-bold text-slate-400 uppercase tracking-wider">Câu {index + 1}</span>

    {exercise.type === "word_reorder" && (
      <>
        <p className="text-xs text-slate-500">Sắp xếp các từ sau thành câu đúng:</p>
        <div className="flex flex-wrap gap-1.5">
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
        <p className="text-xs text-slate-700">Sửa câu sau cho đúng:</p>
        <p className="text-xs bg-red-50 text-red-700 rounded-lg px-2.5 py-2">{exercise.promptText}</p>
        <input
          type="text"
          value={textAnswer}
          onChange={(e) => onTextAnswerChange(e.target.value)}
          className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          placeholder="Nhập câu đúng..."
        />
      </>
    )}

    {exercise.type === "translation" && (
      <>
        <p className="text-xs text-slate-700">Dịch câu sau sang tiếng Đức:</p>
        <p className="text-xs bg-slate-50 text-slate-700 rounded-lg px-2.5 py-2">{exercise.promptText}</p>
        <input
          type="text"
          value={textAnswer}
          onChange={(e) => onTextAnswerChange(e.target.value)}
          className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          placeholder="Nhập câu tiếng Đức..."
        />
      </>
    )}

    {exercise.type === "sentence_transformation" && (
      <>
        <p className="text-xs text-slate-700">Biến đổi câu sau theo yêu cầu:</p>
        <p className="text-xs bg-slate-50 text-slate-700 rounded-lg px-2.5 py-2">{exercise.promptText}</p>
        {exercise.transformationHint && (
          <span className="inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-700 uppercase">
            Yêu cầu: {exercise.transformationHint}
          </span>
        )}
        <input
          type="text"
          value={textAnswer}
          onChange={(e) => onTextAnswerChange(e.target.value)}
          className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          placeholder="Nhập câu sau khi biến đổi..."
        />
      </>
    )}

    {exercise.type === "guided_sentence_writing" && (
      <>
        <p className="text-xs text-slate-700">Viết câu hoàn chỉnh từ dữ liệu gợi ý sau:</p>
        <p className="text-xs bg-slate-50 text-slate-700 rounded-lg px-2.5 py-2">{exercise.promptText}</p>
        <input
          type="text"
          value={textAnswer}
          onChange={(e) => onTextAnswerChange(e.target.value)}
          className="w-full px-2.5 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          placeholder="Viết câu hoàn chỉnh..."
        />
      </>
    )}

    {exercise.type === "classification" && (
      <>
        <p className="text-xs text-slate-500">Phân loại các item sau vào đúng nhóm:</p>
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
  </div>
);

export const GrammarExercisePage: React.FC<GrammarExercisePageProps> = ({
  lesson,
  onQuizFinished,
  onNavigateHome,
  onNextLesson,
}) => {
  const { exercises, loading: exercisesLoading, error: exercisesError } = useGrammarExercises(lesson.id);

  const pages = useMemo(() => groupExercisesIntoPages(exercises), [exercises]);

  const [currentPageIdx, setCurrentPageIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [selectedTokensByExercise, setSelectedTokensByExercise] = useState<Record<string, string[]>>({});
  const [textAnswerByExercise, setTextAnswerByExercise] = useState<Record<string, string>>({});
  const [itemGroupsByExercise, setItemGroupsByExercise] = useState<Record<string, Record<string, string>>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<GrammarResult | null>(null);

  const currentPage = pages[currentPageIdx] ?? [];
  const isLastPage = currentPageIdx === pages.length - 1;
  const questionOffset = pages.slice(0, currentPageIdx).reduce((sum, p) => sum + p.length, 0);

  const toggleToken = (exerciseId: string, token: string, tokenIdx: number) => {
    const key = `${tokenIdx}:${token}`;
    setSelectedTokensByExercise((prev) => {
      const current = prev[exerciseId] ?? [];
      const next = current.includes(key) ? current.filter((t) => t !== key) : [...current, key];
      return { ...prev, [exerciseId]: next };
    });
  };

  const getAnswerStringFor = (exercise: GrammarExercise): string => {
    if (exercise.type === "word_reorder") {
      const tokens = selectedTokensByExercise[exercise.id] ?? [];
      return tokens.map((t) => t.split(":").slice(1).join(":")).join(" ");
    }
    if (exercise.type === "classification") {
      const items = exercise.classificationItems ?? [];
      const groups = itemGroupsByExercise[exercise.id] ?? {};
      if (items.length === 0 || items.some((item) => !groups[item])) return "";
      return items.map((item) => `${item}:${groups[item]}`).join("|");
    }
    return (textAnswerByExercise[exercise.id] ?? "").trim();
  };

  const hasAnsweredAllOnPage = (): boolean => currentPage.every((ex) => getAnswerStringFor(ex) !== "");

  const collectPageAnswers = (): Record<string, string> => {
    const pageAnswers: Record<string, string> = {};
    for (const ex of currentPage) {
      pageAnswers[ex.id] = getAnswerStringFor(ex);
    }
    return pageAnswers;
  };

  const handleNext = () => {
    setAnswers((prev) => ({ ...prev, ...collectPageAnswers() }));
    setCurrentPageIdx((i) => i + 1);
  };

  const handleSubmit = async () => {
    const finalAnswers = { ...answers, ...collectPageAnswers() };
    setAnswers(finalAnswers);

    setSubmitting(true);
    setSubmitError(null);

    const { data, error } = await supabase.functions.invoke("grammar-submit", {
      body: { lesson_id: lesson.id, answers: finalAnswers },
    });

    setSubmitting(false);

    if (error || !data) {
      setSubmitError("Không thể nộp bài. Vui lòng thử lại.");
      return;
    }

    const res = data as GrammarResult;
    setResult(res);
    onQuizFinished(res.score, res.xp_earned);
  };

  const handleRetry = () => {
    setCurrentPageIdx(0);
    setAnswers({});
    setSelectedTokensByExercise({});
    setTextAnswerByExercise({});
    setItemGroupsByExercise({});
    setResult(null);
    setSubmitError(null);
  };

  if (exercisesLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  if (exercisesError || exercises.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center space-y-4 py-12">
        <p className="text-slate-500">Bài tập ngữ pháp cho bài học này chưa được soạn.</p>
        <Button variant="secondary" onClick={onNavigateHome}>Quay về Lộ trình</Button>
      </div>
    );
  }

  if (result) {
    const { score, total, passed, xp_earned } = result;
    const correctCount = Math.round((score / 100) * total);

    return (
      <div
        id="grammar-result-card"
        className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200/60 p-6 sm:p-10 shadow-sm text-center space-y-6 animate-in zoom-in duration-300"
      >
        <div className="space-y-2">
          {passed ? (
            <div className="w-20 h-20 bg-green-50 border-2 border-green-200 rounded-full flex items-center justify-center mx-auto text-4xl animate-bounce">
              🎉
            </div>
          ) : (
            <div className="w-20 h-20 bg-rose-50 border-2 border-rose-200 rounded-full flex items-center justify-center mx-auto text-4xl">
              😟
            </div>
          )}
          <h2 className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight leading-normal">
            {passed ? "Xuất sắc! Bạn đã vượt qua!" : "Cố gắng chút nữa nhé!"}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto font-sans leading-normal">
            {passed
              ? "Tuyệt vời, bạn đã tiếp thu bài học cực tốt và sẵn sàng mở khóa các lớp thử thách tiếp theo!"
              : "Để hoàn thiện bài học, bạn cần đạt tối thiểu 80% điểm số. Đừng nản lòng nhé!"}
          </p>
        </div>

        <div className="p-6 bg-slate-50/50 rounded-2xl border border-slate-100 max-w-xs mx-auto">
          <span className="text-[10px] text-slate-400 font-display font-bold uppercase tracking-wider block">
            KẾT QUẢ ĐẠT ĐƯỢC
          </span>
          <div className="flex items-baseline justify-center gap-1.5 mt-1">
            <span className={`text-4xl md:text-5xl font-display font-black ${passed ? "text-green-600" : "text-rose-600"}`}>
              {score}%
            </span>
            <span className="text-sm font-bold text-slate-500">({correctCount}/{total} câu)</span>
          </div>
          {xp_earned > 0 && (
            <span className="inline-block text-[10px] font-display font-bold px-2.5 py-0.5 rounded-full mt-2.5 uppercase bg-green-50 text-green-700">
              +{xp_earned} XP Tích lũy
            </span>
          )}
          {!passed && (
            <span className="inline-block text-[10px] font-display font-bold px-2.5 py-0.5 rounded-full mt-2.5 uppercase bg-rose-50 text-rose-700">
              Chưa đạt chuẩn 80%
            </span>
          )}
        </div>

        <div className="text-left space-y-3 pt-4 border-t border-slate-100">
          <h4 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest">
            Giải thích từng câu hỏi:
          </h4>
          <div className="space-y-2.5 max-h-[180px] overflow-y-auto pr-1">
            {exercises.map((ex, idx) => (
              <div key={ex.id} className="p-3 rounded-xl border border-slate-100 bg-slate-50/40 text-xs">
                <p className="font-display font-bold text-slate-800 leading-tight mb-1 whitespace-pre-wrap">
                  Câu {idx + 1}: {ex.promptText ?? "Phân loại"}
                </p>
                <p className="text-slate-500 text-[11px] leading-relaxed">
                  <b>Giải thích:</b> {ex.explanation}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={handleRetry}>
            <RotateCcw className="w-4 h-4 mr-2" /> Làm lại bài Test
          </Button>
          {passed ? (
            <Button variant="primary" className="flex-1" onClick={onNextLesson}>
              Học bài tiếp theo <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button variant="ghost" className="flex-1 text-slate-500" onClick={onNavigateHome}>
              Quay về Lộ trình
            </Button>
          )}
        </div>
      </div>
    );
  }

  const progressPercent = pages.length > 0 ? Math.round((currentPageIdx / pages.length) * 100) : 0;
  const canProceed = hasAnsweredAllOnPage();

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-6 pb-2 select-none">
        <div className="flex-1">
          <ProgressBar value={progressPercent} className="text-xs" />
        </div>
        <span className="text-xs font-display font-extrabold text-slate-500 shrink-0 bg-slate-100 px-3 py-1.5 rounded-full">
          Trang {currentPageIdx + 1} / {pages.length}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {currentPage.map((exercise, i) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            index={questionOffset + i}
            selectedTokens={selectedTokensByExercise[exercise.id] ?? []}
            onToggleToken={(token, tokenIdx) => toggleToken(exercise.id, token, tokenIdx)}
            onClearTokens={() => setSelectedTokensByExercise((prev) => ({ ...prev, [exercise.id]: [] }))}
            textAnswer={textAnswerByExercise[exercise.id] ?? ""}
            onTextAnswerChange={(value) => setTextAnswerByExercise((prev) => ({ ...prev, [exercise.id]: value }))}
            itemGroups={itemGroupsByExercise[exercise.id] ?? {}}
            onItemGroupChange={(item, group) =>
              setItemGroupsByExercise((prev) => ({
                ...prev,
                [exercise.id]: { ...(prev[exercise.id] ?? {}), [item]: group },
              }))
            }
          />
        ))}
      </div>

      {submitError && <p className="text-sm text-red-500 text-center">{submitError}</p>}

      <div className="flex justify-end">
        <Button variant="primary" disabled={!canProceed || submitting} onClick={isLastPage ? handleSubmit : handleNext}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : !isLastPage && <ArrowRight className="w-4 h-4 ml-2" />}
          {isLastPage ? "Nộp bài" : "Trang tiếp theo"}
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: không có lỗi TypeScript liên quan đến `GrammarExercisePage.tsx`.

- [ ] **Step 3: Kiểm thử thủ công trên browser**

Cần 1 bài học có bài tập ngữ pháp với **nhiều loại**, và ít nhất 1 loại có **>10 câu** (nếu chưa có dữ liệu như vậy, dùng Task 4 để tạo qua admin trước khi test bước này, hoặc tạo tạm qua SQL/Supabase Studio rồi xoá sau khi test xong).

- Vào tab "Grammatikübungen" của bài học đó → bấm "Bắt đầu bài tập ngữ pháp".
- Xác nhận trang đầu tiên chỉ chứa các câu cùng 1 loại bài tập, hiển thị dạng lưới 2 cột (desktop), tối đa 10 câu, không cần cuộn trang ở màn hình chuẩn (~1280px).
- Trả lời chưa đủ hết các câu trên trang → nút "Trang tiếp theo" bị disable.
- Trả lời đủ → bấm "Trang tiếp theo" → xác nhận sang trang chứa câu loại khác (hoặc phần còn lại của loại có >10 câu).
- Xác nhận label "Trang X / N" cập nhật đúng qua từng trang.
- Ở trang cuối cùng, nút đổi thành "Nộp bài" → bấm → xác nhận gọi đúng Edge Function `grammar-submit`, hiển thị màn hình kết quả với điểm số khớp với các câu đã trả lời qua tất cả các trang (kiểm tra qua Network tab hoặc kết quả hiển thị).
- Bấm "Làm lại bài Test" → xác nhận quay về trang 1, các đáp án đã nhập trước đó bị reset.

- [ ] **Step 4: Commit**

```bash
git add src/pages/GrammarExercisePage.tsx
git commit -m "feat: group grammar exercises by type into wide, paginated screens"
```

---

### Task 4: Admin — nút "+" thêm nhiều câu cùng loại trong 1 lần lưu

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx` (rewrite toàn bộ file)

**Interfaces:**
- Consumes: Supabase table `grammar_exercises` (không đổi schema), `showToast` từ `src/lib/toast.ts`.
- Produces: không có API mới — thay đổi thuần UI/state nội bộ component.

- [ ] **Step 1: Thay toàn bộ nội dung file**

Form state đổi từ 1 object (`form: EditForm`) sang mảng (`entries: EditForm[]`), tách phần field-theo-loại ra component con `ExerciseEntryFields` để dùng lại cho mỗi entry. Thay thế **toàn bộ nội dung** `src/pages/admin/AdminGrammarExerciseSection.tsx` bằng:

```tsx
import React, { useState, useEffect } from "react";
import { Loader2, Pencil, Trash2, Plus, ChevronDown, ChevronRight, X, Search, Eye } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, LessonStatusBadge } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";

interface GrammarExercise {
  id: string;
  lesson_id: string;
  type:
    | "word_reorder"
    | "error_correction"
    | "translation"
    | "sentence_transformation"
    | "guided_sentence_writing"
    | "classification";
  status: "draft" | "published";
  prompt_text: string | null;
  transformation_hint: string | null;
  correct_answer: string | null;
  tokens: string[] | null;
  classification_groups: string[] | null;
  classification_items: { item: string; group: string }[] | null;
  explanation: string;
  order_index: number;
}

interface LessonGroup {
  lesson_id: string;
  lesson_title: string;
  module_title: string;
  exercises: GrammarExercise[];
}

const TYPE_LABELS: Record<GrammarExercise["type"], string> = {
  word_reorder: "Sắp xếp từ",
  error_correction: "Sửa câu sai",
  translation: "Dịch",
  sentence_transformation: "Biến đổi câu",
  guided_sentence_writing: "Viết câu gợi ý",
  classification: "Phân loại",
};

const TYPE_COLORS: Record<GrammarExercise["type"], string> = {
  word_reorder: "bg-blue-50 text-blue-700",
  error_correction: "bg-rose-50 text-rose-700",
  translation: "bg-emerald-50 text-emerald-700",
  sentence_transformation: "bg-purple-50 text-purple-700",
  guided_sentence_writing: "bg-amber-50 text-amber-700",
  classification: "bg-teal-50 text-teal-700",
};

interface EditForm {
  type: GrammarExercise["type"];
  status: "draft" | "published";
  prompt_text: string;
  transformation_hint: string;
  correct_answer: string;
  tokens_input: string;
  classification_groups: string[];
  classification_items: { item: string; group: string }[];
  explanation: string;
  order_index: number;
}

const EMPTY_FORM: EditForm = {
  type: "word_reorder",
  status: "draft",
  prompt_text: "",
  transformation_hint: "",
  correct_answer: "",
  tokens_input: "",
  classification_groups: [],
  classification_items: [],
  explanation: "",
  order_index: 0,
};

const inputCls =
  "w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500";
const labelCls = "block text-xs font-bold text-slate-600 mb-1";

const normalizeWord = (s: string): string => s.toLowerCase().replace(/[.,!?]/g, "").trim();

const validateForm = (f: EditForm): string | null => {
  if (f.type === "word_reorder") {
    const tokens = f.tokens_input.split("/").map((t) => t.trim()).filter(Boolean);
    if (tokens.length < 2) return "Cần ít nhất 2 từ.";
    if (!f.correct_answer.trim()) return "Câu đúng không được để trống.";
    const answerWords = f.correct_answer.split(/\s+/).map(normalizeWord).filter(Boolean).sort();
    const tokenWords = tokens.flatMap((t) => t.split(/\s+/)).map(normalizeWord).filter(Boolean).sort();
    if (JSON.stringify(answerWords) !== JSON.stringify(tokenWords)) {
      return "Các từ cho sẵn không khớp với câu đúng — kiểm tra lại chính tả.";
    }
    return null;
  }
  if (f.type === "error_correction") {
    if (!f.prompt_text.trim()) return "Câu sai không được để trống.";
    if (!f.correct_answer.trim()) return "Câu đúng không được để trống.";
    if (f.prompt_text.trim() === f.correct_answer.trim()) return "Câu sai và câu đúng giống nhau — không có lỗi để sửa.";
    return null;
  }
  if (f.type === "translation") {
    if (!f.prompt_text.trim()) return "Câu tiếng Việt không được để trống.";
    if (!f.correct_answer.trim()) return "Câu tiếng Đức không được để trống.";
    return null;
  }
  if (f.type === "sentence_transformation") {
    if (!f.prompt_text.trim()) return "Câu gốc không được để trống.";
    if (!f.transformation_hint.trim()) return "Yêu cầu biến đổi không được để trống.";
    if (!f.correct_answer.trim()) return "Câu đúng sau biến đổi không được để trống.";
    return null;
  }
  if (f.type === "guided_sentence_writing") {
    if (!f.prompt_text.trim()) return "Dữ liệu gợi ý không được để trống.";
    if (!f.correct_answer.trim()) return "Câu đúng không được để trống.";
    return null;
  }
  // classification
  const groups = f.classification_groups.map((g) => g.trim()).filter(Boolean);
  const uniqueGroups = new Set(groups.map((g) => g.toLowerCase()));
  if (groups.length < 2 || uniqueGroups.size !== groups.length) {
    return "Cần ít nhất 2 nhóm phân loại, không trùng tên.";
  }
  if (f.classification_items.length === 0 || f.classification_items.some((it) => !it.item.trim())) {
    return "Cần ít nhất 1 item để phân loại.";
  }
  if (f.classification_items.some((it) => !groups.includes(it.group))) {
    return "Mỗi item phải thuộc một nhóm hợp lệ.";
  }
  return null;
};

const buildPayload = (form: EditForm) => ({
  type: form.type,
  status: form.status,
  prompt_text: form.type === "word_reorder" || form.type === "classification" ? null : form.prompt_text,
  transformation_hint: form.type === "sentence_transformation" ? form.transformation_hint : null,
  correct_answer: form.type === "classification" ? null : form.correct_answer,
  tokens:
    form.type === "word_reorder"
      ? form.tokens_input.split("/").map((t) => t.trim()).filter(Boolean)
      : null,
  classification_groups:
    form.type === "classification" ? form.classification_groups.map((g) => g.trim()).filter(Boolean) : null,
  classification_items:
    form.type === "classification" ? form.classification_items.filter((it) => it.item.trim()) : null,
  explanation: form.explanation,
  order_index: form.order_index,
});

const addGroupToForm = (f: EditForm): EditForm => ({ ...f, classification_groups: [...f.classification_groups, ""] });

const setGroupInForm = (f: EditForm, i: number, val: string): EditForm => {
  const groups = [...f.classification_groups];
  const oldVal = groups[i];
  groups[i] = val;
  return {
    ...f,
    classification_groups: groups,
    classification_items: f.classification_items.map((it) => (it.group === oldVal ? { ...it, group: val } : it)),
  };
};

const removeGroupFromForm = (f: EditForm, i: number): EditForm => {
  const removed = f.classification_groups[i];
  return {
    ...f,
    classification_groups: f.classification_groups.filter((_, idx) => idx !== i),
    classification_items: f.classification_items.map((it) => (it.group === removed ? { ...it, group: "" } : it)),
  };
};

const addItemToForm = (f: EditForm): EditForm => ({
  ...f,
  classification_items: [...f.classification_items, { item: "", group: f.classification_groups[0] ?? "" }],
});

const setItemInForm = (f: EditForm, i: number, key: "item" | "group", val: string): EditForm => {
  const items = [...f.classification_items];
  items[i] = { ...items[i], [key]: val };
  return { ...f, classification_items: items };
};

const removeItemFromForm = (f: EditForm, i: number): EditForm => ({
  ...f,
  classification_items: f.classification_items.filter((_, idx) => idx !== i),
});

const previewContent = (ex: GrammarExercise): string => {
  if (ex.type === "classification") {
    return `${ex.classification_items?.length ?? 0} item · ${ex.classification_groups?.length ?? 0} nhóm`;
  }
  if (ex.type === "word_reorder") {
    return ex.correct_answer ?? "";
  }
  return ex.prompt_text ?? "";
};

const ExerciseTable: React.FC<{
  exercises: GrammarExercise[];
  onEdit: (ex: GrammarExercise) => void;
  onDelete: (ex: GrammarExercise) => void;
  onPreview: (ex: GrammarExercise) => void;
}> = ({ exercises, onEdit, onDelete, onPreview }) => (
  <table className="w-full text-sm">
    <thead>
      <tr className="bg-slate-50">
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-8">#</th>
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-32">Loại</th>
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500">Nội dung</th>
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-24">Trạng thái</th>
        <th className="px-4 py-2 w-20"></th>
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-50">
      {exercises.map((ex) => (
        <tr key={ex.id} className="hover:bg-slate-50/50 group">
          <td className="px-4 py-2.5 text-slate-400 text-xs">{ex.order_index}</td>
          <td className="px-4 py-2.5">
            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${TYPE_COLORS[ex.type]}`}>
              {TYPE_LABELS[ex.type]}
            </span>
          </td>
          <td className="px-4 py-2.5 text-slate-700 max-w-xs truncate">{previewContent(ex)}</td>
          <td className="px-4 py-2.5">
            <span
              className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                ex.status === "published" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {ex.status === "published" ? "Đã publish" : "Nháp"}
            </span>
          </td>
          <td className="px-4 py-2.5">
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onPreview(ex)}
                className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-600 transition-colors"
                title="Preview"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onEdit(ex)}
                className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                title="Chỉnh sửa"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(ex)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                title="Xóa"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

const ExerciseEntryFields: React.FC<{
  entry: EditForm;
  onChange: (updater: (prev: EditForm) => EditForm) => void;
}> = ({ entry, onChange }) => (
  <>
    {entry.type === "word_reorder" && (
      <>
        <div>
          <label className={labelCls}>Các từ cho sẵn *</label>
          <input
            type="text"
            value={entry.tokens_input}
            onChange={(e) => onChange((prev) => ({ ...prev, tokens_input: e.target.value }))}
            className={inputCls}
            placeholder="am Abend / ich / Musik / höre"
          />
        </div>
        <div>
          <label className={labelCls}>Câu đúng *</label>
          <textarea
            rows={2}
            value={entry.correct_answer}
            onChange={(e) => onChange((prev) => ({ ...prev, correct_answer: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Ich höre am Abend Musik."
          />
        </div>
      </>
    )}

    {entry.type === "error_correction" && (
      <>
        <div>
          <label className={labelCls}>Câu sai *</label>
          <textarea
            rows={2}
            value={entry.prompt_text}
            onChange={(e) => onChange((prev) => ({ ...prev, prompt_text: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Ich stehe auf um 7 Uhr."
          />
        </div>
        <div>
          <label className={labelCls}>Câu đúng *</label>
          <textarea
            rows={2}
            value={entry.correct_answer}
            onChange={(e) => onChange((prev) => ({ ...prev, correct_answer: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Ich stehe um 7 Uhr auf."
          />
        </div>
      </>
    )}

    {entry.type === "translation" && (
      <>
        <div>
          <label className={labelCls}>Câu tiếng Việt *</label>
          <textarea
            rows={2}
            value={entry.prompt_text}
            onChange={(e) => onChange((prev) => ({ ...prev, prompt_text: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Tôi học tiếng Đức."
          />
        </div>
        <div>
          <label className={labelCls}>Câu tiếng Đức *</label>
          <textarea
            rows={2}
            value={entry.correct_answer}
            onChange={(e) => onChange((prev) => ({ ...prev, correct_answer: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Ich lerne Deutsch."
          />
        </div>
      </>
    )}

    {entry.type === "sentence_transformation" && (
      <>
        <div>
          <label className={labelCls}>Câu gốc *</label>
          <textarea
            rows={2}
            value={entry.prompt_text}
            onChange={(e) => onChange((prev) => ({ ...prev, prompt_text: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Du kommst heute."
          />
        </div>
        <div>
          <label className={labelCls}>Yêu cầu biến đổi *</label>
          <input
            type="text"
            value={entry.transformation_hint}
            onChange={(e) => onChange((prev) => ({ ...prev, transformation_hint: e.target.value }))}
            className={inputCls}
            placeholder="Ja/Nein-Frage"
          />
        </div>
        <div>
          <label className={labelCls}>Câu đúng sau biến đổi *</label>
          <textarea
            rows={2}
            value={entry.correct_answer}
            onChange={(e) => onChange((prev) => ({ ...prev, correct_answer: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Kommst du heute?"
          />
        </div>
      </>
    )}

    {entry.type === "guided_sentence_writing" && (
      <>
        <div>
          <label className={labelCls}>Dữ liệu gợi ý *</label>
          <textarea
            rows={2}
            value={entry.prompt_text}
            onChange={(e) => onChange((prev) => ({ ...prev, prompt_text: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Ich bin müde. Ich arbeite. + aber"
          />
        </div>
        <div>
          <label className={labelCls}>Câu đúng *</label>
          <textarea
            rows={2}
            value={entry.correct_answer}
            onChange={(e) => onChange((prev) => ({ ...prev, correct_answer: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Ich bin müde, aber ich arbeite."
          />
        </div>
      </>
    )}

    {entry.type === "classification" && (
      <>
        <div>
          <label className={labelCls}>Nhóm phân loại *</label>
          <div className="space-y-2">
            {entry.classification_groups.map((g, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={g}
                  onChange={(e) => onChange((prev) => setGroupInForm(prev, i, e.target.value))}
                  className={inputCls + " flex-1"}
                  placeholder={`Nhóm ${i + 1}`}
                />
                <button
                  onClick={() => onChange((prev) => removeGroupFromForm(prev, i))}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={() => onChange(addGroupToForm)}
              className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm nhóm
            </button>
          </div>
        </div>
        <div>
          <label className={labelCls}>Items *</label>
          <div className="space-y-2">
            {entry.classification_items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={it.item}
                  onChange={(e) => onChange((prev) => setItemInForm(prev, i, "item", e.target.value))}
                  className={inputCls + " flex-1"}
                  placeholder="Tisch"
                />
                <select
                  value={it.group}
                  onChange={(e) => onChange((prev) => setItemInForm(prev, i, "group", e.target.value))}
                  className={inputCls + " w-28"}
                >
                  <option value="">--</option>
                  {entry.classification_groups.filter(Boolean).map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => onChange((prev) => removeItemFromForm(prev, i))}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={() => onChange(addItemToForm)}
              disabled={entry.classification_groups.filter(Boolean).length === 0}
              className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm item
            </button>
          </div>
        </div>
      </>
    )}

    <div>
      <label className={labelCls}>Giải thích</label>
      <textarea
        rows={2}
        value={entry.explanation}
        onChange={(e) => onChange((prev) => ({ ...prev, explanation: e.target.value }))}
        className={inputCls + " resize-none"}
        placeholder="Giải thích tại sao đáp án này đúng..."
      />
    </div>
  </>
);

export const AdminGrammarExerciseSection: React.FC = () => {
  const [groups, setGroups] = useState<LessonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editLessonId, setEditLessonId] = useState<string>("");
  const [entries, setEntries] = useState<EditForm[]>([EMPTY_FORM]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GrammarExercise | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<GrammarExercise | null>(null);

  const fetchExercises = async () => {
    const [exercisesRes, lessonsRes] = await Promise.all([
      supabase.from("grammar_exercises").select("*").order("lesson_id").order("order_index"),
      supabase.from("lessons").select("id, title_vi, module_id, modules(title_vi)").order("order_index"),
    ]);

    const exercisesByLesson: Record<string, GrammarExercise[]> = {};
    for (const ex of exercisesRes.data ?? []) {
      (exercisesByLesson[ex.lesson_id] ??= []).push(ex as GrammarExercise);
    }

    const grouped: LessonGroup[] = (lessonsRes.data ?? []).map((l) => ({
      lesson_id: l.id,
      lesson_title: l.title_vi,
      module_title: (l.modules as unknown as { title_vi: string } | null)?.title_vi ?? "",
      exercises: exercisesByLesson[l.id] ?? [],
    }));

    setGroups(grouped);
    setLoading(false);
  };

  useEffect(() => {
    fetchExercises();
  }, []);

  const openCreate = (lessonId: string, nextOrder: number) => {
    setEditId(null);
    setEditLessonId(lessonId);
    setEntries([{ ...EMPTY_FORM, order_index: nextOrder }]);
    setModalOpen(true);
  };

  const openEdit = (ex: GrammarExercise) => {
    setEditId(ex.id);
    setEditLessonId(ex.lesson_id);
    setEntries([
      {
        type: ex.type,
        status: ex.status,
        prompt_text: ex.prompt_text ?? "",
        transformation_hint: ex.transformation_hint ?? "",
        correct_answer: ex.correct_answer ?? "",
        tokens_input: (ex.tokens ?? []).join(" / "),
        classification_groups: ex.classification_groups ?? [],
        classification_items: ex.classification_items ?? [],
        explanation: ex.explanation,
        order_index: ex.order_index,
      },
    ]);
    setModalOpen(true);
  };

  const handleTypeChange = (newType: EditForm["type"]) =>
    setEntries((prev) => [{ ...EMPTY_FORM, order_index: prev[0]?.order_index ?? 0, status: prev[0]?.status ?? "draft", type: newType }]);

  const addEntry = () =>
    setEntries((prev) => [
      ...prev,
      { ...EMPTY_FORM, type: prev[0].type, status: prev[0].status, order_index: (prev[prev.length - 1]?.order_index ?? 0) + 1 },
    ]);

  const removeEntry = (idx: number) => setEntries((prev) => prev.filter((_, i) => i !== idx));

  const updateEntry = (idx: number, updater: (prev: EditForm) => EditForm) =>
    setEntries((prev) => prev.map((e, i) => (i === idx ? updater(e) : e)));

  const handleSave = async () => {
    for (let i = 0; i < entries.length; i++) {
      const errorMsg = validateForm(entries[i]);
      if (errorMsg) {
        showToast(entries.length > 1 ? `Câu ${i + 1}: ${errorMsg}` : errorMsg, "warning");
        return;
      }
    }

    setSaving(true);

    let error;
    if (editId) {
      ({ error } = await supabase.from("grammar_exercises").update(buildPayload(entries[0])).eq("id", editId));
    } else {
      const payloads = entries.map((entry) => ({ ...buildPayload(entry), lesson_id: editLessonId }));
      ({ error } = await supabase.from("grammar_exercises").insert(payloads));
    }

    setSaving(false);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast(editId ? "Đã cập nhật bài tập." : `Đã thêm ${entries.length} bài tập.`, "success");
      setModalOpen(false);
      fetchExercises();
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("grammar_exercises").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      showToast("Xóa thất bại: " + error.message, "warning");
    } else {
      showToast("Đã xóa bài tập.", "success");
      setDeleteTarget(null);
      fetchExercises();
    }
  };

  const handlePublish = async () => {
    if (!editId) return;
    setSaving(true);
    const { error } = await supabase.from("grammar_exercises").update({ status: "published" }).eq("id", editId);
    setSaving(false);
    if (error) {
      showToast("Publish thất bại: " + error.message, "warning");
    } else {
      showToast("Đã publish bài tập.", "success");
      setEntries((prev) => [{ ...prev[0], status: "published" }]);
      fetchExercises();
    }
  };

  const handleRevertToDraft = async () => {
    if (!editId) return;
    setSaving(true);
    const { error } = await supabase.from("grammar_exercises").update({ status: "draft" }).eq("id", editId);
    setSaving(false);
    if (error) {
      showToast("Chuyển về Nháp thất bại: " + error.message, "warning");
    } else {
      showToast("Đã chuyển về Nháp.", "success");
      setEntries((prev) => [{ ...prev[0], status: "draft" }]);
      fetchExercises();
    }
  };

  const filteredGroups = groups.filter(
    (g) =>
      g.lesson_title.toLowerCase().includes(search.toLowerCase()) ||
      g.module_title.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-48">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-display font-black text-slate-900">Bài tập ngữ pháp</h1>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm bài học..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
        </div>
      </div>

      <div className="space-y-3">
        {filteredGroups.map((group) => (
          <div key={group.lesson_id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpanded((prev) => ({ ...prev, [group.lesson_id]: !prev[group.lesson_id] }))}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
            >
              {expanded[group.lesson_id] ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
              <div className="flex-1">
                <p className="font-display font-bold text-slate-900 text-sm">{group.lesson_title}</p>
                <p className="text-xs text-slate-400">
                  {group.module_title} · {group.exercises.length} bài tập
                </p>
              </div>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  openCreate(group.lesson_id, group.exercises.length);
                }}
                className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm bài tập
              </span>
            </button>

            {expanded[group.lesson_id] && (
              <div className="border-t border-slate-100 p-4 space-y-3">
                {group.exercises.length === 0 ? (
                  <p className="text-center py-6 text-slate-400 text-sm">Chưa có bài tập nào cho bài học này.</p>
                ) : (
                  <ExerciseTable exercises={group.exercises} onEdit={openEdit} onDelete={setDeleteTarget} onPreview={setPreviewTarget} />
                )}
              </div>
            )}
          </div>
        ))}
        {filteredGroups.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            Không tìm thấy bài học nào khớp với "{search}".
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8 space-y-4 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-slate-900">{editId ? "Chỉnh sửa bài tập" : "Thêm bài tập mới"}</h3>
                {editId && <LessonStatusBadge status={entries[0].status} />}
              </div>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className={labelCls}>Loại bài tập</label>
              <select
                value={entries[0].type}
                onChange={(e) => handleTypeChange(e.target.value as EditForm["type"])}
                className={inputCls}
              >
                {Object.entries(TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {entries.map((entry, idx) => (
              <div key={idx} className="border border-slate-100 rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase">Câu {idx + 1}</span>
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] text-slate-400">Thứ tự (#)</label>
                    <input
                      type="number"
                      value={entry.order_index}
                      onChange={(e) => updateEntry(idx, (prev) => ({ ...prev, order_index: parseInt(e.target.value) || 0 }))}
                      className="w-16 px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                      min={0}
                    />
                    {entries.length > 1 && (
                      <button
                        onClick={() => removeEntry(idx)}
                        className="p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <ExerciseEntryFields entry={entry} onChange={(updater) => updateEntry(idx, updater)} />
              </div>
            ))}

            {!editId && (
              <button
                onClick={addEntry}
                className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1.5 rounded-lg hover:bg-orange-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm câu cùng loại
              </button>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>
                Hủy
              </Button>
              <Button variant="primary" className="flex-1" onClick={handleSave}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {editId ? "Lưu thay đổi" : entries.length > 1 ? `Thêm ${entries.length} bài tập` : "Thêm bài tập"}
              </Button>
              {editId &&
                (entries[0].status === "draft" ? (
                  <Button variant="ghost" size="sm" onClick={handlePublish} className="w-full" disabled={saving}>
                    Publish
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={handleRevertToDraft} className="w-full" disabled={saving}>
                    Chuyển về Nháp
                  </Button>
                ))}
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-900">Xóa bài tập?</h3>
                <p className="text-xs text-slate-500 mt-0.5">Hành động này không thể hoàn tác.</p>
              </div>
            </div>
            <div className="bg-red-50 rounded-xl px-4 py-3 text-sm text-red-700 line-clamp-2">
              {previewContent(deleteTarget)}
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>
                Hủy
              </Button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-display font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}

      {previewTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-slate-900">Xem trước — {TYPE_LABELS[previewTarget.type]}</h3>
              <button onClick={() => setPreviewTarget(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {previewTarget.type === "word_reorder" && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(previewTarget.tokens ?? []).map((t, i) => (
                    <span key={i} className="px-3 py-1.5 bg-slate-100 rounded-lg text-sm font-mono">
                      {t}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-green-700 font-medium">{previewTarget.correct_answer}</p>
              </div>
            )}

            {previewTarget.type === "error_correction" && (
              <div className="space-y-2">
                <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 line-through">{previewTarget.prompt_text}</p>
                <p className="text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2">{previewTarget.correct_answer}</p>
              </div>
            )}

            {previewTarget.type === "translation" && (
              <div className="flex items-center gap-3">
                <p className="text-sm text-slate-700 flex-1">{previewTarget.prompt_text}</p>
                <span className="text-slate-300">→</span>
                <p className="text-sm text-green-700 flex-1">{previewTarget.correct_answer}</p>
              </div>
            )}

            {previewTarget.type === "sentence_transformation" && (
              <div className="space-y-2">
                <p className="text-sm text-slate-700">{previewTarget.prompt_text}</p>
                <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 uppercase">
                  Yêu cầu: {previewTarget.transformation_hint}
                </span>
                <p className="text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2">{previewTarget.correct_answer}</p>
              </div>
            )}

            {previewTarget.type === "guided_sentence_writing" && (
              <div className="space-y-2">
                <p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2">{previewTarget.prompt_text}</p>
                <p className="text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2">{previewTarget.correct_answer}</p>
              </div>
            )}

            {previewTarget.type === "classification" && (
              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: `repeat(${(previewTarget.classification_groups ?? []).length || 1}, minmax(0, 1fr))`,
                }}
              >
                {(previewTarget.classification_groups ?? []).map((g) => (
                  <div key={g} className="space-y-1.5">
                    <p className="text-xs font-bold text-slate-500 uppercase text-center">{g}</p>
                    {(previewTarget.classification_items ?? [])
                      .filter((it) => it.group === g)
                      .map((it, i) => (
                        <p key={i} className="text-sm text-center bg-slate-50 rounded-lg px-2 py-1">
                          {it.item}
                        </p>
                      ))}
                  </div>
                ))}
              </div>
            )}

            {previewTarget.explanation && (
              <p className="text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-200">
                {previewTarget.explanation}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: không có lỗi TypeScript liên quan đến `AdminGrammarExerciseSection.tsx`.

- [ ] **Step 3: Kiểm thử thủ công trên browser**

Vào trang admin (container admin, `AdminQuizSection` → tab "Ngữ pháp"):

- Bấm "Thêm bài tập" ở 1 bài học → modal mở, chỉ có 1 khối "Câu 1".
- Điền đủ thông tin loại "Sắp xếp từ" → bấm "+ Thêm câu cùng loại" → xác nhận xuất hiện khối "Câu 2" cùng loại `word_reorder`, giữ nguyên khối "Câu 1" đã điền.
- Bấm "+" thêm khối "Câu 3", điền tiếp → bấm "Thêm 3 bài tập" → xác nhận toast "Đã thêm 3 bài tập.", modal đóng, danh sách bài tập của bài học đó có thêm 3 dòng mới với `order_index` tăng dần.
- Mở lại modal tạo mới, đổi "Loại bài tập" từ "Sắp xếp từ" sang "Dịch" giữa chừng khi đã có 2 khối → xác nhận cả 2 khối bị reset về 1 khối trống loại "Dịch".
- Thử để trống 1 field bắt buộc ở khối "Câu 2" rồi bấm lưu → xác nhận toast báo lỗi có ghi rõ "Câu 2: ..." và không có bài tập nào được lưu.
- Bấm nút xoá (X) ở 1 khối khi có ≥2 khối → xác nhận khối đó biến mất, các khối còn lại giữ nguyên dữ liệu.
- Bấm "Chỉnh sửa" 1 bài tập có sẵn → xác nhận modal chỉ có đúng 1 khối, **không có** nút "+ Thêm câu cùng loại", sửa xong lưu vẫn hoạt động như cũ (không tạo thêm bản ghi mới).
- Xác nhận Publish / Chuyển về Nháp / Xóa / Preview vẫn hoạt động như trước khi sửa.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/AdminGrammarExerciseSection.tsx
git commit -m "feat: allow batch-adding same-type grammar questions via + button"
```

---

## Self-Review Checklist (đã thực hiện khi viết plan)

- **Spec coverage**: Mục 1 (tab mặc định) → Task 1. Mục 2 (nút "+") → Task 4. Mục 3 (gộp theo loại) → Task 2 + Task 3. Mục 4 (lưới rộng ~10 câu/màn hình) → Task 3. Không có mục nào trong spec thiếu task tương ứng.
- **Placeholder scan**: Không có "TBD"/"TODO"/"tương tự Task N" — mọi step đều có code đầy đủ.
- **Type consistency**: `groupExercisesIntoPages` (Task 2) khớp chữ ký dùng ở Task 3 (`groupExercisesIntoPages(exercises: GrammarExercise[]): GrammarExercise[][]`). `EditForm`/`buildPayload`/`ExerciseEntryFields` trong Task 4 dùng nhất quán tên trường xuyên suốt.
