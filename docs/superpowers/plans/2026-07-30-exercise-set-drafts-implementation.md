# Phase 3 — Lưu Đáp Án Đang Làm Dở Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Học viên gõ đáp án bài tập ngữ pháp, chưa nộp, rời trang/đăng
xuất, quay lại vẫn thấy đúng đáp án đã gõ — tự động lưu nền và có nút Lưu
tường minh.

**Architecture:** Bảng `exercise_set_drafts` (RLS own read/write, học viên
tự ghi trực tiếp qua PostgREST không qua Edge Function). Hook mới
`useExerciseSetDraft` cung cấp fetch + save + delete. `GrammarExercisePage`
thêm 1 effect debounce autosave, 1 nút Lưu tường minh, và đổi tín hiệu
"hydrate từ đâu lúc mount" từ cờ `retrying` cục bộ sang **sự tồn tại của
draft row** (draft thắng, rồi mới tới attempt, rồi mới tới form trắng).

**Tech Stack:** Supabase Postgres + RLS, React 19 + TypeScript, `node:test`.

## Global Constraints

- Ngôn ngữ code: English. Nội dung hiển thị cho user: Tiếng Việt.
- Naming: `camelCase` biến/hàm, `PascalCase` component/type.
- Không dùng `any`. Named exports, không default export.
- Không thêm npm package mới.
- Không sửa `src/lib/database.types.ts` bằng tay — chỉ qua MCP
  `generate_typescript_types`.
- Migration áp trực tiếp lên production (`awdhqlgxnjwymwgxltlw`) — hệ thống
  chưa có user thật, theo giả định nền đã dùng ở Phase 1-2.
- `npm run lint` sạch sau mỗi task có sửa code sản phẩm.
- Chỉ nối vào `GrammarExercisePage` (Ngữ pháp) — không đụng `QuizPage`
  (Nghe/Đọc), schema/RLS category-agnostic nhưng UI wiring để Phase 4.
- Không autosave khi đang hiện card kết quả (`result !== null`).
- Không lưu draft nếu mọi đáp án đều rỗng.
- Không prop-drill `user.id` vào `GrammarExercisePage` — dùng
  `DEFAULT auth.uid()` ở cột `user_id`, đúng pattern RLS hiện có.

---

## Bối cảnh cho engineer chưa biết gì về việc này

Spec đầy đủ: [docs/superpowers/specs/2026-07-30-exercise-set-drafts-design.md](../specs/2026-07-30-exercise-set-drafts-design.md).

