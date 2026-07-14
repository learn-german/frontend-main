# Lesson Page Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure `LessonDetailPage.tsx` so Video sits level with Objectives, Grammar spans full width, and Vocabulary becomes a 4th bottom tab alongside Quiz/Nghe/Đọc — eliminating the old layout's mobile-breakpoint bug where Vocabulary visually merged with the practice tabs.

**Architecture:** Single-file JSX restructuring of `src/pages/LessonDetailPage.tsx`. No new components, no new props, no new state beyond widening the existing `BottomTab` union type. The Main Grid changes from "2 columns stacked vertically" (Video+Grammar left / Objectives+Vocabulary right) to "2 stacked rows" (Video+Objectives row, then full-width Grammar row). The Vocabulary JSX block moves as-is into a new 4th tab in the existing Bottom tabbed section.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS v4, lucide-react icons.

## Global Constraints

- Không dùng `window.alert()`/`window.confirm()` — không áp dụng ở đây (không có action nào cần alert).
- Không thêm npm package mới.
- Không refactor code ngoài scope (không đổi `VideoPlayer`, `MarkdownBlock`, `useMediaPlaybackUrl`, `handlePronounce`, `handleCompleteClick`, props interface).
- Không đổi layout `AdminLessonEditor.tsx` (ngoài phạm vi spec).
- Project has no test runner configured (`package.json` has no `test` script, no `*.test.*` files exist) — verification is `npm run lint` (tsc --noEmit) plus manual browser testing via the mock-props harness pattern, per project convention.
- Node: must `source ~/.nvm/nvm.sh && nvm use 20` before running `npm run dev` / `npm run lint` (default Node v16 crashes Vite 6).

---

### Task 1: Restructure Main Grid — Video+Objectives row, full-width Grammar row

**Files:**
- Modify: `src/pages/LessonDetailPage.tsx:113-209` (the entire "Main Grid" block, from the `{/* Main Grid — Left: Video + Grammar | Right: Objectives + Vocabulary */}` comment through its closing `</div>`)

**Interfaces:**
- Consumes: existing `lesson` prop (`Lesson` type from `../lib/appTypes`), existing local vars `handlePronounce`, `lesson.grammarMd`, `lesson.grammar`, `lesson.objective`, `lesson.summary` — all unchanged.
- Produces: no new exports. The Vocabulary JSX (currently lines 170-207) is **removed from this location** — Task 2 re-adds it inside the Bottom tabbed section. Do not delete the Vocabulary JSX content when editing this task; cut it and hand it to Task 2 (or keep both edits in one pass — see note below).

Since Task 1 removes Vocabulary from the Main Grid and Task 2 re-adds it in the Bottom section, doing them as strictly separate commits would leave an intermediate commit where Vocabulary is missing entirely. To keep every commit in a working, testable state, implement both as sub-steps of this single task and commit once at the end.

- [ ] **Step 1: Replace the Main Grid block**

Replace lines 113-209 (from `{/* Main Grid — Left: Video + Grammar | Right: Objectives + Vocabulary */}` through the matching closing `</div>` right before `{/* Bottom tabbed section: Quiz / Nghe / Đọc */}`) with:

```tsx
      {/* Row 1: Video + Objectives, side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* Video */}
        <section className="lg:col-span-8 space-y-3">
          <h2 className="text-base font-display font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide font-sans">
            <Video className="w-5 h-5 text-orange-500" /> Bài giảng lý thuyết
          </h2>
          <VideoPlayer lessonId={lesson.id} youtubeId={lesson.youtubeId} videoR2Key={lesson.videoR2Key} title={lesson.title} levelBadge={lesson.level} />
        </section>

        {/* Objectives */}
        <div className="lg:col-span-4 bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm h-full flex flex-col justify-between">
          <h3 className="text-sm font-display font-bold text-slate-800 uppercase tracking-widest flex items-center gap-1.5 font-sans">
            <GraduationCap className="w-4 h-4 text-amber-500" /> Mục tiêu bài học
          </h3>
          <p className="text-xs text-slate-650 leading-relaxed font-sans">{lesson.objective}</p>
          <div className="h-[1px] bg-slate-100" />
          <p className="text-xs text-slate-500 leading-relaxed font-sans">
            <b>Tóm tắt:</b> {lesson.summary}
          </p>
        </div>
      </div>

      {/* Row 2: Grammar — full width, markdown or legacy structured */}
      <div className="bg-slate-50/50 border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
        <span className="text-[10px] font-display font-bold text-yellow-400 bg-slate-950 border border-slate-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
          Ngữ pháp then chốt
        </span>

        {lesson.grammarMd ? (
          <MarkdownBlock content={lesson.grammarMd} />
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

Note: the Vocabulary `<section>` that was previously nested inside the Right Column (old lines 170-207) is intentionally dropped here — it is re-added in Step 2 below, inside the Bottom tabbed section.

- [ ] **Step 2: Widen the `BottomTab` type and add the Vocabulary tab entry**

At line 30, change:

```tsx
type BottomTab = "quiz" | "nghe" | "doc";
```

to:

```tsx
type BottomTab = "quiz" | "nghe" | "doc" | "tuvung";
```

At lines 64-68, change:

```tsx
  const BOTTOM_TABS: { id: BottomTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: "quiz", label: "Quiz", Icon: HelpCircle },
    { id: "nghe", label: "Nghe", Icon: Headphones },
    { id: "doc", label: "Đọc", Icon: FileText },
  ];
