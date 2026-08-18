# Reading Exercise Carousel UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat 1-question-per-screen reading flow with mockup-aligned carousel UX (multi-passage ABC slides + single-passage MC carousel + RF summary slide), while keeping orange brand colors and server-side scoring unchanged.

**Architecture:** Replace `buildReadingScreens` with `buildReadingCarouselScreens`. Classify sets by `passageCount` only. Render with **pixel** slide width + `translateX`. Batch-fetch passage counts for SetRow tags. One migration drops unused `lessons` columns including `reading_text` (user **A**).

**Tech Stack:** React 19 + TypeScript 5.8, Tailwind v4, Supabase client, existing `reading-submit` edge function. Test: `npx tsx --test <path>`. Type check: `npm run lint` (= `tsc --noEmit`).

**Mockup reference:** `/private/tmp/claude-501/-Users-thangnv-Documents-github-frontend-main--claude-worktrees-html-mockup-admin-user-e93130/5544dca4-bf6e-49d8-8d31-dcd38172619b/scratchpad/user-doc-mockup.html`

**Replaces spec:** `docs/superpowers/specs/2026-08-14-reading-exercise-one-question-per-screen-design.md` (flat per-question screens — remove entirely, no fallback per user decision **3A**).

## Global Constraints

- User decisions locked: **1B** (DB drop via migration after audit), **2A** (set type tag = `passageCount`), **3A** (no old 1-Q-per-screen fallback), **4B** (keep orange UI, not brand red), **reading_text: A** (drop now — verified 2026-08-18).
- Code in English; user-facing labels in Vietnamese.
- No `any`; named exports except `App.tsx`.
- Do not edit `src/lib/database.types.ts` by hand — run `npm run gen:types` after migrations.
- Do not add npm packages.
- Quiz scoring stays in `reading-submit`; client never sees `correct_answer`.
- `isSingleQuestionPassage()` is **admin-only** (passage editor). Do **not** call it for tags, layout, or learner validation — it also requires empty `title`/`question_intro`, which would reject valid multi-passage sets that have an instruction box.
- Carousel: each slide gets **pixel** `width` + `flex: 0 0 auto`; track uses `translateX(-index * containerWidth)`. Do **not** use `w-full` / `flex-basis: 100%` on slides (percentage of a growing flex parent is the mockup bug).
- Do not replace Next-button `innerHTML` (breaks the SVG). Change the label text node / hide `ArrowRight` on last slide.
- GitNexus: run impact analysis on `buildReadingScreens` / `ReadingExerciseSetBody` before editing those symbols.
- Do not git commit unless the user asks.

## Plan Review Log

| Iteration | Issues found | Fixes applied |
|-----------|--------------|---------------|
| 1–3 | Format, 3A fallback, screen model, DB, SetRow N+1, instruction placement, orange dots | See prior plan versions |
| **4 (2026-08-18)** | Task 8 still pending after user chose A; `isSingleQuestionPassage` reused for validation (would reject sets with intro); `w-full` slides reintroduce % bug; `passageCount===0` tagged as single-passage; validation in `readingSetView` uses snake_case vs public camelCase; Task 1/2 tests were comments; Task 5 overlapped Task 4; mockup labels/order incomplete | Locked **reading_text: A** with SQL proof; forbid admin helper; pixel slide width; `readingSetTypeTag` returns null at 0; validation lives in `readingScreens.ts`; merge DB into Task 6; fill tests; layout table + copy from mockup |

**Blockers:** none.

---

## File Structure

| File | Role |
|------|------|
| `src/lib/readingSetView.ts` | Add `getReadingSetLayout` + `readingSetTypeTag` only. Leave `isSingleQuestionPassage` untouched (admin). |
| `src/lib/readingScreens.ts` | Delete `ReadingScreen` + `buildReadingScreens`. Add validation + `buildReadingCarouselScreens`. |
| `src/lib/hooks/useReadingSetPassageCounts.ts` | One `reading_passages` query for all lesson set IDs. |
| `src/pages/ReadingSetListPage.tsx` | Accordion tags + carousel UI. Result card stays. |
| `supabase/migrations/YYYYMMDDHHMMSS_drop_legacy_lesson_reading_columns.sql` | Drop `reading_text`, `reading_text_vi`, `listening_url`. |

