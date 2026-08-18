# Reading Exercise UX — Unified Plan (Learner + Admin)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Date:** 2026-08-18  
**Status:** Part A core shipped to `main`; Part A parity fixes + Part B admin rewrite pending  
**Replaces:**
- `docs/superpowers/plans/2026-08-18-reading-exercise-ux-mockup-carousel-implementation-plan.md`
- `docs/superpowers/specs/2026-08-18-admin-reading-layout-full-jsx-rewrite-design.md`
- `docs/superpowers/specs/2026-08-14-reading-exercise-one-question-per-screen-design.md` (flat per-question screens — removed, no fallback per **3A**)
- `docs/superpowers/plans/2026-08-18-reading-exercise-remaining-tasks-plan.md` (merged into this file)

### Decision snapshot

| ID | Decision | Rationale |
|----|----------|-----------|
| **1B** | DB drop legacy columns via migration | Migration `20260818140000` already applied; `reading_text` backfilled to `reading_passages` |
| **2A** | Set type tag derived from `passageCount` | Authoritative count from `reading_passages` rows, not group structure |
| **3A** | No old 1-question-per-screen fallback | Malformed sets show validation error, never flat flow |
| **4B** | Learner keeps orange accents | Brand red reserved for admin mockup |
| **reading_text: A** | Drop `lessons.reading_text` now | Verified 2026-08-18: 1 non-empty row already in `reading_passages`; runtime `src/` does not read column |
| **Color split** | Learner = orange (`bg-orange-500`); Admin = brand red per mockup | Mockup wins per surface; no cross-surface color bleed |

## Goal

Deliver mockup-aligned reading exercise UX on **both surfaces**:

| Surface | Mockup | Primary file |
|---------|--------|--------------|
| **Learner** | `user-doc-mockup.html` | `src/pages/ReadingSetListPage.tsx` |
| **Admin** | `admin-doc-mockup.html`, `admin-doc-single-passage-mockup.html` | `src/pages/admin/AdminReadingExerciseSection.tsx` |

**Mockup paths (reference):**
```
MOCKUP_ROOT=/private/tmp/claude-501/-Users-thangnv-Documents-github-frontend-main--claude-worktrees-html-mockup-admin-user-e93130/5544dca4-bf6e-49d8-8d31-dcd38172619b/scratchpad

$MOCKUP_ROOT/user-doc-mockup.html          # Learner
$MOCKUP_ROOT/admin-doc-mockup.html          # Admin multi-passage
$MOCKUP_ROOT/admin-doc-single-passage-mockup.html  # Admin single-passage
```

## Architecture

```
reading_passages (count per set_id)
        │
        ▼
getReadingSetLayout / readingSetTypeTag   ← shared helpers (readingSetView.ts)
        │
        ├─► Learner: buildReadingCarouselScreens → carousel track (ReadingSetListPage)
        └─► Admin: mode-specific body renderers (AdminReadingExerciseSection)
```

- **Set classification:** `passageCount` only (user decision **2A**). Do **not** use `isSingleQuestionPassage()` for layout/tags/validation — admin-only helper.
- **Carousel (learner):** pixel slide width + `translateX`. Never `w-full` / `flex-basis: 100%` on slides.
- **Batch passage counts:** one `reading_passages` query per lesson page load (`useReadingSetPassageCounts`).
- **DB cleanup:** migration drops `lessons.reading_text`, `reading_text_vi`, `listening_url` (user decision **reading_text: A**).

**Tech stack:** React 19 + TypeScript 5.8, Tailwind v4, Supabase client, `reading-submit` edge function. Test: `npx tsx --test <path>`. Type check: `npm run lint`.

---

## Global Constraints

### Shared (both surfaces)

- Code in English; user-facing labels in Vietnamese.
- No `any`; named exports except `App.tsx`.
- Do not edit `src/lib/database.types.ts` by hand — run `npm run gen:types` after migrations.
- Do not add npm packages.
- Quiz scoring stays in `reading-submit`; client never sees `correct_answer`.
- Do not git commit unless the user asks.
- GitNexus: run impact analysis before editing shared symbols.
- Learner = orange accents (`bg-orange-500`). Admin = brand red per mockup (`bg-red-600` / `#FF0033`).

### Learner-specific

- User decisions locked: **1B**, **2A**, **3A**, **4B**.
- Do not replace Next-button `innerHTML` (breaks SVG). Change label text node / hide `ArrowRight` on last slide.

