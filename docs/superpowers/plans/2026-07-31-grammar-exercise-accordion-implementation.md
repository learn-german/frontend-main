# Gộp danh sách bài tập ngữ pháp thành 1 trang accordion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gộp `GrammarSetListPage` (danh sách set) + `GrammarExercisePage` (làm bài 1 set) thành 1 trang duy nhất dạng accordion 2 cấp, bỏ khóa tuần tự giữa các set.

**Architecture:** `GrammarExercisePage.tsx` đổi từ "trang full-page" thành component nội dung nhúng (`GrammarExerciseSetBody`, không còn header/wrapper riêng). `GrammarSetListPage.tsx` trở thành trang duy nhất: giữ header, liệt kê set dạng accordion (không khóa), mount `GrammarExerciseSetBody` vào set đang mở. `GrammarExerciseFlow.tsx` (wrapper switch list/detail cũ) bị xóa; `App.tsx` gọi thẳng `GrammarSetListPage`.

**Tech Stack:** React 19 + TypeScript, Tailwind v4, lucide-react icons — không có thay đổi tech stack.

## Global Constraints

- Không đổi hành vi tính điểm / lưu draft / gọi Edge Function `grammar-submit` — chỉ tái cấu trúc UI/props.
- Category `nghe`/`đọc` (`QuizPage.tsx`) ngoài phạm vi — không đụng tới.
- Không thêm package mới.
- Comment/label hiển thị: tiếng Việt. Code (tên biến, hàm, type): tiếng Anh.

---

### Task 1: Đổi `GrammarExercisePage.tsx` thành component nội dung `GrammarExerciseSetBody`

**Files:**
- Modify: `src/pages/GrammarExercisePage.tsx`

**Interfaces:**
- Consumes: không đổi so với hiện tại (`useGrammarExercises`, `useExerciseSetAttempt`, `useExerciseSetDraft`, `parseAnswersIntoFormState`, `groupGrammarExercises`, `supabase.functions.invoke`).
- Produces: `export const GrammarExerciseSetBody: React.FC<GrammarExerciseSetBodyProps>` với
  `interface GrammarExerciseSetBodyProps { set: { id: string; title: string }; onSetFinished: (lessonQuizScore: number, xpEarned: number) => void; onCollapse: () => void; }`
  — Task 2 sẽ import đúng tên `GrammarExerciseSetBody` và props này.

- [ ] **Step 1: Đổi interface props — bỏ `lessonId`, bỏ `onBackToLesson`, đổi `onBackToList` → `onCollapse`**

Tìm khối interface hiện tại:

```tsx
interface GrammarExercisePageProps {
  lessonId: string;
  set: { id: string; title: string };
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
  onBackToList: () => void;
  onBackToLesson: () => void;
}
```

Thay bằng:

```tsx
interface GrammarExerciseSetBodyProps {
  set: { id: string; title: string };
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
  onCollapse: () => void;
}
```

- [ ] **Step 2: Đổi tên export component + chữ ký props, bỏ import `ExercisePageHeader`**

Tìm dòng khai báo component:

```tsx
export const GrammarExercisePage: React.FC<GrammarExercisePageProps> = ({
  set,
  onSetFinished,
  onBackToList,
  onBackToLesson,
}) => {
```

Thay bằng:

```tsx
export const GrammarExerciseSetBody: React.FC<GrammarExerciseSetBodyProps> = ({
  set,
  onSetFinished,
  onCollapse,
}) => {
```

Xóa dòng import `ExercisePageHeader` ở đầu file:

```tsx
import { ExercisePageHeader } from "../components/ExercisePageHeader";
```

(Sẽ bị `tsc` báo unused nếu không xóa — component này không còn render header riêng nữa.)

- [ ] **Step 3: Bỏ page-chrome ở khối loading**

Tìm:

```tsx
  if (exercisesLoading || attemptLoading || draftLoading || awaitingHydration) {
    return (
      <div className="max-w-5xl mx-auto space-y-8">
        <ExercisePageHeader title="Bài tập ngữ pháp" onBackToLesson={onBackToLesson} />
        <div className="flex items-center justify-center min-h-64">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
      </div>
    );
  }
```

Thay bằng:

```tsx
  if (exercisesLoading || attemptLoading || draftLoading || awaitingHydration) {
    return (
      <div className="flex items-center justify-center min-h-32">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }
```