```

to:

```tsx
  const BOTTOM_TABS: { id: BottomTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: "quiz", label: "Quiz", Icon: HelpCircle },
    { id: "nghe", label: "Nghe", Icon: Headphones },
    { id: "doc", label: "Đọc", Icon: FileText },
    { id: "tuvung", label: "Từ vựng", Icon: BookOpen },
  ];
```

- [ ] **Step 3: Add the Vocabulary tab content**

In the Bottom tabbed section's tab-content area (right after the `{/* Đọc tab */}` block closes, i.e. right after the `)}` that closes the `bottomTab === "doc" && (...)` block, still inside the `<div className="p-6">` wrapper and before its closing `</div>`), add:

```tsx
          {/* Từ vựng tab */}
          {bottomTab === "tuvung" && (
            <section className="space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div className="space-y-1">
                  <h2 className="text-sm font-display font-bold text-slate-900 flex items-center gap-1.5 font-sans">
                    <BookOpen className="w-4 h-4 text-orange-600" /> Từ vựng then chốt
                  </h2>
                  <p className="text-[10px] text-slate-400">Click loa để nghe phát âm</p>
                </div>
                <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                  {lesson.vocabulary.length} từ
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {lesson.vocabulary.map((vocab, index) => (
                  <div key={index} className="py-3 first:pt-0 last:pb-0 flex items-start gap-2.5">
                    <button
                      onClick={() => handlePronounce(vocab.de)}
                      className="w-7 h-7 mt-0.5 rounded-lg bg-slate-100 hover:bg-orange-50 hover:text-orange-600 text-slate-500 flex items-center justify-center transition shrink-0 active:scale-90"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-display font-extrabold text-sm text-slate-900">{vocab.de}</span>
                        <span className="font-mono text-[10px] text-slate-400">{vocab.pronunciation}</span>
                        <span className="text-xs font-semibold text-slate-600 ml-auto">{vocab.vi}</span>
                      </div>
                      <div className="mt-1 bg-slate-50 rounded-lg px-2 py-1.5 text-[10px]">
                        <p className="font-display font-semibold text-slate-700">🇩🇪 {vocab.exampleDe}</p>
                        <p className="text-slate-400 italic mt-0.5">🇻🇳 {vocab.exampleVi}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
```

Also update the comment right above the Bottom tabbed section's opening (`{/* Bottom tabbed section: Quiz / Nghe / Đọc */}`) to `{/* Bottom tabbed section: Quiz / Nghe / Đọc / Từ vựng */}`.

- [ ] **Step 4: Run typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors (exits 0). If `BottomTab` union or `BOTTOM_TABS` array has a typo, TypeScript will fail here — fix before continuing.

- [ ] **Step 5: Manual browser verification**

Start the dev server (`nvm use 20 && npm run dev`) and mount `LessonDetailPage` with mock props (same throwaway-harness pattern used earlier in this session: a temporary `dbgtest.html` + `dbgtest.tsx` at repo root that imports `../src/index.css` and renders `<LessonDetailPage lesson={mockLesson} stats={mockStats} onBack={() => {}} onMarkComplete={() => {}} onStartQuiz={() => {}} />` with a mock `Lesson` object containing non-empty `vocabulary`, `grammar`/`grammarMd`, `objective`, `summary`). Delete the harness files when done.

Check at 1280px width:
- Video and "Mục tiêu bài học" appear side by side in one row (8/12 + 4/12).
- The Objectives card's content is spaced from top to bottom (via `justify-between`) rather than leaving a large empty gap at the bottom, even though Video is taller.
- "Ngữ pháp then chốt" spans the full width below that row.
- The Bottom tabbed section shows 4 tabs: Quiz, Nghe, Đọc, Từ vựng.
- Clicking the "Từ vựng" tab shows the vocabulary list with working pronunciation buttons (click one, confirm no console error — actual audio output can't be verified visually but `handlePronounce` should not throw).

Check at 375px width:
- Grammar and the 4-tab Bottom section still render top-to-bottom without the old bug (Vocabulary is no longer a floating card between lesson content and the practice tabs — it's fully inside the tab bar now).

- [ ] **Step 6: Commit**

```bash
git add src/pages/LessonDetailPage.tsx
git commit -m "$(cat <<'EOF'
feat: redesign lesson page layout, move vocabulary into a tab

Video now sits level with Objectives, Grammar spans full width, and
Vocabulary becomes a 4th bottom tab alongside Quiz/Nghe/Doc — fixing
the old layout where Vocabulary visually merged with the practice
tabs on narrow viewports.
EOF
)"
```