### Admin-specific

- Keep existing data model and Supabase table contracts.
- CRUD semantics unchanged (create/edit/delete set, passage, group, item).
- **Color:** brand red on admin page (differs from learner orange **4B**). Mockup wins for admin.
- No backend schema redesign beyond agreed migrations.

---

## File Structure

| File | Role |
|------|------|
| `src/lib/readingSetView.ts` | `getReadingSetLayout`, `readingSetTypeTag`, `passagesForSet`, `groupsForPassage`, `readingSetStats`, `isSingleQuestionPassage`, `itemCount` |
| `src/lib/readingScreens.ts` | `buildReadingCarouselScreens`, validation, `ReadingCarouselScreen` types, `itemKey` |
| `src/lib/hooks/useReadingSetPassageCounts.ts` | Batch `reading_passages` count per set |
| `src/pages/ReadingSetListPage.tsx` | Learner accordion + carousel + result card |
| `src/pages/admin/AdminReadingExerciseSection.tsx` | Admin CRUD UI (rewrite target) |
| `supabase/migrations/20260818140000_drop_legacy_lesson_reading_columns.sql` | Drop legacy `lessons` columns |

### Set classification

```ts
export type ReadingSetLayout = "multi_passage" | "single_passage";

export function getReadingSetLayout(passageCount: number): ReadingSetLayout {
  return passageCount > 1 ? "multi_passage" : "single_passage";
}

export function readingSetTypeTag(passageCount: number): string | null {
  if (passageCount > 1) return "Nhiều văn bản";
  if (passageCount === 1) return "1 văn bản · nhiều câu hỏi";
  return null;
}
```

### Screen model (learner)

```ts
export type ReadingCarouselScreen =
  | { kind: "multi_passage"; passageId: string; groupId: string; slideIndex: number; slideCount: number; key: string }
  | { kind: "single_mc"; passageId: string; groupId: string; questionIndex: number; slideIndex: number; slideCount: number; key: string }
  | { kind: "single_rf_summary"; passageId: string; items: { key: string; text: string }[]; slideIndex: number; slideCount: number };
```

### Validation (learner — `buildReadingCarouselScreens`)

Empty `groups` → page shows "Bài tập cho phần này chưa được soạn." before calling builder.

**Multi-passage** (`passageCount > 1`): unique `group.passageId` count = `passageCount`; each passage has exactly one MC group with 1 sub-question. `title`/`questionIntro` may be non-empty. Fail → `"Cấu trúc bài đọc chưa hợp lệ. Vui lòng liên hệ admin."`

**Single-passage** (`passageCount === 1`): all groups share one `passageId`; slides = MC sub-questions then one RF summary. Fail if >1 passage referenced.

**`passageCount < 1`:** validation error.

---

## Implementation Status

| Task | Area | Status |
|------|------|--------|
| 1 | Shared helpers (`readingSetView`) | ✅ Done |
| 2 | Carousel screen builder (`readingScreens`) | ✅ Done |
| 3 | Passage-count hook + SetRow tags | ✅ Done |
| 4 | Learner carousel UI (core) | ✅ Done |
| 5 | Learner verification (tests + lint) | ✅ Done |
| 6 | DB migration + `gen:types` + `useModules` cleanup | ✅ Done |
| **7** | **Learner: MC option dot+letter row** | ⏳ Pending |
| **8** | **Learner: Multi-passage label badge** | ⏳ Pending |
| **9** | **Learner: Compact result review rows** | ⏳ Pending |
| **10** | **Learner: Full verification** | ⏳ Pending |
| **11** | **Admin: Page shell — header + module + lesson accordion** | ⏳ Pending |
| **12** | **Admin: Set card header + type tag + brand red** | ⏳ Pending |
| **13** | **Admin: Multi-passage set body + shared title box** | ⏳ Pending |
| **14** | **Admin: Single-passage set body (qtype accordion)** | ⏳ Pending |
| **15** | **Admin: Modals — brand red accent** | ⏳ Pending |
| **16** | **Admin: Full verification** | ⏳ Pending |

---

# Part A — Learner UI

## Layout chrome (from `user-doc-mockup.html`; accents orange **4B**)