---

## Screen Model (replaces flat `ReadingScreen`)

```ts
export type ReadingCarouselScreen =
  | {
      kind: "multi_passage";
      passageId: string;
      groupId: string;
      slideIndex: number;
      slideCount: number;
      key: string; // itemKey(groupId, 0)
    }
  | {
      kind: "single_mc";
      passageId: string;
      groupId: string;
      questionIndex: number;
      slideIndex: number;
      slideCount: number;
      key: string; // itemKey(groupId, questionIndex)
    }
  | {
      kind: "single_rf_summary";
      passageId: string;
      items: { key: string; text: string }[]; // may span multiple RF groups
      slideIndex: number;
      slideCount: number;
    };
```

### Set classification (user decision 2A)

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

Passage count = number of `reading_passages` rows for `set_id` (not number of question groups). Authoritative source: `useReadingSetPassageCounts`. Do **not** infer from `Object.keys(passagesById).length` — `useReadingQuestionGroups` only loads passages referenced by groups.

### Validation (malformed → error UI, NOT old flow)

Call from `buildReadingCarouselScreens` (same file, public camelCase types). Empty `groups` is handled by the page ("Bài tập cho phần này chưa được soạn.") **before** calling the builder.

**Multi-passage** (`passageCount > 1`):
- Unique `group.passageId` count must equal `passageCount`.
- Each of those passages has exactly one group.
- That group is `multiple_choice` with `subQuestions.length === 1`.
- `title` / `questionIntro` **may** be non-empty (instruction box).
- Fail → `"Cấu trúc bài đọc chưa hợp lệ. Vui lòng liên hệ admin."`

**Single-passage** (`passageCount === 1`):
- All groups share one `passageId`.
- At least one group (page already gates empty).
- Slides: each `multiple_choice` sub-question (group `orderIndex`, then sub-index), then **one** `single_rf_summary` with all `richtig_falsch` statements across RF groups (group order preserved).
- RF-only set → one summary slide.
- Fail if groups reference more than one passage.

**`passageCount < 1`:** validation error (do not treat as single-passage).

### Layout chrome (from mockup; accents stay orange — 4B)