- [ ] **Step 4: Bỏ page-chrome ở khối lỗi/rỗng**

Tìm:

```tsx
  if (exercisesError || exercises.length === 0) {
    return (
      <div className="max-w-5xl mx-auto space-y-8">
        <ExercisePageHeader title="Bài tập ngữ pháp" onBackToLesson={onBackToLesson} />
        <div className="text-center py-12">
          <p className="text-slate-500">Bài tập ngữ pháp cho bài học này chưa được soạn.</p>
        </div>
      </div>
    );
  }
```

Thay bằng:

```tsx
  if (exercisesError || exercises.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-500">Bài tập ngữ pháp cho bài học này chưa được soạn.</p>
      </div>
    );
  }
```

- [ ] **Step 5: Bỏ page-chrome ở khối kết quả (`if (result)`), đổi `onBackToList` → `onCollapse`**

Tìm mở đầu khối:

```tsx
  if (result) {
    const { score, total, correct, isPassed, revealed, xpEarned } = result;

    return (
      <div className="max-w-5xl mx-auto space-y-8">
        <ExercisePageHeader title="Bài tập ngữ pháp" onBackToLesson={onBackToLesson} />
        <div
          id="grammar-result-card"
          className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200/60 p-6 sm:p-10 shadow-sm text-center space-y-6 animate-in zoom-in duration-300"
        >
```

Thay bằng:

```tsx
  if (result) {
    const { score, total, correct, isPassed, revealed, xpEarned } = result;

    return (
      <div
        id="grammar-result-card"
        className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200/60 p-6 sm:p-10 shadow-sm text-center space-y-6 animate-in zoom-in duration-300"
      >
```

Tìm phần đóng khối (cuối cùng của `if (result)`, ngay trước `return (` của khối câu hỏi):

```tsx
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={handleRetry}>
            <RotateCcw className="w-4 h-4 mr-2" /> Làm lại bài Test
          </Button>
          {isPassed && (
            <Button variant="primary" className="flex-1" onClick={onBackToList}>
              Tiếp tục
            </Button>
          )}
          </div>
        </div>
      </div>
    );
  }
```

Thay bằng:

```tsx
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={handleRetry}>
            <RotateCcw className="w-4 h-4 mr-2" /> Làm lại bài Test
          </Button>
          {isPassed && (
            <Button variant="primary" className="flex-1" onClick={onCollapse}>
              Tiếp tục
            </Button>
          )}
          </div>
        </div>
    );
  }
```

(Bỏ 1 dòng `</div>` thừa do bỏ wrapper ngoài — chỉ còn đóng đúng 1 lớp `grammar-result-card`.)

- [ ] **Step 6: Bỏ page-chrome ở khối render câu hỏi chính**

Tìm:

```tsx
  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300">
      <ExercisePageHeader
        title="Bài tập ngữ pháp"
        subtitle="Bấm vào bài để hiển thị các câu."
        onBackToLesson={onBackToLesson}
      />

      <div className="space-y-3">
```

Thay bằng:

```tsx
  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="space-y-3">
```

Cuối khối này (dòng đóng), tìm:

```tsx
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={() => saveDraft(collectAllAnswers())}>
          Lưu
        </Button>
        <Button variant="primary" disabled={!allAnswered || submitting} onClick={handleSubmit}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Nộp bài
        </Button>
      </div>
    </div>
  );
};
```

Giữ nguyên y hệt (không đổi — vẫn đóng đúng 1 lớp `<div className="space-y-4 ...">`).

- [ ] **Step 7: Kiểm tra không còn tham chiếu tên cũ trong file này**

Chạy:

```bash
grep -n "GrammarExercisePageProps\|onBackToList\|onBackToLesson\|ExercisePageHeader" src/pages/GrammarExercisePage.tsx
```

Kỳ vọng: không có kết quả nào.

- [ ] **Step 8: Commit**

Build sẽ CHƯA pass ở bước này vì `GrammarExerciseFlow.tsx` (Task 3 mới xóa) còn import tên cũ — đây là trạng thái trung gian có chủ đích, không chạy `npm run lint` ở task này.

```bash
git add src/pages/GrammarExercisePage.tsx
git commit -m "refactor(grammar): GrammarExercisePage -> GrammarExerciseSetBody, bỏ page-chrome để nhúng vào accordion"
```