Branch này (`claude/exercise-sets-phase3`) đứng trên
`claude/exercise-sets-phase2` ([PR #77](https://github.com/learn-german/frontend-main/pull/77),
chưa merge nhưng đã test trên trình duyệt xác nhận hoạt động đúng, migration
Phase 1-2 đã áp production).

**Điểm thiết kế quan trọng nhất:** tín hiệu quyết định hiển thị gì lúc mount
lại trang **không phải** cờ `retrying` (state cục bộ, mất khi F5) mà là
**sự tồn tại của row trong `exercise_set_drafts`**. `retrying` vẫn giữ vai
trò cũ (chặn effect hydrate-từ-attempt tự chạy lại ngay trong cùng phiên
sau khi bấm "Làm lại") — đây là cơ chế trong-phiên, độc lập với cơ chế
xuyên-phiên dựa trên draft.

## File Structure

**Tạo mới:**
- `supabase/migrations/<ts>_exercise_set_drafts.sql`
- `src/lib/exerciseSetDraftLogic.ts` — logic thuần: `hasAnyAnswer`,
  `pickHydrateSource`.
- `src/lib/exerciseSetDraftLogic.test.ts`
- `src/lib/hooks/useExerciseSetDraft.ts`

**Sửa:**
- `src/lib/grammarAnswerCodec.ts` — thêm `parseAnswersIntoFormState`, tách
  từ logic lặp đang trùng nhau giữa 2 effect hydrate.
- `src/lib/grammarAnswerCodec.test.ts` — test hàm mới.
- `src/pages/GrammarExercisePage.tsx` — wiring chính.

---

## Task 1: Migration `exercise_set_drafts`

**Files:**
- Create: `supabase/migrations/<ts>_exercise_set_drafts.sql`

**Interfaces:**
- Produces: bảng `exercise_set_drafts(user_id, set_id, answers, updated_at)`,
  PRIMARY KEY `(user_id, set_id)`. Task 3 (hook) đọc/ghi bảng này.

- [ ] **Step 1: Viết migration file**

Lấy timestamp UTC hiện tại (`date -u +%Y%m%d%H%M%S`), tạo file:

```sql
-- =============================================================================
-- DeutschPath — exercise_set_drafts: lưu đáp án học viên đang làm dở, chưa
-- nộp. Khác exercise_set_attempts (chỉ service_role ghi vì liên quan chấm
-- điểm/đáp án đúng) — draft không chứa gì nhạy cảm, học viên tự đọc/ghi
-- trực tiếp qua PostgREST.
--
-- user_id DEFAULT auth.uid(): GrammarExercisePage không nhận user.id qua
-- prop (đúng pattern mọi hook bài tập khác — chỉ dựa RLS lọc hàng của
-- chính mình), nên client không có gì đưa vào payload insert nếu cột
-- không tự điền qua default.
-- =============================================================================

CREATE TABLE exercise_set_drafts (
  user_id    UUID        NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  set_id     UUID        NOT NULL REFERENCES exercise_sets(id) ON DELETE CASCADE,
  answers    JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, set_id)
);

ALTER TABLE exercise_set_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercise_set_drafts: own read/write"
  ON exercise_set_drafts FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

- [ ] **Step 2: Áp migration lên production**

Gọi MCP `apply_migration` với `project_id: "awdhqlgxnjwymwgxltlw"`,
`name: "exercise_set_drafts"`, `query` = nội dung Step 1.

- [ ] **Step 3: Kiểm chứng**

```sql
SELECT column_name, column_default FROM information_schema.columns
WHERE table_name = 'exercise_set_drafts' ORDER BY ordinal_position;
```
Expected: 4 cột, `user_id` có `column_default` chứa `auth.uid()`.

```sql
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'exercise_set_drafts';
```
Expected: đúng 1 policy `exercise_set_drafts: own read/write`, `cmd = ALL`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<ts>_exercise_set_drafts.sql
git commit -m "feat(db): tạo bảng exercise_set_drafts, RLS own read/write"
```

---

## Task 2: Logic thuần — `hasAnyAnswer`, `pickHydrateSource`, TDD

**Files:**
- Create: `src/lib/exerciseSetDraftLogic.ts`
- Create: `src/lib/exerciseSetDraftLogic.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function hasAnyAnswer(answers: Record<string, string>): boolean
  export type HydrateSource = "draft" | "attempt" | "blank";
  export function pickHydrateSource(hasDraft: boolean, hasAttempt: boolean): HydrateSource
  ```
  Task 4 (`useExerciseSetDraft`) dùng `hasAnyAnswer` để chặn lưu draft rỗng.
  Task 5 (`GrammarExercisePage`) dùng `pickHydrateSource` để quyết định
  effect nào populate form.

- [ ] **Step 1: Viết test trước**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { hasAnyAnswer, pickHydrateSource } from "./exerciseSetDraftLogic";

test("hasAnyAnswer: mọi giá trị rỗng -> false", () => {
  assert.equal(hasAnyAnswer({ a: "", b: "  " }), false);
});

test("hasAnyAnswer: có ít nhất 1 giá trị không rỗng -> true", () => {
  assert.equal(hasAnyAnswer({ a: "", b: "ich" }), true);
});

test("hasAnyAnswer: object rỗng -> false", () => {
  assert.equal(hasAnyAnswer({}), false);
});

test("pickHydrateSource: có draft -> draft thắng dù có cả attempt", () => {
  assert.equal(pickHydrateSource(true, true), "draft");
});

test("pickHydrateSource: không draft, có attempt -> attempt", () => {
  assert.equal(pickHydrateSource(false, true), "attempt");
});

test("pickHydrateSource: không có gì -> blank", () => {
  assert.equal(pickHydrateSource(false, false), "blank");
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx tsx --test src/lib/exerciseSetDraftLogic.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 3: Viết implementation**

```ts
export function hasAnyAnswer(answers: Record<string, string>): boolean {
  return Object.values(answers).some((value) => value.trim() !== "");
}

export type HydrateSource = "draft" | "attempt" | "blank";

// Draft luôn thắng nếu tồn tại — học viên đang làm dở quan trọng hơn kết
// quả đã nộp trước đó, kể cả khi cả hai cùng tồn tại (nộp bài, bấm Làm lại,
// gõ vài câu rồi rời trang không nộp — quay lại phải thấy draft, không
// phải kết quả cũ).
export function pickHydrateSource(hasDraft: boolean, hasAttempt: boolean): HydrateSource {
  if (hasDraft) return "draft";
  if (hasAttempt) return "attempt";
  return "blank";
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx tsx --test src/lib/exerciseSetDraftLogic.test.ts`
Expected: PASS toàn bộ 6 test.

- [ ] **Step 5: `npm run lint`**

Expected: sạch.

- [ ] **Step 6: Commit**

```bash
git add src/lib/exerciseSetDraftLogic.ts src/lib/exerciseSetDraftLogic.test.ts
git commit -m "feat(grammar): hasAnyAnswer/pickHydrateSource — logic thuần cho draft"
```

---

## Task 3: `parseAnswersIntoFormState` — tách logic dùng chung giữa 2 effect hydrate

**Files:**
- Modify: `src/lib/grammarAnswerCodec.ts`
- Modify: `src/lib/grammarAnswerCodec.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ParsedFormState {
    textAnswers: Record<string, string>;
    blankAnswers: Record<string, string[]>;
    itemGroups: Record<string, Record<string, string>>;
    choices: Record<string, number>;
  }
  export function parseAnswersIntoFormState(
    exercises: GrammarExercise[],
    answers: Record<string, string>,
  ): ParsedFormState
  ```
  Task 5 (`GrammarExercisePage`) dùng hàm này ở CẢ hydrate-từ-attempt
  (đã có, đang lặp logic này inline) LẪN hydrate-từ-draft (mới).

- [ ] **Step 1: Đọc file hiện tại, xác nhận đúng vị trí chèn**

`src/lib/grammarAnswerCodec.ts` đã có `emptyAnswer`, `parseAnswer`,
`serializeAnswer`. Thêm hàm mới vào cuối file, dùng lại `parseAnswer`/
`emptyAnswer` đã có — đây chính là vòng lặp hiện đang nằm inline trong
`GrammarExercisePage.tsx:366-379`.

- [ ] **Step 2: Viết test cho hàm mới**

Thêm vào `src/lib/grammarAnswerCodec.test.ts` (nối vào cuối file, giữ
nguyên test hiện có):

```ts
import { parseAnswersIntoFormState } from "./grammarAnswerCodec";

test("parseAnswersIntoFormState: phân đúng loại đáp án theo từng exercise", () => {
  const exercises = [
    { id: "e1", type: "translation" } as GrammarExercise,
    { id: "e2", type: "multiple_choice", options: ["a", "b"] } as GrammarExercise,
  ];
  const result = parseAnswersIntoFormState(exercises, { e1: "Hallo", e2: "1" });
  assert.equal(result.textAnswers.e1, "Hallo");
  assert.equal(result.choices.e2, 1);
});

test("parseAnswersIntoFormState: exercise không có trong answers -> giá trị rỗng, không throw", () => {
  const exercises = [{ id: "e1", type: "translation" } as GrammarExercise];
  const result = parseAnswersIntoFormState(exercises, {});
  assert.equal(result.textAnswers.e1, "");
});
```

Kiểm tra import `GrammarExercise` và `assert`/`test` đã có sẵn ở đầu file
hiện tại (nếu chưa, thêm đúng theo pattern các test khác trong cùng file).

- [ ] **Step 3: Chạy test, xác nhận FAIL**

Run: `npx tsx --test src/lib/grammarAnswerCodec.test.ts`
Expected: FAIL — `parseAnswersIntoFormState` chưa tồn tại.

- [ ] **Step 4: Viết implementation, thêm vào cuối `grammarAnswerCodec.ts`**

```ts
export interface ParsedFormState {
  textAnswers: Record<string, string>;
  blankAnswers: Record<string, string[]>;
  itemGroups: Record<string, Record<string, string>>;
  choices: Record<string, number>;
}

/**
 * Phân rã 1 object answers (wire format, key theo exercise id) thành 4 state
 * riêng theo loại câu — dùng chung cho hydrate từ attempt đã nộp lẫn hydrate
 * từ draft chưa nộp, tránh lặp lại đúng vòng lặp này ở 2 nơi.
 */
export function parseAnswersIntoFormState(
  exercises: GrammarExercise[],
  answers: Record<string, string>,
): ParsedFormState {
  const textAnswers: Record<string, string> = {};
  const blankAnswers: Record<string, string[]> = {};
  const itemGroups: Record<string, Record<string, string>> = {};
  const choices: Record<string, number> = {};

  for (const exercise of exercises) {
    const raw = answers[exercise.id];
    const parsed: ParsedAnswer = raw === undefined ? emptyAnswer(exercise) : parseAnswer(exercise, raw);
    if (parsed.kind === "text") textAnswers[exercise.id] = parsed.value;
    else if (parsed.kind === "blanks") blankAnswers[exercise.id] = parsed.values;
    else if (parsed.kind === "groups") itemGroups[exercise.id] = parsed.values;
    else if (parsed.index !== undefined) choices[exercise.id] = parsed.index;
  }

  return { textAnswers, blankAnswers, itemGroups, choices };
}
```

- [ ] **Step 5: Chạy test, xác nhận PASS**

Run: `npx tsx --test src/lib/grammarAnswerCodec.test.ts`
Expected: PASS toàn bộ (test cũ + 2 test mới).

- [ ] **Step 6: `npm run lint`**

Expected: sạch.

- [ ] **Step 7: Commit**

```bash
git add src/lib/grammarAnswerCodec.ts src/lib/grammarAnswerCodec.test.ts
git commit -m "refactor(grammar): tách parseAnswersIntoFormState, dùng chung cho hydrate attempt/draft"
```

---

## Task 4: `useExerciseSetDraft` — fetch + save + delete

**Files:**
- Create: `src/lib/hooks/useExerciseSetDraft.ts`

**Interfaces:**
- Consumes: `hasAnyAnswer` (Task 2).
- Produces:
  ```ts
  export interface SetDraft {
    answers: Record<string, string>;
  }
  export function useExerciseSetDraft(setId: string): {
    draft: SetDraft | null;
    loading: boolean;
    saveDraft: (answers: Record<string, string>) => Promise<void>;
    deleteDraft: () => Promise<void>;
  }
  ```
  Task 5 (`GrammarExercisePage`) dùng hook này.

- [ ] **Step 1: Viết hook**

```ts
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { hasAnyAnswer } from "../exerciseSetDraftLogic";

export interface SetDraft {
  answers: Record<string, string>;
}

/**
 * Draft đáp án chưa nộp, key theo (user, set). Học viên tự đọc/ghi trực
 * tiếp qua PostgREST (RLS own read/write) — khác exercise_set_attempts,
 * không qua Edge Function vì draft không liên quan chấm điểm/đáp án đúng.
 */
export function useExerciseSetDraft(setId: string): {
  draft: SetDraft | null;
  loading: boolean;
  saveDraft: (answers: Record<string, string>) => Promise<void>;
  deleteDraft: () => Promise<void>;
} {
  const [draft, setDraft] = useState<SetDraft | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!setId) {
      setDraft(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("exercise_set_drafts")
      .select("answers")
      .eq("set_id", setId)
      .maybeSingle()
      .then(({ data }) => {
        setDraft(data ? { answers: data.answers as Record<string, string> } : null);
        setLoading(false);
      });
  }, [setId]);

  useEffect(() => { refetch(); }, [refetch]);

  const saveDraft = useCallback(
    async (answers: Record<string, string>) => {
      if (!setId || !hasAnyAnswer(answers)) return;
      const { error } = await supabase.from("exercise_set_drafts").upsert(
        { set_id: setId, answers, updated_at: new Date().toISOString() },
        { onConflict: "user_id,set_id" },
      );
      if (!error) setDraft({ answers });
    },
    [setId],
  );

  const deleteDraft = useCallback(async () => {
    if (!setId) return;
    await supabase.from("exercise_set_drafts").delete().eq("set_id", setId);
    setDraft(null);
  }, [setId]);

  return { draft, loading, saveDraft, deleteDraft };
}
```

Lưu ý cho engineer: `upsert` KHÔNG đưa `user_id` vào payload — cột này có
`DEFAULT auth.uid()` ở DB (Task 1), tự điền đúng user đang đăng nhập. Đây
là điểm dễ nhầm nếu quen pattern upsert đưa đủ mọi cột PK.

- [ ] **Step 2: `npm run lint`**

Expected: sạch — hook tự chứa, không phụ thuộc gì chưa tồn tại.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useExerciseSetDraft.ts
git commit -m "feat(grammar): useExerciseSetDraft — fetch/save/delete draft đáp án"
```

---

## Task 5: Nối vào `GrammarExercisePage` — hydrate ưu tiên draft, autosave, nút Lưu, xóa draft sau nộp

**Files:**
- Modify: `src/pages/GrammarExercisePage.tsx`

**Interfaces:**
- Consumes: `useExerciseSetDraft` (Task 4), `parseAnswersIntoFormState`
  (Task 3), `pickHydrateSource` (Task 2).

- [ ] **Step 1: Import**

Thêm vào đầu file, cạnh các import hook/lib hiện có:

```tsx
import { useExerciseSetDraft } from "../lib/hooks/useExerciseSetDraft";
import { parseAnswersIntoFormState } from "../lib/grammarAnswerCodec";
import { pickHydrateSource } from "../lib/exerciseSetDraftLogic";
```

- [ ] **Step 2: Gọi hook, đặt ngay sau `useExerciseSetAttempt`**

Tìm dòng `const { attempt, loading: attemptLoading } = useExerciseSetAttempt(set.id);`,
thêm ngay sau:

```tsx
  const { draft, loading: draftLoading, saveDraft, deleteDraft } = useExerciseSetDraft(set.id);
```

- [ ] **Step 3: Sửa effect hydrate-từ-attempt — dùng `parseAnswersIntoFormState`, chặn khi có draft**

Đọc lại đúng đoạn hiện tại (dòng khoảng 343-386) trước khi sửa — nội dung
tham chiếu ở đây lấy từ lúc viết plan, số dòng thật có thể lệch nhẹ. Đổi:

```tsx
  React.useEffect(() => {
    if (!attempt || retrying || exercises.length === 0) return;

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
      // correctAnswers/explanations không hydrate lại từ đây — chỉ set này
      // nhận được lúc submit thật (revealed=true tại thời điểm đó). Nếu học
      // viên rời trang rồi quay lại sau khi đã revealed, phần dưới ẩn card
      // giải thích thay vì hiện field rỗng — chấp nhận được, ưu tiên không
      // lưu correct_answer ra localStorage/state ngoài phiên submit gốc.
    });

    const textAnswers: Record<string, string> = {};
    const blankAnswers: Record<string, string[]> = {};
    const itemGroups: Record<string, Record<string, string>> = {};
    const choices: Record<string, number> = {};

    for (const exercise of exercises) {
      const raw = attempt.answers[exercise.id];
      const parsed: ParsedAnswer =
        raw === undefined ? emptyAnswer(exercise) : parseAnswer(exercise, raw);
      if (parsed.kind === "text") textAnswers[exercise.id] = parsed.value;
      else if (parsed.kind === "blanks") blankAnswers[exercise.id] = parsed.values;
      else if (parsed.kind === "groups") itemGroups[exercise.id] = parsed.values;
      else if (parsed.index !== undefined) choices[exercise.id] = parsed.index;
    }

    setTextAnswerByExercise(textAnswers);
    setBlankAnswersByExercise(blankAnswers);
    setItemGroupsByExercise(itemGroups);
    setChoiceByExercise(choices);
    setSubmittedAnswerSnapshot(attempt.answers ?? {});
  }, [attempt, retrying, exercises]);
```

thành:

```tsx
  // Draft thắng nếu tồn tại (pickHydrateSource) — học viên đang làm dở quan
  // trọng hơn kết quả đã nộp trước đó. retrying vẫn cần: chặn effect này
  // (và effect draft ở dưới) tự chạy lại ngay trong cùng phiên render sau
  // khi bấm "Làm lại" (dữ liệu attempt/draft trong bộ nhớ chưa đổi, chỉ
  // local state vừa bị xóa) — đây là cơ chế trong-phiên, độc lập với việc
  // pickHydrateSource quyết định nguồn nào lúc mount (xuyên-phiên).
  const hydrateSource = pickHydrateSource(draft !== null, attempt !== null);

  React.useEffect(() => {
    if (retrying || exercises.length === 0 || hydrateSource !== "attempt" || !attempt) return;

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
    });

    const parsed = parseAnswersIntoFormState(exercises, attempt.answers);
    setTextAnswerByExercise(parsed.textAnswers);
    setBlankAnswersByExercise(parsed.blankAnswers);
    setItemGroupsByExercise(parsed.itemGroups);
    setChoiceByExercise(parsed.choices);
    setSubmittedAnswerSnapshot(attempt.answers ?? {});
  }, [attempt, retrying, exercises, hydrateSource]);

  React.useEffect(() => {
    if (retrying || exercises.length === 0 || hydrateSource !== "draft" || !draft) return;

    const parsed = parseAnswersIntoFormState(exercises, draft.answers);
    setTextAnswerByExercise(parsed.textAnswers);
    setBlankAnswersByExercise(parsed.blankAnswers);
    setItemGroupsByExercise(parsed.itemGroups);
    setChoiceByExercise(parsed.choices);
  }, [draft, retrying, exercises, hydrateSource]);
