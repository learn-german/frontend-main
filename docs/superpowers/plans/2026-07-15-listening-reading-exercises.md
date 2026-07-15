# Listening/Reading Exercises Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let learners actually start and complete Listening (Nghe) and Reading (Đọc) exercises from `LessonDetailPage`, reusing the existing `QuizPage` mechanism (already category-aware from a prior branch) instead of building new UI.

**Architecture:** `LessonDetailPage`'s Nghe/Đọc tabs gain a "Bắt đầu bài tập" button (shown only when the underlying audio/passage content exists) that navigates to the same `QuizPage` component already used for the Quiz tab, just with `category="nghe"`/`"doc"` instead of the default `"nguphap"`. `App.tsx` gains a small piece of state to remember which category is active and a new `onBackToLesson` callback. `QuizPage` gets 3 category-aware additions: a reading-passage recap for `doc`, a simpler "Quay lại bài học" results screen for `nghe`/`doc` (no next-lesson suggestion), and an accurate empty-state message instead of the generic "couldn't load" one. The existing `nguphap`/Quiz tab flow is untouched.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS v4, lucide-react.

## Global Constraints

- Hành vi tab Quiz hiện tại (category `'nguphap'`) phải giữ nguyên 100% — không có gì thay đổi cho luồng đó.
- Không thêm loại câu hỏi mới, không đổi Admin UI (`AdminQuizSection.tsx` đã đủ dùng).
- Không dùng `window.alert()`/`window.confirm()`.
- Node: `source ~/.nvm/nvm.sh && nvm use 20` trước khi chạy `npm run dev`/`npm run lint`.
- Dự án không có test runner — verification là `npm run lint` (tsc --noEmit) + kiểm tra thủ công trên browser (mock props, throwaway harness).

---

### Task 1: `LessonDetailPage.tsx` — nút "Bắt đầu bài tập" cho Nghe/Đọc

**Files:**
- Modify: `src/pages/LessonDetailPage.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `LessonDetailPageProps.onStartQuiz(lessonId: string, category?: "nguphap" | "nghe" | "doc") => void` (signature widened, second param optional) — consumed by Task 2 (`App.tsx`'s wiring).

- [ ] **Step 1: Widen `onStartQuiz`'s signature**

Find:

```tsx
interface LessonDetailPageProps {
  lesson: Lesson;
  stats: UserStats;
  onBack: () => void;
  onMarkComplete: (lessonId: string) => void;
  onStartQuiz: (lessonId: string) => void;
}
```

Replace with:

```tsx
interface LessonDetailPageProps {
  lesson: Lesson;
  stats: UserStats;
  onBack: () => void;
  onMarkComplete: (lessonId: string) => void;
  onStartQuiz: (lessonId: string, category?: "nguphap" | "nghe" | "doc") => void;
}
```

The existing call site (`onStartQuiz(lesson.id)`, in the Quiz tab, untouched by this task) still type-checks unchanged since the new parameter is optional.

- [ ] **Step 2: Add the "Bắt đầu bài tập nghe" button**

Find:

```tsx
          {/* Nghe tab */}
          {bottomTab === "nghe" && (
            <div className="space-y-4">
              {lesson.audioR2Key ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Headphones className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-display font-bold text-slate-800">Luyện nghe</span>
                  </div>
                  {audioPlayback.loading && <p className="text-xs text-slate-400">Đang tải...</p>}
                  {audioPlayback.url && (
                    <audio controls src={audioPlayback.url} className="w-full rounded-xl">
                      Trình duyệt không hỗ trợ audio.
                    </audio>
                  )}
                  {audioPlayback.error && <p className="text-xs text-red-500">Không tải được audio: {audioPlayback.error}</p>}
                </>
              ) : lesson.listeningUrl ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Headphones className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-display font-bold text-slate-800">Luyện nghe</span>
                  </div>
                  <audio
                    controls
                    src={lesson.listeningUrl}
                    className="w-full rounded-xl"
                  >
                    Trình duyệt không hỗ trợ audio.
                  </audio>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <Headphones className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-display font-bold text-slate-500">Sắp có</p>
                  <p className="text-xs text-slate-400">Bài luyện nghe cho bài học này đang được chuẩn bị.</p>
                </div>
              )}
            </div>
          )}
