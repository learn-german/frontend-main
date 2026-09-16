# Fill-in-the-blank Horizontal Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `fill_in_the_blank` groups as a full-width passage (1 child) or a 2-column sentence grid (≥ 2 children), with the word bank below the questions, on learner Ngữ pháp/Nghe and matching admin previews.

**Architecture:** Derive layout from `group.exercises.length` via `fillInBlankLayout` / `fillInBlankGroupClassName` in `grammarFillInBlank.ts`. Reuse `ExerciseAnswerInput`. Move the existing word-bank JSX below the question grid. Admin grammar preview lists siblings from `groupGrammarExercises`; admin listening preview groups the set the same way. No DB, scoring, or `ExerciseAnswerInput` internals.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4, node:test + tsx.

## Global Constraints

- Code (variables, functions, types, technical comments): **English**
- UI text: **Tiếng Việt** (no new learner copy in this change)
- No `any` — use specific types or `unknown`
- Named exports only (except `App.tsx`)
- No new npm packages
- Do not hand-edit `src/lib/database.types.ts`
- Do not change scoring, Edge Functions, RLS, or `ExerciseAnswerInput` internals
- Do not touch `AdminReadingExerciseSection` / `ReadingSetListPage`
- Do not add blank-number badges or a DB `layout` column
- Run `npm run lint` after each task that edits `.tsx`
- Spec: `docs/superpowers/specs/2026-09-16-fill-blank-horizontal-layout-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/grammarFillInBlank.ts` | Modify | `fillInBlankLayout`, `fillInBlankGroupClassName` |
| `src/lib/grammarFillInBlank.test.ts` | Modify | Unit tests for layout helper |
| `src/pages/GrammarExercisePage.tsx` | Modify | Learner ngữ pháp: grid + word bank below |
| `src/pages/QuizSetListPage.tsx` | Modify | Learner nghe: grid + word bank below |
| `src/pages/admin/AdminGrammarExerciseSection.tsx` | Modify | Preview whole fill-blank group |
| `src/pages/admin/AdminListeningExerciseSection.tsx` | Modify | Preview grouped; fill-blank uses helper + static bank |

---

### Task 1: Layout helper

**Files:**
- Modify: `src/lib/grammarFillInBlank.ts` (append after `countBlankMarkers`)
- Modify: `src/lib/grammarFillInBlank.test.ts` (append asserts)

**Interfaces:**
- Consumes: none
- Produces:
  - `export type FillBlankLayout = "passage" | "rows"`
  - `export function fillInBlankLayout(exerciseCount: number): FillBlankLayout`
  - `export function fillInBlankGroupClassName(exerciseCount: number): string`

- [ ] **Step 1: Write the failing asserts**

Append to `src/lib/grammarFillInBlank.test.ts` (keep the file’s existing `assert` style, no `node:test` wrapper):

```ts
assert.equal(fillInBlankLayout(0), "passage");
assert.equal(fillInBlankLayout(1), "passage");
assert.equal(fillInBlankLayout(2), "rows");
assert.equal(fillInBlankLayout(8), "rows");
assert.equal(fillInBlankGroupClassName(1), "grid grid-cols-1 gap-3");
assert.equal(fillInBlankGroupClassName(2), "grid grid-cols-1 gap-3 md:grid-cols-2");
```

Add the two names to the existing import from `./grammarFillInBlank`.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --import tsx --test src/lib/grammarFillInBlank.test.ts`

Expected: FAIL — `fillInBlankLayout` / `fillInBlankGroupClassName` is not exported.

- [ ] **Step 3: Implement the helpers**

In `src/lib/grammarFillInBlank.ts`, immediately after `countBlankMarkers`:

```ts
export type FillBlankLayout = "passage" | "rows";

export function fillInBlankLayout(exerciseCount: number): FillBlankLayout {
  return exerciseCount <= 1 ? "passage" : "rows";
}

export function fillInBlankGroupClassName(exerciseCount: number): string {
  return fillInBlankLayout(exerciseCount) === "passage"
    ? "grid grid-cols-1 gap-3"
    : "grid grid-cols-1 gap-3 md:grid-cols-2";
}
```

- [ ] **Step 4: Re-run the test**

Run: `node --import tsx --test src/lib/grammarFillInBlank.test.ts`

Expected: PASS (exit 0).

- [ ] **Step 5: Commit**

```bash
git add src/lib/grammarFillInBlank.ts src/lib/grammarFillInBlank.test.ts
git commit -m "$(cat <<'EOF'
feat(fill-blank): derive passage vs two-column layout from child count