**Multi-passage** — outside track, top to bottom:
1. Eyebrow `CÂU {n}/{total}`
2. Instruction box (`Yêu cầu:` + first group's `questionIntro`). Omit if empty.
3. Carousel track
4. Dots (`bg-orange-500` active)
5. Actions: Lưu / Quay lại / Tiếp theo (last = Nộp bài)

Inside each multi slide: numbered badge `Văn bản {n}` + markdown + `Chọn đáp án` + ABC options.

**Single-passage** — outside track:
1. Fixed passage card (`Văn bản` label, not numbered)
2. Eyebrow → carousel (questions only) → dots + actions

Inside `single_mc`: question + ABC. Inside `single_rf_summary`: `Đúng / Sai` + inline Richtig/Falsch rows.

**Completed set:** score card shell + **compact** review rows (not full `ReadingGroupBody` blocks).

### Carousel navigation

- `Quay lại` disabled at index 0.
- `Tiếp theo` / `Nộp bài` disabled until current slide fully answered.
- Last slide primary → `handleSubmit`. `Lưu` saves full `answersByKey`.
- Measure `offsetWidth` on expand (`requestAnimationFrame`) + `resize`.

### SetRow header order

chevron → `Bài {n}` → type-tag pill → optional `CheckCircle2` → status badge.

Tag classes: `text-[10.5px] font-bold text-slate-500 border border-slate-200 rounded-full px-2 py-0.5`.

---

### Tasks 1–6: ✅ Done (core learner + DB migration)

See git history for implementation details.

---

### Task 7: MC option dot + letter row (Learner)

**Files:** Modify `src/pages/ReadingSetListPage.tsx` — `ReadingMcSlide` component

**Mockup target:** `.opt-row` in `user-doc-mockup.html` lines 70-75:
- Each option is a row: `[circular dot 16×16] [letter slot 16w] [option text]`
- Selected: dot filled orange, border orange, letter orange
- Unselected: dot hollow (2px border slate-300), border slate-200

- [ ] **Step 1: Replace option button JSX in `ReadingMcSlide`**

Find:
```tsx
<div className="space-y-1">
  {question.options.map((opt, oi) => {
    const optKey = String(oi);
    return (
      <button
        key={oi}
        type="button"
        onClick={() => onAnswer(optKey)}
        className={`w-full text-left px-3 py-1.5 text-sm rounded-lg border transition-colors ${
          picked === optKey ? "bg-orange-50 border-orange-400 text-orange-700" : "bg-white border-slate-200 text-slate-700"
        }`}
      >
        {String.fromCharCode(65 + oi)}. {opt}
      </button>
    );
  })}
</div>
```

Replace with:
```tsx
<div className="flex flex-col gap-2">
  {question.options.map((opt, oi) => {
    const optKey = String(oi);
    const selected = picked === optKey;
    return (
      <button
        key={oi}
        type="button"
        onClick={() => onAnswer(optKey)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-[13.5px] rounded-xl border transition-colors ${
          selected ? "border-orange-500 bg-orange-50" : "border-slate-200 bg-white"
        } text-slate-700`}
      >
        <span
          className={`w-4 h-4 rounded-full border-2 shrink-0 ${
            selected ? "border-orange-500 bg-orange-500" : "border-slate-300"
          }`}
        />
        <span className={`w-4 text-center text-[11px] font-extrabold ${selected ? "text-orange-600" : "text-slate-400"}`}>
          {String.fromCharCode(65 + oi)}
        </span>
        <span>{opt}</span>
      </button>
    );
  })}