```

Sau khi sửa, `emptyAnswer`/`parseAnswer`/`ParsedAnswer` có thể không còn
dùng trực tiếp trong file này nữa (chuyển hết vào `parseAnswersIntoFormState`)
— **kiểm tra bằng grep trước khi xóa import**, vì `getParsedAnswerFor`/
`getSubmittedTextFor` (không đổi trong task này) vẫn gọi `parseAnswer` và
dùng type `ParsedAnswer` trực tiếp. Chỉ xóa import nào thực sự không còn
điểm dùng nào trong file sau khi sửa.

- [ ] **Step 4: Thêm effect autosave debounce**

Ngay sau effect hydrate-từ-draft vừa thêm ở Step 3, thêm effect mới:

```tsx
  // Autosave debounce ~1s sau lần thay đổi đáp án gần nhất. Không autosave
  // khi đang hiện card kết quả (result !== null) — draft chỉ có ý nghĩa
  // lúc đang làm bài. hasAnyAnswer (trong saveDraft) tự chặn ghi khi mọi ô
  // còn trống, không cần kiểm tra lại ở đây.
  React.useEffect(() => {
    if (result !== null || exercises.length === 0) return;
    const timer = setTimeout(() => {
      saveDraft(collectAllAnswers());
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedTokensByExercise,
    textAnswerByExercise,
    itemGroupsByExercise,
    blankAnswersByExercise,
    choiceByExercise,
    result,
  ]);
```

Đặt effect này SAU khai báo `collectAllAnswers` (dòng khoảng 432 theo bản
đọc lúc viết plan) — nếu đặt trước, `collectAllAnswers` chưa được khai báo
sẽ lỗi runtime. Di chuyển effect xuống đúng vị trí sau `collectAllAnswers`
nếu thứ tự khai báo hiện tại trong file không cho phép đặt ngay sau Step 3.

- [ ] **Step 5: Thêm nút "Lưu" tường minh, hủy debounce khi bấm**

Tìm khối nút "Nộp bài" (dòng khoảng 794-799 theo bản đọc lúc viết plan):

```tsx
      <div className="flex justify-end">
        <Button variant="primary" disabled={!allAnswered || submitting} onClick={handleSubmit}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Nộp bài
        </Button>
      </div>
```

Đổi thành:

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
```

Nút "Lưu" gọi thẳng `saveDraft` — không cần tự hủy timer debounce đang chờ
riêng, vì `saveDraft` ghi đè đúng cùng 1 row (`upsert` theo
`(user_id, set_id)`), timer debounce bắn sau đó (nếu còn) chỉ ghi lại đúng
answers hiện tại, không gây sai lệch — chấp nhận 1 lần ghi thừa vô hại thay
vì thêm cơ chế hủy timer phức tạp hơn giá trị nó mang lại.

- [ ] **Step 6: Xóa draft sau khi nộp bài thành công**

Trong `handleSubmit` (dòng khoảng 435-459 theo bản đọc lúc viết plan), thêm
gọi `deleteDraft()` ngay sau khi xác nhận response thành công:

```tsx
    const res = data as GrammarResult;
    setResult(res);
    setSubmittedAnswerSnapshot(finalAnswers);
    deleteDraft();
    onSetFinished(res.lessonQuizScore, res.xpEarned);
```

- [ ] **Step 7: Sửa `awaitingHydration` và loading gate — thêm `draftLoading`, xét theo `hydrateSource`**

Tìm dòng:

```tsx
  const awaitingHydration = attempt !== null && !retrying && exercises.length > 0 && result === null;

  if (exercisesLoading || attemptLoading || awaitingHydration) {
```

Đổi thành:

```tsx
  // awaitingHydration chỉ áp dụng khi nguồn hydrate là "attempt" (effect đó
  // set result) — nguồn "draft" không bao giờ set result, nguồn "blank"
  // không cần chờ gì cả.
  const awaitingHydration =
    hydrateSource === "attempt" && !retrying && exercises.length > 0 && result === null;

  if (exercisesLoading || attemptLoading || draftLoading || awaitingHydration) {
```

- [ ] **Step 8: `npm run lint`**

Expected: sạch. Nếu còn cảnh báo `ParsedAnswer`/`emptyAnswer`/`parseAnswer`
unused, xóa đúng import thừa (xem lưu ý ở Step 3 — chỉ xóa cái thực sự
không còn dùng).

- [ ] **Step 9: Chạy toàn bộ test hiện có**

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts" tests/e2e/admin-classification-fields.playwright.test.ts`
Expected: PASS toàn bộ (bao gồm test mới Task 2, Task 3).

- [ ] **Step 10: Commit**

```bash
git add src/pages/GrammarExercisePage.tsx
git commit -m "feat(grammar): autosave draft đáp án, hydrate ưu tiên draft > attempt > trắng, nút Lưu tường minh"
```

---

## Task 6: Regenerate types + regression toàn cục

**Files:**
- Modify: `src/lib/database.types.ts` (qua lệnh, không sửa tay)

- [ ] **Step 1: Regenerate `database.types.ts`**

Gọi MCP `generate_typescript_types` với `project_id: "awdhqlgxnjwymwgxltlw"`,
ghi đè `src/lib/database.types.ts`.

- [ ] **Step 2: Regression toàn cục**

Run: `npm run lint`
Expected: sạch.

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts" tests/e2e/admin-classification-fields.playwright.test.ts`
Expected: PASS toàn bộ.

Run: `npm run build`
Expected: thành công.

- [ ] **Step 3: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "chore: regenerate database.types.ts sau migration exercise_set_drafts"
```

---

## Self-Review (đã chạy khi viết plan)

**Spec coverage:** data model (Task 1), quy tắc ưu tiên hiển thị dựa trên
sự tồn tại draft (Task 2 + Task 5 Step 3), autosave + nút Lưu (Task 5 Step
4-5), xóa draft sau nộp (Task 5 Step 6), chỉ Ngữ pháp (không đụng
`QuizPage`) — khớp đủ các phần đã duyệt trong spec.

**Placeholder scan:** không còn "TBD". Task 5 Step 3, 4 có ghi "đọc lại
đúng đoạn hiện tại trước khi sửa, số dòng có thể lệch nhẹ" — đây là chỉ dẫn
tường minh cho engineer xác nhận vị trí thật trước khi áp diff, không phải
thiếu sót — nội dung old/new string trong diff đã đầy đủ, chính xác theo
bản đọc lúc viết plan.

**Type consistency:** `SetDraft`, `useExerciseSetDraft` (Task 4) dùng đúng
tên xuyên Task 5. `ParsedFormState`/`parseAnswersIntoFormState` (Task 3)
dùng đúng tên ở cả 2 effect hydrate trong Task 5. `HydrateSource`/
`pickHydrateSource` (Task 2) dùng đúng tên ở Task 5 Step 3, 7.
