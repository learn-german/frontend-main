# Exercise Back-to-Lesson Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the grammar-theory tab and add a top-level return-to-lesson action to every learner exercise flow.

**Architecture:** Export the lesson tab metadata so its learner-facing labels can be tested directly. Add one small shared exercise header component that owns the consistent top placement and callback wiring, then use it in both grammar exercises and the category-based quiz page.

**Tech Stack:** React 19, TypeScript, Node test runner, React DOM server rendering, Vite.

## Global Constraints

- Rename `Schlüsselgrammatik` to `Grammatik`.
- Keep `Grammatikübungen` unchanged.
- The return action text is `Trở về bài học`.
- The return action calls the existing `onBackToLesson` callback and does not add route state.
- Preserve the user's unrelated `package-lock.json` change.

---

### Task 1: Lesson Grammar Tab Label

**Files:**
- Modify: `src/pages/LessonDetailPage.tsx`
- Create: `src/pages/LessonDetailPage.test.tsx`

**Interfaces:**
- Produces: exported `BOTTOM_TABS` array used by `LessonDetailPage` and its unit test.

- [ ] **Step 1: Write the failing label test**

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { BOTTOM_TABS } from "./LessonDetailPage";

test("labels grammar theory as Grammatik and keeps exercises distinct", () => {
  assert.equal(BOTTOM_TABS.find(({ id }) => id === "nguphapthenchot")?.label, "Grammatik");
  assert.equal(BOTTOM_TABS.find(({ id }) => id === "quiz")?.label, "Grammatikübungen");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --import tsx --test src/pages/LessonDetailPage.test.tsx`

Expected: FAIL because `BOTTOM_TABS` is not exported.

- [ ] **Step 3: Export the metadata and update the theory label**

Move `BOTTOM_TABS` outside the component, export it, and set:

```tsx
export const BOTTOM_TABS: { id: BottomTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: "nguphapthenchot", label: "Grammatik", Icon: GraduationCap },
  { id: "tuvung", label: "Wortschatz", Icon: BookOpen },
  { id: "quiz", label: "Grammatikübungen", Icon: HelpCircle },
  { id: "doc", label: "Lesen", Icon: FileText },
  { id: "nghe", label: "Hören", Icon: Headphones },
  { id: "viet", label: "Schreiben", Icon: PenLine },
  { id: "noi", label: "Sprechen", Icon: Mic },
];
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --import tsx --test src/pages/LessonDetailPage.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/LessonDetailPage.tsx src/pages/LessonDetailPage.test.tsx
git commit -m "fix: rename grammar theory tab"
```

### Task 2: Shared Exercise Header

**Files:**
- Create: `src/components/ExercisePageHeader.tsx`
- Create: `src/components/ExercisePageHeader.test.tsx`

**Interfaces:**
- Consumes: `Button` from `src/components/DesignSystem.tsx`.
- Produces: `ExercisePageHeader({ title, subtitle?, onBackToLesson })`.

- [ ] **Step 1: Write the failing component test**

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ExercisePageHeader } from "./ExercisePageHeader";

test("renders the exercise title and top return-to-lesson action", () => {
  const html = renderToStaticMarkup(
    <ExercisePageHeader title="Bài tập ngữ pháp" onBackToLesson={() => {}} />,
  );

  assert.match(html, />Bài tập ngữ pháp</);
  assert.match(html, />Trở về bài học</);
  assert.match(html, /id="btn-exercise-back-to-lesson"/);
});

test("passes the return callback to the button", () => {
  const onBackToLesson = () => {};
  const element = ExercisePageHeader({ title: "Quiz", onBackToLesson });
  const buttonElement = element.props.children[1];

  assert.equal(buttonElement.props.onClick, onBackToLesson);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --import tsx --test src/components/ExercisePageHeader.test.tsx`

Expected: FAIL because `ExercisePageHeader` does not exist.

- [ ] **Step 3: Implement the minimal shared header**

```tsx
import React from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "./DesignSystem";

interface ExercisePageHeaderProps {
  title: string;
  subtitle?: string;
  onBackToLesson: () => void;
}

export const ExercisePageHeader = ({
  title,
  subtitle,
  onBackToLesson,
}: ExercisePageHeaderProps) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="space-y-1">
      <h2 className="text-xl font-display font-black text-slate-900">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
    <Button id="btn-exercise-back-to-lesson" variant="secondary" onClick={onBackToLesson}>
      <ArrowLeft className="mr-2 h-4 w-4" /> Trở về bài học
    </Button>
  </div>
);
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --import tsx --test src/components/ExercisePageHeader.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ExercisePageHeader.tsx src/components/ExercisePageHeader.test.tsx
git commit -m "feat: add shared exercise header"
```

### Task 3: Add the Header to Every Exercise State

**Files:**
- Modify: `src/pages/GrammarExercisePage.tsx`
- Modify: `src/pages/QuizPage.tsx`

**Interfaces:**
- Consumes: `ExercisePageHeader({ title, subtitle?, onBackToLesson })`.
- Uses: existing `onBackToLesson: () => void` props supplied by `App.tsx`.

- [ ] **Step 1: Add failing source-integration assertions**

Extend `src/components/ExercisePageHeader.test.tsx`:

```tsx
import { readFileSync } from "node:fs";

test("both exercise pages use the shared top header", () => {
  const grammarSource = readFileSync(new URL("../pages/GrammarExercisePage.tsx", import.meta.url), "utf8");
  const quizSource = readFileSync(new URL("../pages/QuizPage.tsx", import.meta.url), "utf8");

  assert.match(grammarSource, /<ExercisePageHeader[\s\S]*onBackToLesson=\{onBackToLesson\}/);
  assert.match(quizSource, /<ExercisePageHeader[\s\S]*onBackToLesson=\{onBackToLesson\}/);
});
```

- [ ] **Step 2: Run the integration test and verify RED**

Run: `node --import tsx --test src/components/ExercisePageHeader.test.tsx`

Expected: FAIL because neither page renders `ExercisePageHeader`.

- [ ] **Step 3: Use the header in grammar exercises**

Destructure `onBackToLesson`, import `ExercisePageHeader`, and render it as the first child in the active page:

```tsx
<ExercisePageHeader
  title="Bài tập ngữ pháp"
  subtitle="Bấm vào câu lớn để hiển thị các câu hỏi con."
  onBackToLesson={onBackToLesson}
/>
```

Use the same callback in the empty state and add the shared header above the result card content so loading/empty/result states retain a route back to the current lesson.

- [ ] **Step 4: Use the header in quiz, listening, and reading exercises**

Import `ExercisePageHeader` and derive the title:

```tsx
const exerciseTitle =
  category === "nghe" ? "Bài tập Hören"
  : category === "doc" ? "Bài tập Lesen"
  : "Quiz kiểm tra";
```

Render:

```tsx
<ExercisePageHeader title={exerciseTitle} onBackToLesson={onBackToLesson} />
```

as the first visible row for active and result states. In the empty/error state, replace roadmap routing with `onBackToLesson`.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --import tsx --test src/components/ExercisePageHeader.test.tsx src/pages/LessonDetailPage.test.tsx`

Expected: all tests PASS.

- [ ] **Step 6: Run all repository tests and static checks**

Run: `node --import tsx --test "src/**/*.test.ts" "src/**/*.test.tsx"`

Expected: all tests PASS.

Run: `npm run lint`

Expected: TypeScript exits 0.

Run: `npm run build`

Expected: Vite build exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/pages/GrammarExercisePage.tsx src/pages/QuizPage.tsx src/components/ExercisePageHeader.test.tsx
git commit -m "feat: return from exercises to current lesson"
```