EOF
)"
```

---

### Task 2: Learner ngữ pháp — grid + word bank below

**Files:**
- Modify: `src/pages/GrammarExercisePage.tsx` (import ~10–18, `renderGroupContent` ~412–501)

**Interfaces:**
- Consumes: `fillInBlankGroupClassName(exerciseCount: number): string`
- Produces: fill-blank groups use passage/rows grid; word bank renders after the question grid

- [ ] **Step 1: Import the class helper**

In the `grammarFillInBlank` import, add `fillInBlankGroupClassName`:

```ts
import {
  applyChipToBlank,
  applyTypedBlankAnswer,
  countBlankMarkers,
  fillInBlankGroupClassName,
  findBlankTarget,
  getUsedWordIndexes,
  type BlankAssignments,
  type BlankFocus,
} from "../lib/grammarFillInBlank";
```

- [ ] **Step 2: Move the word-bank block below the grid and branch the grid class**

Inside `renderGroupContent`, keep hint + instruction on top. **Cut** the entire `{group.type === "fill_in_the_blank" && wordBank && ( ... )}` block (currently immediately before the grid). **Do not rewrite chip logic.**

Replace the grid `className` ternary:

```tsx
        <div className={
          group.type === "fill_in_the_blank"
            ? fillInBlankGroupClassName(group.exercises.length)
            : group.type === "classification"
              ? "grid grid-cols-1 gap-3"
              : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        }>
```

Immediately **after** that grid’s closing `</div>` (still inside the outer `space-y-3`), paste the word-bank block that was cut:

```tsx
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
```

Do **not** move Lưu / Nộp bài. Do **not** change `ExerciseAnswerInput` props or `numberLabel`.

- [ ] **Step 3: Typecheck**

Run: `npm run lint`

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/GrammarExercisePage.tsx
git commit -m "$(cat <<'EOF'
feat(grammar): lay out fill-blank groups as passage or two-column rows

EOF
)"
```

---

### Task 3: Learner nghe — grid + word bank below

**Files:**
- Modify: `src/pages/QuizSetListPage.tsx` (import ~17–25, `renderGroupContent` ~296–end of that function)

**Interfaces:**
- Consumes: `fillInBlankGroupClassName(exerciseCount: number): string`
- Produces: listening (and leftover `doc` branch on this page) fill-blank groups use the same layout as ngữ pháp; other listening types stay `flex flex-col`

- [ ] **Step 1: Import the class helper**

```ts
import {
  applyChipToBlank,
  applyTypedBlankAnswer,
  countBlankMarkers,
  fillInBlankGroupClassName,
  findBlankTarget,
  getUsedWordIndexes,
  type BlankAssignments,
  type BlankFocus,
} from "../lib/grammarFillInBlank";
```

- [ ] **Step 2: Move the word-bank block below the grid and branch the grid class**

Word bank currently sits **before** the grid (~302–347). Cut that entire `{group.type === "fill_in_the_blank" && wordBank && ( ... )}` block. Paste it immediately **after** the grid’s closing `</div>` (still inside the outer `space-y-3`). Do not rewrite chip `onClick` logic.

Replace the grid class ternary (~348–352):

```tsx
        <div className={
          group.type === "fill_in_the_blank"
            ? fillInBlankGroupClassName(group.exercises.length)
            : isListening || group.type === "classification"
              ? "flex flex-col gap-3"
              : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        }>
```

Leave `formatExerciseNumberLabel`, footer Lưu / Kiểm tra đáp án, and result-card rendering unchanged.

- [ ] **Step 3: Typecheck**

Run: `npm run lint`

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/QuizSetListPage.tsx
git commit -m "$(cat <<'EOF'
feat(listening): use fill-blank passage and two-column layouts

EOF
)"
```

---

### Task 4: Admin ngữ pháp — preview the whole fill-blank group

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx` (import ~27–33, preview modal ~1523–1605)

**Interfaces:**
- Consumes: `fillInBlankGroupClassName`, `groupGrammarExercises` (already imported), `GrammarExercise.groupId` / `orderIndex` / `setId` already on the admin type
- Produces: previewing any fill-blank child shows all siblings in the same set-group; word bank once below; modal `max-w-3xl`

- [ ] **Step 1: Import `fillInBlankGroupClassName`**

```ts
import {
  fillInBlankGroupClassName,
  normalizeWordBank,
  syncBlankDefinitions,
  type BlankDefinition,
  type WordBank,
  type WordBankMode,
} from "../../lib/grammarFillInBlank";
```