---

### Task 2: Viết lại `GrammarSetListPage.tsx` thành trang accordion 2 cấp, bỏ khóa tuần tự

**Files:**
- Modify: `src/pages/GrammarSetListPage.tsx`

**Interfaces:**
- Consumes: `GrammarExerciseSetBody` + `GrammarExerciseSetBodyProps` từ Task 1 (`../pages/GrammarExercisePage` — cùng thư mục `pages/`, import tương đối `./GrammarExercisePage`). `useExerciseSets()`, `useExerciseSetAttempts(setIds)` — không đổi.
- Produces: `export const GrammarSetListPage: React.FC<GrammarSetListPageProps>` với
  `interface GrammarSetListPageProps { lessonId: string; onBackToLesson: () => void; onSetFinished: (lessonQuizScore: number, xpEarned: number) => void; }`
  — Task 3 sẽ import đúng props này ở `App.tsx`.

- [ ] **Step 1: Thay toàn bộ nội dung file**

Ghi đè toàn bộ `src/pages/GrammarSetListPage.tsx` bằng:

```tsx
import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";
import { ExercisePageHeader } from "../components/ExercisePageHeader";
import { useExerciseSets } from "../lib/hooks/useExerciseSets";
import { useExerciseSetAttempts } from "../lib/hooks/useExerciseSetAttempt";
import { GrammarExerciseSetBody } from "./GrammarExercisePage";

interface GrammarSetListPageProps {
  lessonId: string;
  onBackToLesson: () => void;
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
}

export const GrammarSetListPage: React.FC<GrammarSetListPageProps> = ({
  lessonId,
  onBackToLesson,
  onSetFinished,
}) => {
  const { sets: allSets, loading: setsLoading } = useExerciseSets();
  const lessonSets = useMemo(
    () =>
      allSets
        .filter((s) => s.lessonId === lessonId && s.category === "nguphap" && s.status === "published")
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [allSets, lessonId],
  );
  const setIds = useMemo(() => lessonSets.map((s) => s.id), [lessonSets]);
  const { attemptsBySetId, loading: attemptsLoading } = useExerciseSetAttempts(setIds);
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);

  if (setsLoading || attemptsLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <ExercisePageHeader title="Bài tập ngữ pháp" onBackToLesson={onBackToLesson} />
        <div className="flex items-center justify-center min-h-64">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (lessonSets.length === 0) {
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <ExercisePageHeader title="Bài tập ngữ pháp" onBackToLesson={onBackToLesson} />
        <div className="text-center py-12">
          <p className="text-slate-500">Bài tập ngữ pháp cho bài học này chưa được soạn.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <ExercisePageHeader title="Bài tập ngữ pháp" onBackToLesson={onBackToLesson} />
      <div className="space-y-3">
        {lessonSets.map((set) => {
          const status = attemptsBySetId[set.id];
          const isPassed = status?.isPassed ?? false;
          const isExpanded = expandedSetId === set.id;

          return (
            <section
              key={set.id}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => setExpandedSetId(isExpanded ? null : set.id)}
                className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-slate-50"
              >
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-slate-400 shrink-0" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" />
                )}
                <span className="flex-1 font-display font-bold text-sm text-slate-800">{set.title}</span>
                {isPassed && <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />}
                <span
                  className={`text-[10px] font-display font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                    isPassed ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
                  }`}
                >
                  {isPassed ? "Đã đạt" : "Chưa làm"}
                </span>
              </button>
              {isExpanded && (
                <div className="border-t border-slate-100 p-4">
                  <GrammarExerciseSetBody
                    set={{ id: set.id, title: set.title }}
                    onSetFinished={onSetFinished}
                    onCollapse={() => setExpandedSetId(null)}
                  />
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

Build vẫn CHƯA pass (App.tsx còn dùng `GrammarExerciseFlow` cũ) — chưa chạy `npm run lint` ở task này.

```bash
git add src/pages/GrammarSetListPage.tsx
git commit -m "feat(grammar): GrammarSetListPage thành trang accordion 2 cấp, bỏ khoá tuần tự giữa các set"
```

---

### Task 3: Xóa `GrammarExerciseFlow.tsx`, cập nhật `App.tsx`

**Files:**
- Delete: `src/pages/GrammarExerciseFlow.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `GrammarSetListPage` + `GrammarSetListPageProps` từ Task 2.