</div>
```

- [ ] **Step 2:** Run `npm run lint` — expected: no errors

---

### Task 8: Multi-passage label badge (Learner)

**Files:** Modify `src/pages/ReadingSetListPage.tsx` — `ReadingMcSlide` passage label area

**Mockup target:** `.passage-label` + `.passage-num` in `user-doc-mockup.html` lines 64-65:
- Number in 22×22px square with `rounded-md`, `bg-orange-50` + `text-orange-500`
- Label text "Văn bản {n}" as `text-xs font-bold text-slate-500`

- [ ] **Step 1: Replace passage label JSX**

Find:
```tsx
{passageLabel && (
  <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-0.5 text-[10.5px] font-bold text-orange-500">
    {passageLabel}
  </span>
)}
```

Replace with:
```tsx
{passageLabel && (() => {
  const match = passageLabel.match(/(\d+)$/);
  const num = match?.[1];
  return (
    <span className="flex items-center gap-2 text-xs font-bold text-slate-500">
      {num && (
        <span className="w-[22px] h-[22px] rounded-md bg-orange-50 text-orange-500 text-[11px] font-black flex items-center justify-center shrink-0">
          {num}
        </span>
      )}
      {passageLabel}
    </span>
  );
})()}
```

- [ ] **Step 2:** Run `npm run lint` — expected: no errors

---

### Task 9: Compact result review rows (Learner)

**Files:** Modify `src/pages/ReadingSetListPage.tsx` — result review section

**Mockup target:** `.review-section` in `user-doc-mockup.html` lines 214-221:
- Each item: `[check/x icon] [question text] — [chosen answer]`
- Correct: green bg+border. Wrong: red bg+border + "bạn chọn X, đáp án đúng: Y"

- [ ] **Step 1: Replace result review block**

Find:
```tsx
        <div className="text-left space-y-3 pt-4 border-t border-slate-100">
          <h4 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest">
            {revealed ? "Giải thích từng bài:" : "Câu đúng / câu sai:"}
          </h4>
          <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
            {groups.map((group, groupIndex) => (
              <div key={group.id} className="space-y-1.5">
                <p className="text-xs font-display font-bold text-slate-700">Bài {groupIndex + 1}</p>
                <ReadingGroupBody
                  lesson={lesson}
                  group={group}
                  passageText={passagesById[group.passageId]?.textDe ?? ""}
                  answersByKey={answersByKey}
                  onAnswer={() => {}}
                  itemResults={result.itemResults}
                  revealed={revealed}
                  correctAnswers={result.correctAnswers}
                  explanation={result.explanations?.[group.id]}
                />
              </div>
            ))}
          </div>
        </div>
```

Replace with:
```tsx
        <div className="text-left space-y-3 pt-4 border-t border-slate-100">
          <h4 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest">
            {revealed ? "Giải thích từng bài:" : "Câu đúng / câu sai:"}
          </h4>
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {groups.flatMap((group) => {
              if (group.questionType === "richtig_falsch") {
                return group.statements.map((s, i) => {
                  const key = itemKey(group.id, i);
                  const correct = result.itemResults?.[key];
                  const chosen = answersByKey[key];
                  const correctAns = result.correctAnswers?.[key];
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[13px] ${
                        correct ? "border-green-200 bg-green-50 text-slate-700" : "border-red-300 bg-red-50 text-slate-700"
                      }`}
                    >
                      {correct
                        ? <CheckCircle2 className="w-[15px] h-[15px] text-green-600 shrink-0" />
                        : <span className="w-[15px] h-[15px] text-red-600 shrink-0 flex items-center justify-center font-black text-xs">✕</span>}
                      <span className="flex-1">
                        {s.text} — {chosen === "richtig" ? "Richtig" : chosen === "falsch" ? "Falsch" : "—"}
                      </span>
                      {!correct && correctAns && (
                        <span className="text-[11px] text-red-600 shrink-0">
                          Đáp án đúng: {correctAns === "richtig" ? "Richtig" : "Falsch"}
                        </span>
                      )}
                    </div>
                  );
                });
              }
              return group.subQuestions.map((q, qi) => {
                const key = itemKey(group.id, qi);
                const correct = result.itemResults?.[key];
                const chosen = answersByKey[key];
                const correctAns = result.correctAnswers?.[key];
                const chosenLabel = chosen !== undefined ? String.fromCharCode(65 + Number(chosen)) : "—";
                const optionText = chosen !== undefined ? q.options[Number(chosen)] : "";
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-[13px] ${
                      correct ? "border-green-200 bg-green-50 text-slate-700" : "border-red-300 bg-red-50 text-slate-700"
                    }`}
                  >
                    {correct
                      ? <CheckCircle2 className="w-[15px] h-[15px] text-green-600 shrink-0" />
                      : <span className="w-[15px] h-[15px] text-red-600 shrink-0 flex items-center justify-center font-black text-xs">✕</span>}
                    <span className="flex-1">
                      {q.question} — {chosenLabel}. {optionText}
                    </span>
                    {!correct && correctAns && (
                      <span className="text-[11px] text-red-600 shrink-0">
                        Đáp án đúng: {String.fromCharCode(65 + Number(correctAns))}
                      </span>
                    )}
                  </div>
                );
              });
            })}
          </div>
        </div>