- [ ] **Step 2: Resolve siblings when `previewTarget` is fill-blank**

Inside `AdminGrammarExerciseSection`, just above the `{previewTarget && (` JSX (around line 1523), compute:

```tsx
  const fillBlankPreviewGroup = (() => {
    if (!previewTarget || previewTarget.type !== "fill_in_the_blank") return null;
    const setExercises = groups
      .flatMap((lesson) => lesson.exercises)
      .filter((exercise) => exercise.setId === previewTarget.setId);
    const grouped = groupGrammarExercises(setExercises);
    const match = grouped.find((group) =>
      group.exercises.some((exercise) => exercise.id === previewTarget.id),
    );
    return match?.exercises ?? [previewTarget];
  })();
```

Fallback `[previewTarget]` covers a missing sibling list (PA01).

- [ ] **Step 3: Widen the modal and render the group**

Change the modal shell `max-w-lg` to:

```tsx
          <div className={`bg-white rounded-2xl shadow-xl p-6 w-full space-y-4 ${
            previewTarget.type === "fill_in_the_blank" ? "max-w-3xl" : "max-w-lg"
          }`}>
```

Replace the existing `{previewTarget.type === "fill_in_the_blank" && ( ... )}` block (word bank **above**, single `prompt_text`) with:

```tsx
            {previewTarget.type === "fill_in_the_blank" && fillBlankPreviewGroup && (
              <div className="space-y-3">
                <div className={fillInBlankGroupClassName(fillBlankPreviewGroup.length)}>
                  {fillBlankPreviewGroup.map((exercise, childIndex) => (
                    <div key={exercise.id} className="text-sm leading-10 text-slate-700">
                      <span className="mr-1 font-bold text-slate-400">
                        {childIndex + 1}
                      </span>
                      {(exercise.prompt_text ?? "").split("___").map((segment, index, segments) => (
                        <React.Fragment key={`${exercise.id}:${index}:${segment}`}>
                          <span className="whitespace-pre-wrap">{segment}</span>
                          {index < segments.length - 1 && (
                            <input
                              type="text"
                              readOnly
                              className="mx-1 inline-block w-28 rounded-lg border border-slate-200 px-2 py-1.5"
                              aria-label={`Ô trống ${index + 1}`}
                            />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  ))}
                </div>
                {fillBlankPreviewGroup[0]?.word_bank && (
                  <div className="flex flex-wrap gap-2 rounded-xl bg-orange-50 p-3">
                    {fillBlankPreviewGroup[0].word_bank.words.map((word, index) => (
                      <span
                        key={`${index}:${word}`}
                        className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-bold text-orange-700"
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
```

Keep every other type’s preview branch unchanged. Do not change the edit form (textarea `___`, per-blank answers, word-bank config).

- [ ] **Step 4: Typecheck**

Run: `npm run lint`

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminGrammarExerciseSection.tsx
git commit -m "$(cat <<'EOF'
feat(admin): preview fill-blank groups with learner horizontal layout

EOF
)"
```

---

### Task 5: Admin nghe — group preview + fill-blank layout

**Files:**
- Modify: `src/pages/admin/AdminListeningExerciseSection.tsx`
  - `ListeningExerciseRow` (~63–76)
  - `fetchSetData` select (~490–496)
  - preview list (~1257–1299)
  - imports (~37, add `groupGrammarExercises` + helper)

**Interfaces:**
- Consumes: `fillInBlankGroupClassName`, `groupGrammarExercises`, `WordBank`
- Produces: preview walks type-groups; fill-blank uses passage/rows + static word bank below that group; MC/RF stay a vertical stack; blank inputs remain editable

- [ ] **Step 1: Extend the row type and fetch `word_bank`**

Add to `ListeningExerciseRow`:

```ts
  word_bank: { words: string[]; mode: "single_use" | "multiple_use" } | null;
```

Change the `grammar_exercises` select string to include `word_bank`:

```ts
          "id, lesson_id, set_id, group_id, type, prompt_text, correct_answer, options, blanks, word_bank, audio_clip_id, order_index, explanation",
