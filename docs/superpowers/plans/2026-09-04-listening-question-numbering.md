# Listening Question Numbering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On learner listening quizzes, show per-group sequential labels `1`, `2`, `3`… instead of hierarchical `1.1`, `1.2`.

**Architecture:** Extract a pure helper `formatExerciseNumberLabel` and use it in both làm-bài and kết-quả surfaces of `QuizSetListPage`. When `isListening` is true, return `String(childIndex + 1)`; otherwise keep `${groupIndex + 1}.${childIndex + 1}`. Grammar/reading paths unchanged.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, node:test + tsx.

## Global Constraints

- Code (variables, functions, types, technical comments): **English**
- UI text: **Tiếng Việt** (no new UI copy in this change)
- No `any` — use specific types or `unknown`
- Named exports only (except `App.tsx`)
- No new npm packages without asking
- Do not hand-edit `src/lib/database.types.ts`
- Scope: learner tab Nghe only; do not change GrammarExercisePage numbering
- Run `npm run lint` after the task
- Spec: `docs/superpowers/specs/2026-09-04-listening-question-numbering-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/exerciseNumberLabel.ts` | Create | Pure label formatter |
| `src/lib/exerciseNumberLabel.test.ts` | Create | Unit tests |
| `src/pages/QuizSetListPage.tsx` | Modify | Use helper for `numberLabel` (làm bài + kết quả) |

---

### Task 1: Number label helper + wire into QuizSetListPage

**Files:**
- Create: `src/lib/exerciseNumberLabel.ts`
- Create: `src/lib/exerciseNumberLabel.test.ts`
- Modify: `src/pages/QuizSetListPage.tsx` (import + 2 `numberLabel` call sites)

**Interfaces:**
- Produces: `formatExerciseNumberLabel(opts: { isListening: boolean; groupIndex: number; childIndex: number }): string`
- Consumes: none (pure)

- [ ] **Step 1: Write the failing test**

Create `src/lib/exerciseNumberLabel.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { formatExerciseNumberLabel } from "./exerciseNumberLabel";

test("listening: restarts from 1 within each group", () => {
  assert.equal(
    formatExerciseNumberLabel({ isListening: true, groupIndex: 0, childIndex: 0 }),
    "1",
  );
  assert.equal(
    formatExerciseNumberLabel({ isListening: true, groupIndex: 0, childIndex: 2 }),
    "3",
  );
  assert.equal(
    formatExerciseNumberLabel({ isListening: true, groupIndex: 1, childIndex: 0 }),
    "1",
  );
});

test("non-listening: hierarchical group.child", () => {
  assert.equal(
    formatExerciseNumberLabel({ isListening: false, groupIndex: 0, childIndex: 0 }),
    "1.1",
  );
  assert.equal(
    formatExerciseNumberLabel({ isListening: false, groupIndex: 1, childIndex: 3 }),
    "2.4",
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/exerciseNumberLabel.test.ts`  
Expected: FAIL — cannot find module `./exerciseNumberLabel`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/exerciseNumberLabel.ts`:

```ts
export function formatExerciseNumberLabel(opts: {
  isListening: boolean;
  groupIndex: number;
  childIndex: number;
}): string {
  if (opts.isListening) {
    return String(opts.childIndex + 1);
  }
  return `${opts.groupIndex + 1}.${opts.childIndex + 1}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/exerciseNumberLabel.test.ts`  
Expected: PASS (2 tests)

- [ ] **Step 5: Wire into QuizSetListPage**

Add import near other `src/lib` imports:

```ts
import { formatExerciseNumberLabel } from "../lib/exerciseNumberLabel";
```

Replace làm-bài call site (~line 355):

```tsx
numberLabel={formatExerciseNumberLabel({
  isListening,
  groupIndex,
  childIndex,
})}
```

Replace kết-quả call site (~line 473):

```tsx
numberLabel={formatExerciseNumberLabel({
  isListening,
  groupIndex,
  childIndex,
})}
```

Do **not** change `GrammarExercisePage.tsx`.

- [ ] **Step 6: Lint**

Run: `npm run lint`  
Expected: exit 0

- [ ] **Step 7: Manual verify checklist**

- [ ] Open a listening set with 1 group → labels `1`, `2`, `3`… (no `1.1`)
- [ ] Open a listening set with 2+ groups → each group restarts at `1`
- [ ] After submit, result review uses the same labels
- [ ] Open a grammar set → still `1.1`, `1.2`

- [ ] **Step 8: Commit**

```bash
git add src/lib/exerciseNumberLabel.ts src/lib/exerciseNumberLabel.test.ts src/pages/QuizSetListPage.tsx
git commit -m "$(cat <<'EOF'
fix(listening): show sequential question numbers per group

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Listening labels `1, 2, 3` per group | Task 1 |
| Restart numbering per group (B) | Task 1 tests + helper |
| Result review same as làm bài | Task 1 both call sites |
| Grammar unchanged | Explicit non-touch of GrammarExercisePage |
| Admin unchanged | No admin files |
| Out of scope: scoring/DB/promptText | No changes |

No placeholders. Types consistent (`formatExerciseNumberLabel` opts object).