```

- [ ] **Step 2:** Run `npm run lint` — expected: no errors

---

### Task 10: Learner full verification

- [ ] **Step 1:** Run `npx tsx --test src/lib/readingScreens.test.ts src/lib/readingSetView.test.ts` — all PASS
- [ ] **Step 2:** Run `npm run lint` — no TypeScript errors
- [ ] **Step 3:** Manual browser checklist:
  1. Multi-passage set: MC options show dot + letter + text row structure
  2. Multi-passage label shows square badge + "Văn bản n" text
  3. Single-passage set: MC options same dot+letter structure
  4. Completed set: review rows are compact one-line items with green/red styling
  5. Wrong items show "Đáp án đúng: X" suffix
  6. RF items show "Richtig"/"Falsch" in review
  7. Carousel navigation still works (dots, prev/next, submit)
  8. Compare each screen against `$MOCKUP_ROOT/user-doc-mockup.html`

---

# Part B — Admin UI

## Current pain points

- `AdminReadingExerciseSection.tsx` mixes old and new patterns.
- DOM hierarchy does not match mockup sectioning.
- Multi-passage and single-passage layouts partially blended.
- Question blocks differ from mockup (header clusters, row actions, count pills).

## Proposed structure (from mockups)

Rebuild render tree:

1. Page header (`Bài tập đọc` + search)
2. Module cards (A1/A2/…)
3. Lesson accordion within each module
4. Set cards inside lesson body
5. Set body by mode:
   - **Multi-passage:** shared title box → passage list with numeric badge → inline A/B/C per passage
   - **Single-passage:** one passage card → question-type accordion groups below

### Interaction parity

- Toggle rows/chevrons and collapsed states
- Action placement: `Thêm bài đọc`, `Thêm văn bản`, `Thêm loại câu hỏi`, `Thêm câu hỏi`
- Badges: status (`Nháp`, `Đã xuất bản`), stats string, count pills
- Modals: `Hủy` / `Lưu` hierarchy

### Risks + mitigations

| Risk | Mitigation |
|------|------------|
| CRUD regression from large JSX rewire | Keep handlers unchanged; rewrite layout around them |
| Wrong mode for edge data | Derive mode from `passageCount`; separate render helpers |
| Accordion state reset after refetch | Test expand/collapse after each save |
| Modal handlers bound to wrong target | Vertical slices + regression after each slice |

**Note on scope:** The admin file is 904 lines with handlers tightly coupled to state. This plan takes a conservative approach: fix accent colors + add missing layout elements (shared title box, passage badge, type tag) without massive component decomposition. Full extraction is a separate follow-up if desired.

---

### Task 11: Admin page shell — header + module + lesson accordion

**Files:** Modify `src/pages/admin/AdminReadingExerciseSection.tsx`

GitNexus: `impact({target: "AdminReadingExerciseSection", direction: "upstream"})` before editing.

- [ ] **Step 1: Extract `AdminReadingPageHeader`**

Add above `AdminReadingExerciseSection` (same file):

```tsx
const AdminReadingPageHeader: React.FC<{
  search: string;
  onSearchChange: (value: string) => void;
}> = ({ search, onSearchChange }) => (
  <div className="flex items-center justify-between gap-3 flex-wrap">
    <h1 className="text-xl font-display font-black text-slate-900">Bài tập đọc</h1>
    <div className="relative w-64">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input
        type="text"
        placeholder="Tìm bài học..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
      />
    </div>
  </div>
);
```

Then replace inline header JSX with `<AdminReadingPageHeader search={search} onSearchChange={setSearch} />`.

- [ ] **Step 2:** Verify search focus ring is red (not orange) — admin brand color
- [ ] **Step 3:** Run `npm run lint` — expected: no errors
- [ ] **Step 4:** Manual — compare header + accordion vs `$MOCKUP_ROOT/admin-doc-mockup.html`

---

### Task 12: Admin set card header + type tag + brand red

**Files:** Modify `src/pages/admin/AdminReadingExerciseSection.tsx`

- [ ] **Step 1: Add `readingSetTypeTag` to imports**

```tsx
import {
  itemCount,
  passagesForSet,
  groupsForPassage,
  missingQuestionTypesForPassage,
  readingSetStats,
  isSingleQuestionPassage,
  readingSetTypeTag,
  type ReadingQuestionType,
} from "../../lib/readingSetView";
```

- [ ] **Step 2: Update set card header accent colors**

Replace `bg-orange-50 text-orange-500` with `bg-red-50 text-red-500` on set icon.

After set title `<span>`, add type tag pill:
```tsx
{(() => {
  const tag = readingSetTypeTag(setPassages.length);
  return tag ? (
    <span className="text-[10.5px] font-bold text-slate-500 border border-slate-200 rounded-full px-2 py-0.5">
      {tag}
    </span>
  ) : null;
})()}
```

- [ ] **Step 3:** Run `npm run lint` — expected: no errors
- [ ] **Step 4:** Manual — verify red icon, type tag pill, stats/badge layout

---

### Task 13: Admin multi-passage set body + shared title box

**Files:** Modify `src/pages/admin/AdminReadingExerciseSection.tsx`

- [ ] **Step 1: Add multi-passage detection**

After `const setPassages = passagesForSet(passages, set.id);`, add:
```tsx
const isMultiPassage = setPassages.length > 1;
```

- [ ] **Step 2: Add shared title box for multi-passage sets**

```tsx
{isMultiPassage && (
  <div className="border border-red-200 bg-red-50 rounded-[14px] p-3 space-y-2.5">
    <span className="text-xs font-bold text-red-600 uppercase tracking-wide">
      Tiêu đề chung
      <span className="normal-case font-medium text-slate-400 text-[11px] ml-1.5">
        Áp dụng cho tất cả văn bản bên dưới
      </span>
    </span>
    <textarea
      className="w-full min-h-[52px] border border-slate-200 rounded-[10px] px-3 py-2.5 text-[13.5px] resize-y text-slate-700 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/10"
      defaultValue={(() => {
        const sortedGroups = [...groupsForPassage(groups, setPassages[0]?.id ?? "")];
        return sortedGroups[0]?.question_intro ?? "";
      })()}
      placeholder="Tiêu đề chung cho các văn bản..."
      readOnly
    />
  </div>
)}
```

Note: shared title box is **read-only** for now (no save handler exists). Full editing support is a follow-up if needed.

- [ ] **Step 3: Add passage number badge**

Before each `PassageEditRow`, add:
```tsx
<div className="flex items-center gap-2 text-xs font-bold text-slate-500">
  <span className="w-[22px] h-[22px] rounded-md bg-red-50 text-red-500 text-[11px] font-black flex items-center justify-center shrink-0">
    {passageIndex + 1}
  </span>
  Văn bản {passageIndex + 1}