```

- [ ] **Step 2: Import grouping + layout helpers**

```ts
import { fillInBlankGroupClassName, syncBlankDefinitions, type BlankDefinition } from "../../lib/grammarFillInBlank";
import { groupGrammarExercises } from "../../lib/grammarExerciseGroups";
```

(`syncBlankDefinitions` / `BlankDefinition` stay; only add the new names.)

- [ ] **Step 3: Replace the flat preview list**

Replace the `{setExercises.length === 0 ? ... : ( <div className="space-y-3">{setExercises.map(...)}</div> )}` block with:

```tsx
            {setExercises.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Chưa có câu hỏi.</p>
            ) : (
              <div className="space-y-3">
                {groupGrammarExercises(
                  setExercises.map((row) => ({
                    ...row,
                    groupId: row.group_id,
                    orderIndex: row.order_index,
                  })),
                ).map((group) => (
                  <div key={group.key} className="space-y-3">
                    <div
                      className={
                        group.type === "fill_in_the_blank"
                          ? fillInBlankGroupClassName(group.exercises.length)
                          : "flex flex-col gap-3"
                      }
                    >
                      {group.exercises.map((row, childIndex) => {
                        const exercise = toClientExercise(row);
                        return (
                          <ExerciseAnswerInput
                            key={row.id}
                            exercise={exercise}
                            numberLabel={String(childIndex + 1)}
                            selectedTokens={[]}
                            onToggleToken={() => undefined}
                            onClearTokens={() => undefined}
                            textAnswer={previewText[row.id] ?? ""}
                            onTextAnswerChange={(v) => setPreviewText((prev) => ({ ...prev, [row.id]: v }))}
                            itemGroups={{}}
                            onItemGroupChange={() => undefined}
                            blankAnswers={
                              previewBlanks[row.id] ??
                              Array((row.prompt_text ?? "").split("___").length - 1).fill("")
                            }
                            onBlankFocus={() => undefined}
                            onBlankAnswerChange={(blankIndex, value) =>
                              setPreviewBlanks((prev) => {
                                const current =
                                  prev[row.id] ??
                                  Array((row.prompt_text ?? "").split("___").length - 1).fill("");
                                return {
                                  ...prev,
                                  [row.id]: current.map((v, j) => (j === blankIndex ? value : v)),
                                };
                              })
                            }
                            selectedChoice={previewChoice[row.id]}
                            onSelectChoice={(idx) =>
                              setPreviewChoice((prev) => ({ ...prev, [row.id]: idx }))
                            }
                            optionLayout="horizontal"
                          />
                        );
                      })}
                    </div>
                    {group.type === "fill_in_the_blank" && group.exercises[0]?.word_bank && (
                      <div className="flex flex-wrap gap-2 rounded-xl bg-orange-50 p-3">
                        {group.exercises[0].word_bank.words.map((word, index) => (
                          <span
                            key={`${index}:${word}`}
                            className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-bold text-orange-700"
                          >
                            {word}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
```

`groupGrammarExercises` requires `groupId` + `orderIndex`; spreading the row plus those aliases is enough. Do not change the question editor form.

- [ ] **Step 4: Typecheck**

Run: `npm run lint`

Expected: no new errors. If `ListeningExerciseRow` literals elsewhere omit `word_bank`, set `word_bank: null` on those objects or rely on the fetch cast (fetched rows include the column).

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminListeningExerciseSection.tsx
git commit -m "$(cat <<'EOF'
feat(admin): preview listening fill-blank groups in horizontal layout

EOF
)"
```

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| `fillInBlankLayout`: ≤1 passage, ≥2 rows | 1 |
| Grid classes passage / `md:grid-cols-2` (no `lg:grid-cols-3`) | 1–3 |
| Learner ngữ pháp grid + bank below | 2 |
| Learner nghe fill-blank uses helper; MC/RF stay 1 col | 3 |
| No blank-number badges; keep sentence labels | 2–3 (untouched `numberLabel`) |
| Lưu/Nộp stay set footer | 2–3 (untouched) |
| Result card unchanged | (no task) |
| Admin grammar group preview + bank below + wider modal | 4 |
| Admin listening grouped preview + static bank | 5 |
| Reading / DB / scoring / `ExerciseAnswerInput` internals | out of scope |

## Manual verification (after Task 5)

1. Ngữ pháp, 1 câu cloze → full-width; bank under the passage; Lưu/Nộp under that.
2. Ngữ pháp, ≥ 2 câu → 2 columns at desktop, 1 column at ~375px; chips under the grid.
3. Nghe fill-blank 1 vs ≥ 2 — same rule.
4. Nghe mix fill-blank + MC → fill-blank uses helper; MC stays a column.
5. Submit / score / result card / draft Lưu — unchanged.
6. Admin grammar preview 1 vs ≥ 2 children — matches learner; bank below.
7. Admin nghe preview — same; MC/RF not 2-column.
8. Edit form textarea `___` unchanged.