- [ ] **Step 1: Xóa file wrapper cũ**

```bash
rm src/pages/GrammarExerciseFlow.tsx
```

- [ ] **Step 2: Đổi import trong `App.tsx`**

Tìm:

```tsx
import { GrammarExerciseFlow } from "./pages/GrammarExerciseFlow";
```

Thay bằng:

```tsx
import { GrammarSetListPage } from "./pages/GrammarSetListPage";
```

- [ ] **Step 3: Đổi chỗ gọi component trong `App.tsx`**

Tìm:

```tsx
                {activeExerciseCategory === "nguphap" ? (
                  <GrammarExerciseFlow
                    key={activeLessonObject.id}
                    lesson={activeLessonObject}
                    onQuizFinished={handleQuizFinished}
                    onNavigateHome={() => handleNavigate("roadmap")}
                    onNextLesson={handleNextLesson}
                    onBackToLesson={() => setCurrentPage("lesson-detail")}
                  />
                ) : (
```

Thay bằng:

```tsx
                {activeExerciseCategory === "nguphap" ? (
                  <GrammarSetListPage
                    key={activeLessonObject.id}
                    lessonId={activeLessonObject.id}
                    onBackToLesson={() => setCurrentPage("lesson-detail")}
                    onSetFinished={handleQuizFinished}
                  />
                ) : (
```

- [ ] **Step 4: Kiểm tra không còn tham chiếu nào tới tên cũ trong toàn repo**

```bash
grep -rn "GrammarExerciseFlow\|onSelectSet\|onBackToList\b" src/
```

Kỳ vọng: không có kết quả nào (chú ý `onBackToList` dùng word-boundary để không khớp nhầm tên khác nếu có).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(grammar): xoá GrammarExerciseFlow, App.tsx gọi thẳng GrammarSetListPage"
```

---

### Task 4: Regression toàn bộ + build

**Files:** không tạo/sửa file mới — chỉ chạy kiểm tra trên toàn bộ thay đổi của Task 1-3.

- [ ] **Step 1: Type check**

```bash
npm run lint
```

Kỳ vọng: không có lỗi. Nếu có lỗi liên quan `GrammarExerciseSetBodyProps`/`GrammarSetListPageProps` không khớp, đối chiếu lại đúng tên props giữa Task 1/2/3 ở trên (sai lệch tên là nguyên nhân phổ biến nhất).

- [ ] **Step 2: Chạy toàn bộ test suite hiện có**

```bash
npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts" tests/e2e/admin-classification-fields.playwright.test.ts
```

Kỳ vọng: tất cả pass (không có test nào phụ thuộc `GrammarExerciseFlow`/`GrammarExercisePage`/`GrammarSetListPage` cũ — đây là refactor UI thuần, không có unit test nào cho các file này).

- [ ] **Step 3: Build production**

```bash
npm run build
```

Kỳ vọng: build thành công, không lỗi.

- [ ] **Step 4: Test thủ công trên browser (dùng Browser pane, preview_start)**

Mở trang `/quiz/<lesson_id>/nguphap` (hoặc điều hướng qua UI tới 1 lesson có bài tập ngữ pháp), xác nhận bằng `read_page`/`computer`/`screenshot`:
1. Danh sách hiện tất cả set, không set nào bị mờ/khoá/có icon ổ khoá.
2. Bấm vào 1 set (kể cả set không phải set đầu tiên) → mở accordion ngay tại chỗ, không chuyển URL/route.
3. Bấm set thứ 2 trong khi set thứ nhất đang mở → set thứ nhất tự đóng lại, chỉ set thứ 2 mở.
4. Làm hết câu, nộp bài, pass → bấm "Tiếp tục" → accordion đó tự thu gọn lại, quay về danh sách.
5. Reload trang giữa chừng khi đang mở 1 set → quay về danh sách, mọi set đóng (đúng hành vi cũ đã chốt, giờ diễn giải lại thành "accordion đóng hết" thay vì "quay về trang danh sách").

- [ ] **Step 5: Commit nếu Step 4 phát hiện chỉnh sửa nhỏ, hoặc bỏ qua nếu không có thay đổi gì thêm**

Nếu không có sửa gì thêm ở Step 4, không cần commit rỗng — Task 4 chỉ là bước xác minh.