</div>
```

- [ ] **Step 4: Update orange accents to red in set body only**

Scope: only the set body rendering area (passage list, action links, RF toggles, selected options, save buttons, icon buttons). Do **not** touch qtype badges (Task 14) or modals (Task 15).

Replace orange classes with red equivalents:
- `text-orange-600 hover:text-orange-700` → `text-red-600 hover:text-red-700` (action links)
- `accent-orange-500` → `accent-red-500` (radio buttons)
- `bg-orange-500 text-white border-orange-500` → `bg-red-500 text-white border-red-500` (RF toggles)
- `bg-orange-50 border-orange-400 text-orange-700` → `bg-red-50 border-red-400 text-red-700` (selected options)
- `bg-orange-600 hover:bg-orange-700` → `bg-red-600 hover:bg-red-700` (save buttons)
- `hover:bg-orange-50 hover:text-orange-600` → `hover:bg-red-50 hover:text-red-600` (icon buttons)

- [ ] **Step 5:** Run `npm run lint` — expected: no errors
- [ ] **Step 6:** Manual — compare vs `$MOCKUP_ROOT/admin-doc-mockup.html` multi-passage section

---

### Task 14: Admin single-passage set body (question type accordion)

**Files:** Modify `src/pages/admin/AdminReadingExerciseSection.tsx`

- [ ] **Step 1: Update qtype badge colors**

Replace `border-orange-300 text-orange-500` with `border-red-200 text-red-500` on RF badge (`✓✗`) and MC badge (`≡`).

- [ ] **Step 2:** Verify answer pill colors already match mockup (emerald for correct, rose for wrong) — no change expected
- [ ] **Step 3:** Run `npm run lint` — expected: no errors
- [ ] **Step 4:** Manual — expand single-passage set, compare vs mockup

---

### Task 15: Admin modals — brand red accent

**Files:** Modify `src/pages/admin/AdminReadingExerciseSection.tsx`

- [ ] **Step 1: Update item modal accent colors**

In the item modal:
- RF toggle buttons: `bg-orange-500 text-white border-orange-500` → `bg-red-500 text-white border-red-500`
- Save button: `bg-orange-600 hover:bg-orange-700` → `bg-red-600 hover:bg-red-700`
- Radio inputs: `accent-orange-500` → `accent-red-500`
- "Thêm phương án" link: `text-orange-600 hover:text-orange-700` → `text-red-600 hover:text-red-700`

- [ ] **Step 2:** Run `npm run lint` — expected: no errors
- [ ] **Step 3:** Manual — open add/edit modal, verify red accents

---

### Task 16: Admin full verification

- [ ] **Step 1:** Run `npm run lint` — no TypeScript errors
- [ ] **Step 2:** Run `npx tsx --test src/lib/readingScreens.test.ts src/lib/readingSetView.test.ts` — all PASS
- [ ] **Step 3:** Manual regression checklist:
  1. Load admin reading page with multiple modules — no crash
  2. Expand/collapse module and lesson — toggles work
  3. Search filter — filters correctly
  4. Add reading set — appears with correct type tag
  5. Add passage in multi-passage set — appears with number badge
  6. Edit/save passage text — saves, toast shows
  7. Add question type + question item — modal opens, saves
  8. Edit question — modal pre-fills, saves
  9. Verify correct-answer badge updates on edit
  10. Delete item, passage, set — confirm modal, cascades, toast
  11. Toggle published/draft badge
  12. Multi-passage set shows shared title box with red border
  13. Single-passage set shows question type accordion with red badges
  14. All orange accents replaced with red throughout admin page
  15. Compare against `$MOCKUP_ROOT/admin-doc-mockup.html`

---

## Plan Review Log

| Iteration | Scope | Issues found | Fixes applied |
|-----------|-------|--------------|---------------|
| 1–3 | Learner | Format, 3A fallback, screen model, DB, SetRow N+1, instruction placement | See prior plan versions |
| 4 | Learner | Task 8 pending; `isSingleQuestionPassage` misuse; `w-full` bug; `passageCount===0` tag; validation location; test gaps | Locked reading_text:A; pixel slides; validation in readingScreens.ts |
| 5 | Learner | 3 UI drifts vs user mockup (result rows, MC dots, passage badge) | Added Task 7 parity fixes |
| 6 | Admin | Admin layout not matching mockup | Created admin design spec |
| 7 (merge) | Both | Two separate docs; learner core done but parity pending; admin not started; color policy differs per surface | Unified document; Tasks 1–6 ✅ |
| 8 (review) | Both | Mockup paths truncated; decision history lost; admin criteria too generic; result row format unspecified | Full mockup paths; decision snapshot; per-block checklist |
| **9 (consolidate)** | Both | Two plan files with duplicate scope (unified + remaining-tasks) | Merged into single file; renumbered tasks 7–16; deleted remaining-tasks plan |

**Blockers:** none.

---

## Out of Scope

- `reading-submit` edge function changes
- New question types or scoring logic
- Full admin shell rewrite outside reading section
- `LessonDetailPage` Lesen tab (lesson-level `readingPassages`)
- New npm packages

---

## Acceptance Criteria

### Learner (Part A)

- Carousel UX matches `user-doc-mockup.html` including Tasks 7–9 parity fixes
- Type tags on SetRow (batch query, no N+1)
- No regression in submit/score/draft flows
- No TypeScript errors

### Admin (Part B)

- No regression in create/edit/delete/save flows
- No TypeScript errors
- No unrelated admin page behavior changes
- Visual match per block (all must pass):
  - [ ] Page header (title + search)
  - [ ] Module card + lesson accordion
  - [ ] Set card header (type tag, status badge, stats pills, action buttons)
  - [ ] Multi-passage set body (shared title, passage list with numeric badge, inline A/B/C)
  - [ ] Single-passage set body (passage card, question-type accordion, question rows)
  - [ ] Add/edit item modal (field order, labels, `Hủy`/`Lưu` hierarchy)
  - [ ] Delete confirmation modal

---

## Execution Handoff

**Recommended:** Subagent-Driven — one subagent per task, review between tasks.

**Next up:** Task 7 (learner MC option rows), then Tasks 8–16.