```

Replace with:

```tsx
          {/* Nghe tab */}
          {bottomTab === "nghe" && (
            <div className="space-y-4">
              {lesson.audioR2Key ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Headphones className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-display font-bold text-slate-800">Luyện nghe</span>
                  </div>
                  {audioPlayback.loading && <p className="text-xs text-slate-400">Đang tải...</p>}
                  {audioPlayback.url && (
                    <audio controls src={audioPlayback.url} className="w-full rounded-xl">
                      Trình duyệt không hỗ trợ audio.
                    </audio>
                  )}
                  {audioPlayback.error && <p className="text-xs text-red-500">Không tải được audio: {audioPlayback.error}</p>}
                </>
              ) : lesson.listeningUrl ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Headphones className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-display font-bold text-slate-800">Luyện nghe</span>
                  </div>
                  <audio
                    controls
                    src={lesson.listeningUrl}
                    className="w-full rounded-xl"
                  >
                    Trình duyệt không hỗ trợ audio.
                  </audio>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <Headphones className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-display font-bold text-slate-500">Sắp có</p>
                  <p className="text-xs text-slate-400">Bài luyện nghe cho bài học này đang được chuẩn bị.</p>
                </div>
              )}
              {(lesson.audioR2Key || lesson.listeningUrl) && (
                <div className="flex justify-center pt-2">
                  <Button id="btn-lesson-start-nghe" variant="primary" onClick={() => onStartQuiz(lesson.id, "nghe")}>
                    Bắt đầu bài tập nghe <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 3: Add the "Bắt đầu bài tập đọc" button**

Find:

```tsx
          {/* Đọc tab */}
          {bottomTab === "doc" && (
            <div className="space-y-4">
              {lesson.readingText ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-display font-bold text-slate-800">Bài đọc</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">🇩🇪 Tiếng Đức</span>
                      <p className="text-sm text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">{lesson.readingText}</p>
                    </div>
                    {lesson.readingTextVi && (
                      <>
                        <div className="h-px bg-slate-100" />
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">🇻🇳 Tiếng Việt</span>
                          <p className="text-xs text-slate-500 leading-relaxed font-sans italic whitespace-pre-wrap">{lesson.readingTextVi}</p>
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-display font-bold text-slate-500">Sắp có</p>
                  <p className="text-xs text-slate-400">Bài đọc hiểu cho bài học này đang được chuẩn bị.</p>
                </div>
              )}
            </div>
          )}
```

Replace with:

```tsx
          {/* Đọc tab */}
          {bottomTab === "doc" && (
            <div className="space-y-4">
              {lesson.readingText ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-display font-bold text-slate-800">Bài đọc</span>
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">🇩🇪 Tiếng Đức</span>
                      <p className="text-sm text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">{lesson.readingText}</p>
                    </div>
                    {lesson.readingTextVi && (
                      <>
                        <div className="h-px bg-slate-100" />
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">🇻🇳 Tiếng Việt</span>
                          <p className="text-xs text-slate-500 leading-relaxed font-sans italic whitespace-pre-wrap">{lesson.readingTextVi}</p>
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <FileText className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-display font-bold text-slate-500">Sắp có</p>
                  <p className="text-xs text-slate-400">Bài đọc hiểu cho bài học này đang được chuẩn bị.</p>
                </div>
              )}
              {lesson.readingText && (
                <div className="flex justify-center pt-2">
                  <Button id="btn-lesson-start-doc" variant="primary" onClick={() => onStartQuiz(lesson.id, "doc")}>
                    Bắt đầu bài tập đọc <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 4: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 5: Manual browser verification**

Mount `LessonDetailPage` with mock props via a throwaway harness (`dbgtest.html`/`dbgtest.tsx` at repo root, importing `../src/index.css`, deleted after use):
- With `audioR2Key` set on the mock lesson: switch to the Nghe tab, confirm "Bắt đầu bài tập nghe" appears below the player.
- With `readingText` set: switch to the Đọc tab, confirm "Bắt đầu bài tập đọc" appears below the passage.
- With both `audioR2Key`/`listeningUrl` and `readingText` unset (empty strings/undefined): confirm neither button appears, only the existing "Sắp có" states.
- Confirm the Quiz tab's "Bắt đầu Quiz ngay" button is untouched (still present, same behavior).

- [ ] **Step 6: Commit**

```bash
git add src/pages/LessonDetailPage.tsx
git commit -m "feat: add start-exercise buttons to Nghe/Đọc tabs on the lesson page"
```

---

### Task 2: `App.tsx` — thread category through navigation

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: Task 1's widened `LessonDetailPageProps.onStartQuiz(lessonId, category?)`.
- Produces: `QuizPageProps.onBackToLesson: () => void` requirement satisfied at the call site (the actual prop is defined by Task 3; this task wires the caller side) — Task 3 must add the prop to `QuizPageProps`, or this task's JSX will fail to typecheck until Task 3 lands. Since Task 3 comes after this task in execution order, Task 2's Step 4 typecheck is EXPECTED TO FAIL with a "Property 'onBackToLesson' does not exist" (or "missing required prop") error — this is intentional, matching the same pattern used for a similar expected-intermediate-failure earlier in this project's history. Confirm the failure is specifically about `onBackToLesson` on `<QuizPage>` and nothing else, then proceed; Task 3 resolves it.

- [ ] **Step 1: Add `activeExerciseCategory` state**

Find:

```tsx
  // Router page state
  const [currentPage, setCurrentPage] = useState<AppState["currentPage"]>("landing");
  const [selectedLessonId, setSelectedLessonId] = useState<string>("a1-l1");
```

Replace with:

```tsx
  // Router page state
  const [currentPage, setCurrentPage] = useState<AppState["currentPage"]>("landing");
  const [selectedLessonId, setSelectedLessonId] = useState<string>("a1-l1");
  const [activeExerciseCategory, setActiveExerciseCategory] = useState<"nguphap" | "nghe" | "doc">("nguphap");
```

- [ ] **Step 2: Set the category when starting an exercise from `LessonDetailPage`**

Find:

```tsx
              {currentPage === "lesson-detail" && user && activeLessonObject && (
                <LessonDetailPage
                  lesson={activeLessonObject}
                  stats={stats}
                  onBack={() => handleNavigate("roadmap")}
                  onMarkComplete={handleMarkComplete}
                  onStartQuiz={(lessonId) => {
                    setSelectedLessonId(lessonId);
                    setCurrentPage("quiz");
                  }}
                />
              )}
```

Replace with:

```tsx
              {currentPage === "lesson-detail" && user && activeLessonObject && (
                <LessonDetailPage
                  lesson={activeLessonObject}
                  stats={stats}
                  onBack={() => handleNavigate("roadmap")}
                  onMarkComplete={handleMarkComplete}
                  onStartQuiz={(lessonId, category = "nguphap") => {
                    setSelectedLessonId(lessonId);
                    setActiveExerciseCategory(category);
                    setCurrentPage("quiz");
                  }}
                />
              )}
```

- [ ] **Step 3: Pass `category` and `onBackToLesson` to `QuizPage`**

Find:

```tsx
              {currentPage === "quiz" && user && activeLessonObject && (
                <QuizPage
                  lesson={activeLessonObject}
                  onQuizFinished={handleQuizFinished}
                  onNavigateHome={() => handleNavigate("roadmap")}
                  onNextLesson={handleNextLesson}
                />
              )}
```

Replace with:

```tsx
              {currentPage === "quiz" && user && activeLessonObject && (
                <QuizPage
                  lesson={activeLessonObject}
                  category={activeExerciseCategory}
                  onQuizFinished={handleQuizFinished}
                  onNavigateHome={() => handleNavigate("roadmap")}
                  onNextLesson={handleNextLesson}
                  onBackToLesson={() => setCurrentPage("lesson-detail")}
                />
              )}
```

- [ ] **Step 4: Typecheck (expected failure)**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: FAILS with an error about `onBackToLesson` not existing on `QuizPageProps` (this file passes a prop `QuizPage` doesn't accept yet). Confirm this is the ONLY error — Task 3 (not yours) adds the prop to `QuizPage` and resolves it. If there are other unrelated errors, stop and report BLOCKED with specifics.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: thread exercise category through App.tsx navigation to QuizPage"
```

---

### Task 3: `QuizPage.tsx` — category-aware passage recap, results screen, empty state

**Files:**
- Modify: `src/pages/QuizPage.tsx`

**Interfaces:**
- Consumes: `QuizPageProps.category` (already exists from a prior branch), `App.tsx`'s new `onBackToLesson` prop passed at the call site (Task 2).
- Produces: `QuizPageProps.onBackToLesson: () => void` (new required prop) — resolves Task 2's expected intermediate typecheck failure.

- [ ] **Step 1: Add `onBackToLesson` to props**

Find:

```tsx
interface QuizPageProps {
  lesson: Lesson;
  category?: "nguphap" | "nghe" | "doc";
  onQuizFinished: (scorePercentage: number, xpEarned: number) => void;
  onNavigateHome: () => void;
  onNextLesson: () => void;
}
```

Replace with:

```tsx
interface QuizPageProps {
  lesson: Lesson;
  category?: "nguphap" | "nghe" | "doc";
  onQuizFinished: (scorePercentage: number, xpEarned: number) => void;
  onNavigateHome: () => void;
  onNextLesson: () => void;
  onBackToLesson: () => void;
}
```

Find:

```tsx
export const QuizPage: React.FC<QuizPageProps> = ({
  lesson,
  category = "nguphap",
  onQuizFinished,
  onNavigateHome,
  onNextLesson,
}) => {
```

Replace with:

```tsx
export const QuizPage: React.FC<QuizPageProps> = ({
  lesson,
  category = "nguphap",
  onQuizFinished,
  onNavigateHome,
  onNextLesson,
  onBackToLesson,
}) => {
```

- [ ] **Step 2: Category-aware empty-question message**

Find:

```tsx
  if (questionsError || questions.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center space-y-4 py-12">
        <p className="text-slate-500">Không tải được câu hỏi quiz. Vui lòng thử lại sau.</p>
        <Button variant="secondary" onClick={onNavigateHome}>Quay về Lộ trình</Button>
      </div>
    );
  }
```

Replace with:

```tsx
  if (questionsError || questions.length === 0) {
    const emptyMessage =
      category === "nghe" ? "Bài tập nghe cho bài học này chưa được soạn."
      : category === "doc" ? "Bài tập đọc cho bài học này chưa được soạn."
      : "Không tải được câu hỏi quiz. Vui lòng thử lại sau.";
    return (
      <div className="max-w-2xl mx-auto text-center space-y-4 py-12">
        <p className="text-slate-500">{emptyMessage}</p>
        {category === "nguphap" ? (
          <Button variant="secondary" onClick={onNavigateHome}>Quay về Lộ trình</Button>
        ) : (
          <Button variant="secondary" onClick={onBackToLesson}>Quay lại bài học</Button>
        )}
      </div>
    );
  }
```

- [ ] **Step 3: Category-aware results-screen buttons**

Find:

```tsx
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button id="btn-quiz-retry" variant="secondary" className="flex-1" onClick={handleRetry}>
            <RotateCcw className="w-4 h-4 mr-2" /> Làm lại bài Test
          </Button>
          {passed ? (
            <Button id="btn-quiz-next-lesson" variant="primary" className="flex-1" onClick={onNextLesson}>
              Học bài tiếp theo <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              id="btn-quiz-exit"
              variant="ghost"
              className="flex-1 text-slate-500"
              onClick={onNavigateHome}
            >
              Quay về Lộ trình
            </Button>
          )}
        </div>
```

Replace with:

```tsx
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button id="btn-quiz-retry" variant="secondary" className="flex-1" onClick={handleRetry}>
            <RotateCcw className="w-4 h-4 mr-2" /> Làm lại bài Test
          </Button>
          {category === "nguphap" ? (
            passed ? (
              <Button id="btn-quiz-next-lesson" variant="primary" className="flex-1" onClick={onNextLesson}>
                Học bài tiếp theo <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                id="btn-quiz-exit"
                variant="ghost"
                className="flex-1 text-slate-500"
                onClick={onNavigateHome}
              >
                Quay về Lộ trình
              </Button>
            )
          ) : (
            <Button
              id="btn-quiz-back-to-lesson"
              variant="primary"
              className="flex-1"
              onClick={onBackToLesson}
            >
              Quay lại bài học
            </Button>
          )}
        </div>
```

- [ ] **Step 4: Reading passage recap for `category === "doc"`**

Find:

```tsx
      {/* Progress row */}
      <div className="flex items-center justify-between gap-6 pb-2 select-none">
        <div className="flex-1">
          <ProgressBar value={progressPercent} className="text-xs" />
        </div>
        <span className="text-xs font-display font-extrabold text-slate-500 shrink-0 bg-slate-100 px-3 py-1.5 rounded-full">
          Câu hỏi {currentIdx + 1} / {questions.length}
        </span>
      </div>

      {/* Question card */}
```

Replace with:

```tsx
      {/* Progress row */}
      <div className="flex items-center justify-between gap-6 pb-2 select-none">
        <div className="flex-1">
          <ProgressBar value={progressPercent} className="text-xs" />
        </div>
        <span className="text-xs font-display font-extrabold text-slate-500 shrink-0 bg-slate-100 px-3 py-1.5 rounded-full">
          Câu hỏi {currentIdx + 1} / {questions.length}
        </span>
      </div>

      {/* Reading passage recap (Đọc exercises only) */}
      {category === "doc" && lesson.readingText && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">🇩🇪 Tiếng Đức</span>
            <p className="text-sm text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">{lesson.readingText}</p>
          </div>
          {lesson.readingTextVi && (
            <>
              <div className="h-px bg-slate-100" />
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">🇻🇳 Tiếng Việt</span>
                <p className="text-xs text-slate-500 leading-relaxed font-sans italic whitespace-pre-wrap">{lesson.readingTextVi}</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Question card */}
```

- [ ] **Step 5: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors (this resolves Task 2's expected intermediate failure).

- [ ] **Step 6: Manual browser verification**

Mount `QuizPage` directly with mock props via a throwaway harness (deleted after use). Mock `useQuizQuestions` (either by seeding real matching Supabase data if reachable, or by stubbing the hook's module) to return 2-3 `multiple-choice`/`fill-blank` questions. Test each scenario:
- `category="doc"` with `lesson.readingText` set: confirm the passage (DE + VI) renders above the question card, on every question (not just the first).
- `category="nghe"`, complete the quiz (any answers): on the results screen, confirm ONLY "Làm lại bài Test" + "Quay lại bài học" appear — no "Học bài tiếp theo"/"Quay về Lộ trình". Click "Quay lại bài học", confirm `onBackToLesson` fires.
- `category="nguphap"` (or omit the prop): confirm results screen behavior is unchanged from before this plan — "Học bài tiếp theo" when passed, "Quay về Lộ trình" when not passed.
- `category="nghe"` with an empty `questions` array (mock 0 questions): confirm the message reads "Bài tập nghe cho bài học này chưa được soạn." and the button is "Quay lại bài học" (not "Quay về Lộ trình").
- `category="nguphap"` with an empty `questions` array: confirm the message/button are unchanged from before this plan ("Không tải được câu hỏi quiz...", "Quay về Lộ trình").

- [ ] **Step 7: Commit**

```bash
git add src/pages/QuizPage.tsx
git commit -m "feat: add category-aware passage recap, results screen, and empty state to QuizPage"
```