**Multi-passage (Bài 1)** — outside the track, top to bottom:
1. Eyebrow `CÂU {n}/{total}`
2. Instruction box (`Yêu cầu:` + first group's `questionIntro` when sorted by passage `orderIndex` then group `orderIndex`). Omit box if intro empty. Do not show per-slide `group.title`.
3. Carousel track
4. Dots (`bg-orange-500` active)
5. Actions: Lưu / Quay lại / Tiếp theo (last = Nộp bài, hide `ArrowRight`)

Inside each multi slide: numbered badge `Văn bản {n}` (`n = passage.orderIndex + 1`; badge `bg-orange-50 text-orange-500`) + markdown + label `Chọn đáp án` + ABC options.

**Single-passage (Bài 3)** — outside the track:
1. Passage card with label `Văn bản` (not numbered) + markdown (fixed, does not slide)
2. Eyebrow
3. Carousel track (questions only)
4. Dots + actions (same as above)

Inside `single_mc`: question text + ABC.
Inside `single_rf_summary`: heading `Đúng / Sai` + horizontal rows (statement + Richtig/Falsch inline buttons).

**Completed set (Bài 2):** keep existing result card (`ReadingGroupBody` for review only).

### Carousel navigation

- Dots / eyebrow use global `screens.length`.
- `Quay lại` disabled at index 0.
- `Tiếp theo` / `Nộp bài` disabled until current slide is fully answered:
  - `multi_passage` / `single_mc`: `answersByKey[screen.key]` set
  - `single_rf_summary`: every `items[].key` set
- Last slide primary click → `handleSubmit` (mockup JS is demo-only and does not submit).
- `Lưu` saves full `answersByKey` (unchanged).
- After accordion expand: `requestAnimationFrame` then measure `offsetWidth`. Also listen to `resize`.

### SetRow type tag (no N+1)

Page-level hook, one query:

```ts
// src/lib/hooks/useReadingSetPassageCounts.ts
// supabase.from("reading_passages").select("set_id").in("set_id", setIds)
// → Map<setId, count>
```

Header order (mockup): chevron → `Bài {n}` → type-tag pill (if `readingSetTypeTag` non-null) → optional `CheckCircle2` → status badge.

Tag classes: `text-[10.5px] font-bold text-slate-500 border border-slate-200 rounded-full px-2 py-0.5`.

Do not call `useReadingQuestionGroups` per SetRow. Include `passageCountsLoading` in the page loading gate.

---

### Task 1: Layout + type-tag helpers

**Files:**
- Modify: `src/lib/readingSetView.ts`
- Test: `src/lib/readingSetView.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `getReadingSetLayout(passageCount: number): ReadingSetLayout`, `readingSetTypeTag(passageCount: number): string | null`

- [ ] **Step 1: Write failing tests**

Add to `src/lib/readingSetView.test.ts`:

```ts
import { getReadingSetLayout, readingSetTypeTag } from "./readingSetView";

test("getReadingSetLayout: >1 passage -> multi_passage", () => {
  assert.equal(getReadingSetLayout(3), "multi_passage");
});
test("getReadingSetLayout: 1 passage -> single_passage", () => {
  assert.equal(getReadingSetLayout(1), "single_passage");
});
test("getReadingSetLayout: 0 passages -> single_passage (tag handles empty)", () => {
  assert.equal(getReadingSetLayout(0), "single_passage");
});
test("readingSetTypeTag: 3 -> Nhiều văn bản", () => {
  assert.equal(readingSetTypeTag(3), "Nhiều văn bản");
});
test("readingSetTypeTag: 1 -> 1 văn bản · nhiều câu hỏi", () => {
  assert.equal(readingSetTypeTag(1), "1 văn bản · nhiều câu hỏi");
});
test("readingSetTypeTag: 0 -> null", () => {
  assert.equal(readingSetTypeTag(0), null);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx tsx --test src/lib/readingSetView.test.ts`
Expected: FAIL — `getReadingSetLayout` not exported

- [ ] **Step 3: Implement**

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

Do not change `isSingleQuestionPassage`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx tsx --test src/lib/readingSetView.test.ts`

---

### Task 2: Replace flat screen builder

**Files:**
- Modify: `src/lib/readingScreens.ts` (replace `ReadingScreen` + `buildReadingScreens`)
- Modify: `src/lib/readingScreens.test.ts` (replace flat tests; keep `itemKey` tests)

**Interfaces:**
- Consumes: `getReadingSetLayout`, `itemKey`, `ReadingQuestionGroupPublic`, `ReadingPassageLite`
- Produces:

```ts
export type BuildReadingCarouselResult =
  | { ok: true; layout: ReadingSetLayout; screens: ReadingCarouselScreen[] }
  | { ok: false; error: string };

export function buildReadingCarouselScreens(
  groups: ReadingQuestionGroupPublic[],
  passagesById: Record<string, ReadingPassageLite>,
  passageCount: number,
): BuildReadingCarouselResult;
```

Keep `export const itemKey`. Delete `ReadingScreen` and `buildReadingScreens` (no alias, no deprecated wrapper).

- [ ] **Step 1: Rewrite tests** — replace every `buildReadingScreens` test. Reuse existing `passage` / `multipleChoiceGroup` / `richtigFalschGroup` helpers; add a 1-MC helper if needed:

```ts
test("buildReadingCarouselScreens: 3 passages each 1 MC -> 3 multi_passage slides", () => {
  const groups = [
    multipleChoiceGroup("g1", "p1", 1),
    multipleChoiceGroup("g2", "p2", 1),
    multipleChoiceGroup("g3", "p3", 1),
  ];
  const passagesById = { p1: passage("p1", 0), p2: passage("p2", 1), p3: passage("p3", 2) };
  const result = buildReadingCarouselScreens(groups, passagesById, 3);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.layout, "multi_passage");
  assert.equal(result.screens.length, 3);
  assert.equal(result.screens[0].kind, "multi_passage");
  assert.deepEqual(result.screens.map((s) => s.kind), ["multi_passage", "multi_passage", "multi_passage"]);
});

test("buildReadingCarouselScreens: multi-passage with questionIntro still ok", () => {
  const g = multipleChoiceGroup("g1", "p1", 1);
  g.questionIntro = "Đọc đoạn văn sau.";
  const result = buildReadingCarouselScreens(
    [g, multipleChoiceGroup("g2", "p2", 1)],
    { p1: passage("p1", 0), p2: passage("p2", 1) },
    2,
  );
  assert.equal(result.ok, true);
});

test("buildReadingCarouselScreens: multi-passage with 2 MC sub-questions -> error", () => {
  const result = buildReadingCarouselScreens(
    [multipleChoiceGroup("g1", "p1", 2), multipleChoiceGroup("g2", "p2", 1)],
    { p1: passage("p1", 0), p2: passage("p2", 1) },
    2,
  );
  assert.equal(result.ok, false);
});

test("buildReadingCarouselScreens: single-passage 2 MC + 4 RF -> 3 slides", () => {
  const mc = multipleChoiceGroup("g-mc", "p1", 2);
  const rf = richtigFalschGroup("g-rf", "p1", 4);
  rf.orderIndex = 1;
  const result = buildReadingCarouselScreens([mc, rf], { p1: passage("p1", 0) }, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.layout, "single_passage");
  assert.equal(result.screens.length, 3);
  assert.equal(result.screens[0].kind, "single_mc");
  assert.equal(result.screens[1].kind, "single_mc");
  assert.equal(result.screens[2].kind, "single_rf_summary");
  if (result.screens[2].kind === "single_rf_summary") {
    assert.equal(result.screens[2].items.length, 4);
    assert.equal(result.screens[2].items[0].key, "g-rf:0");
  }
});

test("buildReadingCarouselScreens: RF-only single-passage -> 1 summary slide", () => {
  const result = buildReadingCarouselScreens(
    [richtigFalschGroup("g1", "p1", 2)],
    { p1: passage("p1", 0) },
    1,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.screens.length, 1);
  assert.equal(result.screens[0].kind, "single_rf_summary");
});

test("buildReadingCarouselScreens: passageCount 0 -> error", () => {
  const result = buildReadingCarouselScreens(
    [multipleChoiceGroup("g1", "p1", 1)],
    { p1: passage("p1", 0) },
    0,
  );
  assert.equal(result.ok, false);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx tsx --test src/lib/readingScreens.test.ts`

- [ ] **Step 3: Implement `buildReadingCarouselScreens`** (sort groups by passage `orderIndex` then `group.orderIndex`; validate; then build screens). Do **not** import `isSingleQuestionPassage`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx tsx --test src/lib/readingScreens.test.ts`

- [ ] **Step 5: Grep**

Run: `rg "buildReadingScreens" src`
Expected: only `ReadingSetListPage.tsx` until Task 4

---

### Task 3: Batch passage-count hook + SetRow tags

**Files:**
- Create: `src/lib/hooks/useReadingSetPassageCounts.ts`
- Modify: `src/pages/ReadingSetListPage.tsx`

**Interfaces:**
- Consumes: `setIds: string[]`
- Produces: `{ passageCountBySetId: Map<string, number>; loading: boolean }`

- [ ] **Step 1: Implement hook** (mirror `useNonEmptyReadingSetIds.ts`)

```ts
import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export function useReadingSetPassageCounts(setIds: string[]): {
  passageCountBySetId: Map<string, number>;
  loading: boolean;
} {
  const [passageCountBySetId, setPassageCountBySetId] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const key = setIds.join(",");

  useEffect(() => {
    if (setIds.length === 0) {
      setPassageCountBySetId(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("reading_passages")
      .select("set_id")
      .in("set_id", setIds)
      .then(({ data }) => {
        const counts = new Map<string, number>();
        for (const row of data ?? []) {
          const id = row.set_id as string | null;
          if (!id) continue;
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        setPassageCountBySetId(counts);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { passageCountBySetId, loading };
}
```

- [ ] **Step 2: Wire into page**

In `ReadingSetListPage`: call hook with `candidateSetIds`. Gate loading with `passageCountsLoading`. Pass `passageCount={passageCountBySetId.get(set.id) ?? 0}` into `SetRow`. Render `readingSetTypeTag(passageCount)` between title and check/status.

- [ ] **Step 3: Manual verify** — Network tab: one `reading_passages?set_id=in.(...)` call, not one per row.

---

### Task 4: Carousel UI in `ReadingSetListPage`

**Files:**
- Modify: `src/pages/ReadingSetListPage.tsx`

**Interfaces:**
- Consumes: `buildReadingCarouselScreens`, `ReadingCarouselScreen`, `readingSetTypeTag`, existing draft/attempt/submit hooks
- Produces: updated `ReadingExerciseSetBody`

GitNexus: `impact({target: "buildReadingScreens", direction: "upstream"})` and `impact({target: "ReadingExerciseSetBody", direction: "upstream"})` before editing. Warn if HIGH/CRITICAL.

- [ ] **Step 1: Pass `passageCount` into `ReadingExerciseSetBody`**

Source: `passageCountBySetId.get(set.id) ?? 0`.

- [ ] **Step 2: Swap builder**

```ts
const built = useMemo(
  () => buildReadingCarouselScreens(groups, passagesById, passageCount),
  [groups, passagesById, passageCount],
);
```

If `built.ok === false` → show `built.error` (not flat fallback). Reset `currentScreenIndex` to 0 when `set.id` changes.

- [ ] **Step 3: Pixel carousel track** (same file; extract `ReadingCarouselTrack` only if the JSX is unreadable)

```tsx
<div className="overflow-hidden w-full" ref={carouselRef}>
  <div
    className="flex transition-transform duration-300"
    style={{ transform: `translateX(-${index * width}px)` }}
  >
    {screens.map((screen) => (
      <div key={...} style={{ width: `${width}px`, flex: "0 0 auto" }}>
        {/* slide body */}
      </div>
    ))}
  </div>
</div>
```

Measure `width` from `carouselRef.current.offsetWidth`. Re-measure on resize and on accordion open (`requestAnimationFrame` after expand). Never `w-full` on slides.

- [ ] **Step 4: Chrome order + slide bodies** (see Layout chrome). Refactor `ReadingSingleQuestion` into `ReadingMcSlide` / `ReadingRfSummarySlide`. Reuse orange option/RF styles. RF summary uses **inline** Richtig/Falsch (mockup `.rf-row`), not stacked full-width radios.

- [ ] **Step 5: Dots + nav**

Active dot: `bg-orange-500`. `currentAnswered` for RF summary = every `items[].key` in `answersByKey`. Last slide: label `Nộp bài`, hide `ArrowRight`, `onClick={handleSubmit}`. Keep `ArrowRight` on `Tiếp theo` via JSX, not innerHTML.

- [ ] **Step 6: Delete flat-flow remnants**

Remove `buildReadingScreens` / `ReadingScreen` imports, per-group dots (`currentScreen.questionCount`), and the old single-question full-page layout. Keep `ReadingGroupBody` for result review only. Accordion exclusive-expand already exists (`setExpandedSetId(prev => prev === set.id ? null : set.id)`); starts `null`.

- [ ] **Step 7: Grep**

Run: `rg "buildReadingScreens|questionIndex.*questionCount" src`
Expected: no matches outside tests/docs

---

### Task 5: Verification

- [ ] **Step 1: Unit tests**

```bash
npx tsx --test src/lib/readingScreens.test.ts src/lib/readingSetView.test.ts
```

Expected: all PASS

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: no TypeScript errors

- [ ] **Step 3: Manual browser checklist**

1. Multi-passage: 3 slides, instruction **above** track, `Văn bản n` labels, `Chọn đáp án`, dots move, Tiếp theo disabled until answered, last slide = Nộp bài (no broken icon)
2. Single-passage: passage **fixed**, MC slides then RF summary with all statements + inline Richtig/Falsch
3. Completed set: result card unchanged
4. Accordion: one open at a time; all collapsed on first load
5. Type tags on collapsed rows (one batch query)
6. Malformed set: validation message, not old flat UI
7. Resize + reopen accordion: slides still full-width (no peek of next slide)

---

### Task 6: DB migration — drop legacy `lessons` columns (**reading_text: A** locked)

**Project:** `awdhqlgxnjwymwgxltlw` (Deutsch)

**Files:**
- Create: `supabase/migrations/YYYYMMDDHHMMSS_drop_legacy_lesson_reading_columns.sql`
- Modify: `src/lib/hooks/useModules.ts` (delete unused `listening_url` on `SupabaseLesson`)

**Do NOT drop:** `reading_passages`, `reading_question_groups`, `reading_question_groups_public`, `exercise_sets`, `exercise_set_attempts`, `exercise_set_drafts`.

**Verified 2026-08-18 (execute_sql):**
- `reading_text_vi`: unused in `src/` runtime (types only)
- `listening_url`: unused in `src/` runtime except dead `SupabaseLesson` field
- `reading_text`: 1 non-empty row, lesson `a1-l1` ("Sich vorstellen und Begrüßen", 521 chars). Lesson has **5** `reading_passages`. Passage `ff7d807a-…` (`set_id=3b9452f7-…`, `order_index=0`) **contains** the legacy German text (wrapped with markdown / "Yêu cầu:" prefix — not a byte-identical copy). Runtime `src/` does not read `lessons.reading_text`. Dropping the column does not delete `reading_passages`.

Historical migrations that `SET reading_text` stay as-is (already applied).

- [ ] **Step 1: Create migration**

```sql
ALTER TABLE lessons DROP COLUMN IF EXISTS reading_text;
ALTER TABLE lessons DROP COLUMN IF EXISTS reading_text_vi;
ALTER TABLE lessons DROP COLUMN IF EXISTS listening_url;
```

- [ ] **Step 2: Apply** via Supabase MCP `apply_migration` or team CLI

- [ ] **Step 3: Regenerate types**

```bash
npm run gen:types
```

- [ ] **Step 4: Remove `listening_url` from `SupabaseLesson` in `src/lib/hooks/useModules.ts`**

- [ ] **Step 5: Grep**

Run: `rg "reading_text_vi|listening_url|lessons\.reading_text" src supabase`
Expected: no runtime references (old migrations under `supabase/migrations/` may still mention the names historically — leave those files)

---

## Out of Scope

- Admin UI (`AdminReadingExerciseSection.tsx`)
- `reading-submit` edge function
- Switching orange → brand red
- New npm packages
- `LessonDetailPage` Lesen tab (lesson-level `readingPassages`)
- Restyling the result **review** list to the mockup's compact one-liners (keep current `ReadingGroupBody`)

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-08-18-reading-exercise-ux-mockup-carousel-implementation-plan.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks
2. **Inline Execution** — implement in this session with checkpoints

Which approach?
