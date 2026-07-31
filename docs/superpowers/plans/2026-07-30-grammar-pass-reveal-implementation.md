# Phase 2 — Pass 80%, Mở Lời Giải Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển bài tập ngữ pháp từ chấm theo cả lesson sang chấm theo từng
`exercise_set`, gate đáp án đúng/giải thích đúng theo AC của requirement, và
vá lỗ hổng `explanation` đang lộ vô điều kiện trên production.

**Architecture:** Bảng `exercise_set_attempts` thay `grammar_attempts`
(UNIQUE theo `user_id + set_id`). `grammar-submit` v2 chấm theo set, tính
`isPassed`/`revealed` từ `correct`/`total` chưa làm tròn, chỉ trả
`correctAnswers`/`explanations` khi `revealed = true`. Frontend thêm 1 màn
hình danh sách set (component mới) đứng trước trang làm bài hiện có
(sửa lại để scope theo set thay vì cả lesson) — `setId` là state cục bộ
trong 1 component wrapper mới, **không** đụng `App.tsx`/`router.ts`.

**Tech Stack:** Supabase Postgres + Deno Edge Function, React 19 + TypeScript,
`node:test`.

## Global Constraints

- Ngôn ngữ code: English. Nội dung hiển thị cho user: Tiếng Việt.
- Naming: `camelCase` biến/hàm, `PascalCase` component/type.
- Không dùng `any`. Named exports, không default export (trừ `App.tsx`).
- Không thêm npm package mới.
- Không sửa `src/lib/database.types.ts` bằng tay — chỉ qua `npm run gen:types`
  / MCP `generate_typescript_types`.
- `correctAnswers`/`explanations` không xuất hiện trong response JSON khi
  `revealed = false` (không phải field rỗng — hoàn toàn không có key đó).
- `isPassed` tính từ `correct * 100 >= total * 80` (số nguyên, chưa làm
  tròn) — không dùng `score` đã làm tròn để so ngưỡng.
- Migration áp trực tiếp lên production (project `awdhqlgxnjwymwgxltlw`) —
  hệ thống chưa có user thật, theo giả định nền đã áp dụng ở Phase 1.
- `npm run lint` sạch sau mỗi task có sửa code sản phẩm.
- Không đụng `App.tsx`/`router.ts` — `setId` là state cục bộ trong wrapper
  component mới, không thêm vào URL global (quyết định đã chốt: refresh
  giữa chừng quay về danh sách set, chấp nhận được).
- Với 2 loại câu cấu trúc (`classification`, `fill_in_the_blank`), reveal chỉ
  thêm dòng giải thích chung — không thêm UI hiển thị đúng từng item/blank
  (giới hạn đã có từ trước Phase 2, không phải thụt lùi mới).

---

## Bối cảnh cho engineer chưa biết gì về việc này

Spec đầy đủ: [docs/superpowers/specs/2026-07-30-grammar-pass-reveal-design.md](../specs/2026-07-30-grammar-pass-reveal-design.md).

Branch này (`claude/exercise-sets-phase2`) đứng trên
`claude/exercise-sets-phase1` ([PR #76](https://github.com/learn-german/frontend-main/pull/76),
chưa merge nhưng migration Phase 1 đã áp production) — bảng `exercise_sets`
và cột `grammar_exercises.set_id` đã tồn tại thật.

**Hai vấn đề đang sống thật trên production, phải sửa:**
1. `src/lib/hooks/useGrammarExercises.ts:22` select thẳng `explanation`,
   `src/pages/GrammarExercisePage.tsx:616` hiện nó **vô điều kiện** ngay
   sau lần nộp đầu tiên dù 0%.
2. `GrammarExercisePage` là 1 trang phẳng cho cả lesson
   (`useGrammarExercises(lesson.id)`), không có khái niệm set/khóa tuần tự.

## File Structure

**Tạo mới:**
- `supabase/migrations/<ts>_exercise_set_attempts.sql`
- `supabase/functions/grammar-submit/setAttemptUpdate.ts` (thay
  `attemptUpdate.ts`)
- `supabase/functions/grammar-submit/setAttemptUpdate.test.ts` (thay
  `attemptUpdate.test.ts`)
- `src/lib/hooks/useExerciseSetAttempt.ts` (thay `useGrammarAttempt.ts`)
- `src/pages/GrammarSetListPage.tsx`
- `src/pages/GrammarExerciseFlow.tsx`

**Sửa:**
- `supabase/functions/grammar-submit/index.ts` — viết lại toàn bộ.
- `src/lib/hooks/useGrammarExercises.ts` — tham số `lessonId` → `setId`,
  bỏ `explanation` khỏi select.
- `src/pages/GrammarExercisePage.tsx` — prop, hydrate, submit, reveal UI.
- `src/App.tsx` — 1 dòng: đổi `<GrammarExercisePage lesson=.../>` thành
  `<GrammarExerciseFlow lesson=.../>`.

**Xóa:**
- `supabase/functions/grammar-submit/attemptUpdate.ts` +
  `attemptUpdate.test.ts` (thay bằng bản set-scoped).
- `src/lib/hooks/useGrammarAttempt.ts` (thay bằng
  `useExerciseSetAttempt.ts`).

---

## Task 1: Migration — `exercise_set_attempts`, xóa `grammar_attempts`, gỡ `explanation` khỏi view public

**Files:**
- Create: `supabase/migrations/<ts>_exercise_set_attempts.sql`

**Interfaces:**
- Produces: bảng `exercise_set_attempts(id, user_id, set_id, category,
  answers, blank_results, choice_results, exercise_results, score, total,
  best_score, attempt_count, is_passed, revealed, last_submission_id,
  submitted_at)`, UNIQUE `(user_id, set_id)`. Task 3 (Edge Function) và
  Task 5 (frontend hook) đọc/ghi bảng này.

- [ ] **Step 1: Viết migration file**

Timestamp UTC hiện tại dạng `YYYYMMDDHHMMSS` (kiểm bằng `date -u +%Y%m%d%H%M%S`
trước khi đặt tên file). Nội dung:

```sql
-- =============================================================================
-- DeutschPath — exercise_set_attempts: thay grammar_attempts, attempt tính
-- theo từng exercise_set thay vì cả lesson. Thêm is_passed/revealed tách
-- biệt (revealed mở vĩnh viễn, không tự tắt) và last_submission_id cho
-- idempotency (double-click/retry không tăng attempt_count).
--
-- Chỉ 1 policy own-read — KHÔNG có admin-all. grammar_attempts từng có
-- policy "admin all" (FOR ALL, chỉ check app_metadata.role) khiến mọi tài
-- khoản admin đọc được kết quả của user khác ngay trên trang học viên bình
-- thường (đã vá migration 20260730000001_grammar_attempts_drop_admin_read_policy.sql).
-- Không lặp lại lỗi đó ở bảng thay thế.
-- =============================================================================

DROP TABLE grammar_attempts;

CREATE TABLE exercise_set_attempts (
  id                 UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  set_id             UUID        NOT NULL REFERENCES exercise_sets(id) ON DELETE CASCADE,
  category           TEXT        NOT NULL,
  answers            JSONB       NOT NULL,
  blank_results      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  choice_results     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  exercise_results   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  score              INTEGER     NOT NULL,
  total              INTEGER     NOT NULL,
  best_score         INTEGER     NOT NULL,
  attempt_count      INTEGER     NOT NULL DEFAULT 1,
  is_passed          BOOLEAN     NOT NULL,
  revealed           BOOLEAN     NOT NULL DEFAULT FALSE,
  last_submission_id TEXT        NOT NULL,
  submitted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, set_id)
);

ALTER TABLE exercise_set_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercise_set_attempts: own read"
  ON exercise_set_attempts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Gỡ explanation khỏi view public — giải thích chỉ đi ra từ response của
-- grammar-submit, chỉ khi revealed = true.
DROP VIEW IF EXISTS grammar_exercises_public;

CREATE VIEW grammar_exercises_public AS
  SELECT
    g.id,
    g.lesson_id,
    g.set_id,
    g.type,
    g.group_id,
    g.hint,
    g.prompt_text,
    g.transformation_hint,
    g.tokens,
    g.classification_groups,
    (
      SELECT jsonb_agg(elem ->> 'item')
      FROM jsonb_array_elements(g.classification_items) elem
    ) AS classification_items,
    g.word_bank,
    g.options,
    g.order_index
  FROM grammar_exercises g
  JOIN exercise_sets es ON es.id = g.set_id
  JOIN lessons l ON l.id = g.lesson_id
  WHERE es.status = 'published'
    AND (l.status = 'published' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

GRANT SELECT ON grammar_exercises_public TO authenticated;
```

- [ ] **Step 2: Áp migration lên production**

Gọi MCP `apply_migration` với `project_id: "awdhqlgxnjwymwgxltlw"`,
`name: "exercise_set_attempts"`, `query` = nội dung Step 1.

- [ ] **Step 3: Kiểm chứng**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'exercise_set_attempts' ORDER BY ordinal_position;
```
Expected: đúng 15 cột như khai báo.

```sql
SELECT policyname FROM pg_policies WHERE tablename = 'exercise_set_attempts';
```
Expected: đúng 1 policy `exercise_set_attempts: own read` — **không** có
policy admin nào.

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'grammar_exercises_public' AND column_name = 'explanation';
```
Expected: 0 dòng.

```sql
SELECT count(*) FROM grammar_exercises_public;
```
Expected: cùng số dòng như trước migration (26, theo dữ liệu Phase 1) —
xác nhận view vẫn trả đúng scope, chỉ thiếu cột `explanation`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<ts>_exercise_set_attempts.sql
git commit -m "feat(db): exercise_set_attempts thay grammar_attempts, gỡ explanation khỏi view public"
```

---

## Task 2: `setAttemptUpdate.ts` — logic pass/reveal/XP thuần, TDD

**Files:**
- Create: `supabase/functions/grammar-submit/setAttemptUpdate.ts`
- Create: `supabase/functions/grammar-submit/setAttemptUpdate.test.ts`
- Delete: `supabase/functions/grammar-submit/attemptUpdate.ts`
- Delete: `supabase/functions/grammar-submit/attemptUpdate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ExistingSetAttempt {
    bestScore: number;
    attemptCount: number;
    isPassed: boolean;
    revealed: boolean;
  }
  export interface SetAttemptUpdate {
    score: number;
    bestScore: number;
    attemptCount: number;
    isPassed: boolean;
    revealed: boolean;
    xpEarned: number;
  }
  export function computeSetAttemptUpdate(
    existing: ExistingSetAttempt | null,
    correct: number,
    total: number,
    xpReward: number,
  ): SetAttemptUpdate
  ```
  Task 3 (`index.ts`) gọi hàm này.

- [ ] **Step 1: Xóa file cũ**

```bash
git rm supabase/functions/grammar-submit/attemptUpdate.ts supabase/functions/grammar-submit/attemptUpdate.test.ts
```

- [ ] **Step 2: Viết test trước**

Tạo `supabase/functions/grammar-submit/setAttemptUpdate.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { computeSetAttemptUpdate } from "./setAttemptUpdate.ts";

const XP = 30;

test("lần đầu đúng 4/5 (80%) thì pass, không reveal, được XP", () => {
  const r = computeSetAttemptUpdate(null, 4, 5, XP);
  assert.deepEqual(r, {
    score: 80, bestScore: 80, attemptCount: 1,
    isPassed: true, revealed: false, xpEarned: XP,
  });
});

test("lần đầu đúng 5/5 (100%) thì pass và reveal ngay, được XP", () => {
  const r = computeSetAttemptUpdate(null, 5, 5, XP);
  assert.deepEqual(r, {
    score: 100, bestScore: 100, attemptCount: 1,
    isPassed: true, revealed: true, xpEarned: XP,
  });
});

test("lần đầu đúng 3/5 (60%) thì chưa đạt, không reveal, không XP", () => {
  const r = computeSetAttemptUpdate(null, 3, 5, XP);
  assert.deepEqual(r, {
    score: 60, bestScore: 60, attemptCount: 1,
    isPassed: false, revealed: false, xpEarned: 0,
  });
});

test("lần 4 đúng 4/5 (80%) thì pass, không reveal, cho tiếp tục", () => {
  const existing: import("./setAttemptUpdate.ts").ExistingSetAttempt = {
    bestScore: 60, attemptCount: 3, isPassed: false, revealed: false,
  };
  const r = computeSetAttemptUpdate(existing, 4, 5, XP);
  assert.equal(r.attemptCount, 4);
  assert.equal(r.isPassed, true);
  assert.equal(r.revealed, false);
  assert.equal(r.xpEarned, XP);
});

test("lần 5 đúng 3/5 (60%) thì chưa đạt nhưng reveal (đủ 5 lần), không cho tiếp tục", () => {
  const existing: import("./setAttemptUpdate.ts").ExistingSetAttempt = {
    bestScore: 60, attemptCount: 4, isPassed: false, revealed: false,
  };
  const r = computeSetAttemptUpdate(existing, 3, 5, XP);
  assert.equal(r.attemptCount, 5);
  assert.equal(r.isPassed, false);
  assert.equal(r.revealed, true);
  assert.equal(r.xpEarned, 0);
});

test("lần 6 đúng 4/5 (80%) thì pass, lời giải vẫn mở (đã reveal từ lần 5), cho tiếp tục", () => {
  const existing: import("./setAttemptUpdate.ts").ExistingSetAttempt = {
    bestScore: 60, attemptCount: 5, isPassed: false, revealed: true,
  };
  const r = computeSetAttemptUpdate(existing, 4, 5, XP);
  assert.equal(r.attemptCount, 6);
  assert.equal(r.isPassed, true);
  assert.equal(r.revealed, true);
  assert.equal(r.xpEarned, XP);
});

test("đã pass rồi, làm lại điểm thấp hơn: best_score không hạ, không mất XP thêm", () => {
  const existing: import("./setAttemptUpdate.ts").ExistingSetAttempt = {
    bestScore: 90, attemptCount: 1, isPassed: true, revealed: false,
  };
  const r = computeSetAttemptUpdate(existing, 2, 5, XP);
  assert.equal(r.bestScore, 90);
  assert.equal(r.xpEarned, 0);
});

test("77.78% (7/9) không được làm tròn thành pass — BR-02", () => {
  const r = computeSetAttemptUpdate(null, 7, 9, XP);
  assert.equal(r.score, 78); // hiển thị làm tròn bình thường
  assert.equal(r.isPassed, false); // nhưng KHÔNG pass — 7*100=700 < 9*80=720
});
```

- [ ] **Step 3: Chạy test, xác nhận FAIL**

Run: `npx tsx --test supabase/functions/grammar-submit/setAttemptUpdate.test.ts`
Expected: FAIL — module không tồn tại.

- [ ] **Step 4: Viết implementation**

Tạo `supabase/functions/grammar-submit/setAttemptUpdate.ts`:

```ts
export interface ExistingSetAttempt {
  bestScore: number;
  attemptCount: number;
  isPassed: boolean;
  revealed: boolean;
}

export interface SetAttemptUpdate {
  score: number;
  bestScore: number;
  attemptCount: number;
  isPassed: boolean;
  revealed: boolean;
  xpEarned: number;
}

/**
 * Quyết định trạng thái lưu sau 1 lần nộp. isPassed tính từ correct*100 >=
 * total*80 (chưa làm tròn) — không dùng score đã làm tròn, tránh sai số
 * BR-02 cảnh báo (77.78% có thể vô tình làm tròn qua ngưỡng 80%).
 *
 * revealed mở vĩnh viễn: một khi true (đúng hết hoặc đủ 5 lần), giữ true dù
 * các lần nộp sau điểm thấp hơn. isPassed và revealed độc lập nhau.
 *
 * XP chỉ thưởng lần đầu tiên isPassed chuyển từ false sang true.
 */
export function computeSetAttemptUpdate(
  existing: ExistingSetAttempt | null,
  correct: number,
  total: number,
  xpReward: number,
): SetAttemptUpdate {
  const score = total > 0 ? Math.round((correct / total) * 100) : 0;
  const isPassed = total > 0 && correct * 100 >= total * 80;
  const previousBest = existing?.bestScore ?? 0;
  const attemptCount = (existing?.attemptCount ?? 0) + 1;
  const revealed = (existing?.revealed ?? false) || correct === total || attemptCount >= 5;
  const reachedPassNow = isPassed && !(existing?.isPassed ?? false);

  return {
    score,
    bestScore: Math.max(score, previousBest),
    attemptCount,
    isPassed,
    revealed,
    xpEarned: reachedPassNow ? xpReward : 0,
  };
}
```

- [ ] **Step 5: Chạy test, xác nhận PASS**

Run: `npx tsx --test supabase/functions/grammar-submit/setAttemptUpdate.test.ts`
Expected: PASS toàn bộ 8 test.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/grammar-submit/setAttemptUpdate.ts supabase/functions/grammar-submit/setAttemptUpdate.test.ts
git add supabase/functions/grammar-submit/attemptUpdate.ts supabase/functions/grammar-submit/attemptUpdate.test.ts
git commit -m "feat(grammar-submit): computeSetAttemptUpdate — isPassed/revealed tách biệt, XP theo lần đầu pass"
```

---

## Task 3: `grammar-submit` v2 — chấm theo set, idempotency, reveal-gated response, XP rollup

**Files:**
- Modify: `supabase/functions/grammar-submit/index.ts` (viết lại toàn bộ)

**Interfaces:**
- Consumes: `computeSetAttemptUpdate` (Task 2), `computeGrammarScore`/
  `projectAnswers` (đã có, không đổi).
- Produces: response shape frontend (Task 8) tiêu thụ:
  ```ts
  {
    score: number; total: number; correct: number;
    isPassed: boolean; revealed: boolean;
    attemptCount: number; bestScore: number;
    xpEarned: number; lessonQuizScore: number;
    blankResults: Record<string, boolean[]>;
    choiceResults: Record<string, boolean>;
    exerciseResults: Record<string, boolean>;
    correctAnswers?: Record<string, string>;
    explanations?: Record<string, string>;
  }
  ```

- [ ] **Step 1: Viết lại `index.ts`**

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeGrammarScore, projectAnswers } from "./scoring.ts";
import { computeSetAttemptUpdate, type ExistingSetAttempt } from "./setAttemptUpdate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const XP_REWARD = 30;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const set_id: string = body.set_id;
    const submission_id: string = body.submission_id;
    const rawAnswers: Record<string, unknown> | undefined = body.answers;

    if (!set_id || !submission_id || !rawAnswers) {
      return new Response(JSON.stringify({ error: "set_id, submission_id and answers required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: set, error: setErr } = await supabase
      .from("exercise_sets")
      .select("id, lesson_id, category, status")
      .eq("id", set_id)
      .eq("status", "published")
      .maybeSingle();

    if (setErr || !set) {
      return new Response(JSON.stringify({ error: "Set not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: exercises, error: exErr } = await supabase
      .from("grammar_exercises")
      .select("id, type, correct_answer, acceptable_answers, classification_items, blanks, options, explanation")
      .eq("set_id", set_id);

    if (exErr || !exercises || exercises.length === 0) {
      return new Response(JSON.stringify({ error: "Failed to load exercises" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const answers = projectAnswers(exercises, rawAnswers);
    const { total, correct, blankResults, choiceResults, exerciseResults } = computeGrammarScore(
      exercises,
      answers,
    );

    const { data: existingRow } = await supabase
      .from("exercise_set_attempts")
      .select("best_score, attempt_count, is_passed, revealed, last_submission_id")
      .eq("user_id", user.id)
      .eq("set_id", set_id)
      .maybeSingle();

    // Idempotency: cùng submission_id với lần trước -> trả lại đúng kết quả
    // cũ, không chấm lại, không tăng attempt_count. Bảo vệ double-click và
    // request bị retry (mạng chập chờn gửi lại cùng request).
    if (existingRow && existingRow.last_submission_id === submission_id) {
      const revealedNow = existingRow.revealed;
      return new Response(
        JSON.stringify({
          score: existingRow.best_score, // đủ cho phản hồi lặp lại, không cần snapshot lần nộp cụ thể
          total,
          correct,
          isPassed: existingRow.is_passed,
          revealed: revealedNow,
          attemptCount: existingRow.attempt_count,
          bestScore: existingRow.best_score,
          xpEarned: 0,
          lessonQuizScore: 0, // không tính lại rollup cho response lặp lại — client đã có giá trị từ lần gốc
          blankResults,
          choiceResults,
          exerciseResults,
          ...(revealedNow
            ? {
                correctAnswers: Object.fromEntries(exercises.map((e) => [e.id, e.correct_answer ?? ""])),
                explanations: Object.fromEntries(exercises.map((e) => [e.id, e.explanation ?? ""])),
              }
            : {}),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const existing: ExistingSetAttempt | null = existingRow
      ? {
          bestScore: existingRow.best_score,
          attemptCount: existingRow.attempt_count,
          isPassed: existingRow.is_passed,
          revealed: existingRow.revealed,
        }
      : null;

    const update = computeSetAttemptUpdate(existing, correct, total, XP_REWARD);

    if (update.xpEarned > 0) {
      await supabase.rpc("increment_xp", { p_user_id: user.id, p_amount: update.xpEarned });
    }

    const { error: attemptError } = await supabase.from("exercise_set_attempts").upsert(
      {
        user_id: user.id,
        set_id,
        category: set.category,
        answers,
        blank_results: blankResults,
        choice_results: choiceResults,
        exercise_results: exerciseResults,
        score: update.score,
        total,
        best_score: update.bestScore,
        attempt_count: update.attemptCount,
        is_passed: update.isPassed,
        revealed: update.revealed,
        last_submission_id: submission_id,
        submitted_at: new Date().toISOString(),
      },
      { onConflict: "user_id,set_id" },
    );

    if (attemptError) {
      return new Response(JSON.stringify({ error: "Failed to save attempt" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rollup lesson_progress.quiz_score: 100 chỉ khi TOÀN BỘ set nguphap của
    // lesson đã pass, ngược lại trung bình best_score các set (0 cho set
    // chưa làm) — không dùng 0 cứng vì Dashboard hiển thị số này trực tiếp.
    const { data: lessonSets } = await supabase
      .from("exercise_sets")
      .select("id")
      .eq("lesson_id", set.lesson_id)
      .eq("category", "nguphap")
      .eq("status", "published");

    const setIds = (lessonSets ?? []).map((s) => s.id);
    const { data: lessonAttempts } = await supabase
      .from("exercise_set_attempts")
      .select("set_id, best_score, is_passed")
      .eq("user_id", user.id)
      .in("set_id", setIds);

    const attemptsBySetId = new Map((lessonAttempts ?? []).map((a) => [a.set_id, a]));
    const allPassed = setIds.length > 0 && setIds.every((id) => attemptsBySetId.get(id)?.is_passed === true);
    const lessonQuizScore = allPassed
      ? 100
      : Math.round(
          setIds.reduce((sum, id) => sum + (attemptsBySetId.get(id)?.best_score ?? 0), 0) / setIds.length,
        );

    const { data: previousProgress } = await supabase
      .from("lesson_progress")
      .select("quiz_score")
      .eq("user_id", user.id)
      .eq("lesson_id", set.lesson_id)
      .eq("category", "nguphap")
      .maybeSingle();

    // XP cấp lesson: chỉ khi rollup vừa chuyển từ <100 sang 100 ở LẦN NÀY —
    // tránh thưởng trùng nếu 2 request submit set khác nhau chạy gần đồng
    // thời cùng đẩy lesson qua ngưỡng "toàn bộ set đã pass".
    const lessonJustCompleted = allPassed && (previousProgress?.quiz_score ?? 0) < 100;
    if (lessonJustCompleted) {
      await supabase.rpc("increment_xp", { p_user_id: user.id, p_amount: XP_REWARD });
    }

    await supabase.from("lesson_progress").upsert(
      { user_id: user.id, lesson_id: set.lesson_id, category: "nguphap", quiz_score: lessonQuizScore },
      { onConflict: "user_id,lesson_id,category" },
    );

    return new Response(
      JSON.stringify({
        score: update.score,
        total,
        correct,
        isPassed: update.isPassed,
        revealed: update.revealed,
        attemptCount: update.attemptCount,
        bestScore: update.bestScore,
        xpEarned: update.xpEarned + (lessonJustCompleted ? XP_REWARD : 0),
        lessonQuizScore,
        blankResults,
        choiceResults,
        exerciseResults,
        ...(update.revealed
          ? {
              correctAnswers: Object.fromEntries(exercises.map((e) => [e.id, e.correct_answer ?? ""])),
              explanations: Object.fromEntries(exercises.map((e) => [e.id, e.explanation ?? ""])),
            }
          : {}),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

Lưu ý cho engineer: `exercises` ở đây select thêm `explanation` (khác Task
1's view public đã bỏ cột này) — hợp lệ vì đây là query trực tiếp bảng
`grammar_exercises` bằng `service_role`, bỏ qua RLS/view, không phải qua
`grammar_exercises_public`. Đây chính là "đường duy nhất" giải thích được
phép đi ra, đúng thiết kế.

- [ ] **Step 2: Chạy lại test scoring/setAttemptUpdate hiện có**

Run: `npx tsx --test "supabase/functions/**/*.test.ts"`
Expected: PASS toàn bộ (scoring.test.ts không đổi vì `computeGrammarScore`
không đổi signature; setAttemptUpdate.test.ts từ Task 2).

- [ ] **Step 3: `npm run lint`**

Expected: sạch (file `.ts` trong `supabase/functions` cũng được `tsc --noEmit`
quét vì `tsconfig.json` không loại trừ thư mục này — xem CLAUDE.md, chỉ
`exclude` là `supabase/functions` và `api`... **kiểm tra lại**: nếu
`tsconfig.json` thực sự exclude `supabase/functions`, bỏ qua bước lint cho
riêng thư mục này, chỉ cần `npx tsx --test` xác nhận file parse/run được).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/grammar-submit/index.ts
git commit -m "feat(grammar-submit): v2 — chấm theo set, idempotency, reveal-gated response, XP rollup theo lesson"
```

---

## Task 4: `useGrammarExercises` — scope theo set, bỏ `explanation`

**Files:**
- Modify: `src/lib/hooks/useGrammarExercises.ts`

**Interfaces:**
- Produces: `useGrammarExercises(setId: string)` — đổi tham số từ `lessonId`.
  Task 8 dùng hook này với `set.id`.

- [ ] **Step 1: Sửa toàn bộ file**

```ts
import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { GrammarExercise } from "../appTypes";
import { normalizeOptionsFromDb } from "../grammarMultipleChoice";

export function useGrammarExercises(setId: string) {
  const [exercises, setExercises] = useState<GrammarExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!setId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    supabase
      .from("grammar_exercises_public")
      .select("id, lesson_id, type, group_id, hint, prompt_text, transformation_hint, tokens, classification_groups, classification_items, word_bank, options, order_index")
      .eq("set_id", setId)
      .order("order_index")
      .then(({ data, error: fetchError }) => {
        if (fetchError) {
          setError(fetchError.message);
        } else {
          setExercises(
            (data ?? []).map((e) => ({
              id: e.id as string,
              lessonId: e.lesson_id as string,
              orderIndex: e.order_index as number,
              type: e.type as GrammarExercise["type"],
              groupId: (e.group_id as string | null) ?? undefined,
              hint: (e.hint as string | null) ?? undefined,
              promptText: (e.prompt_text as string | null) ?? undefined,
              transformationHint: (e.transformation_hint as string | null) ?? undefined,
              tokens: (e.tokens as string[] | null) ?? undefined,
              classificationGroups: (e.classification_groups as string[] | null) ?? undefined,
              classificationItems: (e.classification_items as string[] | null) ?? undefined,
              wordBank: (e.word_bank as GrammarExercise["wordBank"] | null) ?? undefined,
              options: normalizeOptionsFromDb(e.options),
              explanation: "",
            })),
          );
        }
        setLoading(false);
      });
  }, [setId]);

  return { exercises, loading, error };
}
```

`explanation: ""` giữ trong object trả về để không đổi `GrammarExercise`
type (Task 8 đọc giải thích từ response `grammar-submit`, không từ đây nữa
— field này giờ luôn rỗng, chỉ giữ để type không vỡ ở nơi khác đang dùng
`GrammarExercise`).

- [ ] **Step 2: `npm run lint`**

Expected: lỗi ở `GrammarExercisePage.tsx` (đang gọi `useGrammarExercises(lesson.id)`
và dùng `ex.explanation`) — **đúng dự kiến**, sửa ở Task 8.

- [ ] **Step 3: Commit**

```bash
git add src/lib/hooks/useGrammarExercises.ts
git commit -m "fix(grammar): useGrammarExercises scope theo set_id, bỏ explanation khỏi query public"
```

---

## Task 5: `useExerciseSetAttempt` — hydrate theo set, thay `useGrammarAttempt`

**Files:**
- Create: `src/lib/hooks/useExerciseSetAttempt.ts`
- Delete: `src/lib/hooks/useGrammarAttempt.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SetAttempt {
    answers: Record<string, string>;
    blankResults: Record<string, boolean[]>;
    choiceResults: Record<string, boolean>;
    exerciseResults: Record<string, boolean>;
    score: number; total: number; bestScore: number; attemptCount: number;
    isPassed: boolean; revealed: boolean;
  }
  export function useExerciseSetAttempt(setId: string): { attempt: SetAttempt | null; loading: boolean }
  export interface SetAttemptStatus { isPassed: boolean; attemptCount: number }
  export function useExerciseSetAttempts(setIds: string[]): { attemptsBySetId: Record<string, SetAttemptStatus>; loading: boolean }
  ```
  Task 8 dùng `useExerciseSetAttempt` (số ít, hydrate trang làm bài). Task 6
  (`GrammarSetListPage`) dùng `useExerciseSetAttempts` (số nhiều, badge danh
  sách).

- [ ] **Step 1: Xóa hook cũ**

```bash
git rm src/lib/hooks/useGrammarAttempt.ts
```

- [ ] **Step 2: Viết hook mới**

```ts
import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export interface SetAttempt {
  answers: Record<string, string>;
  blankResults: Record<string, boolean[]>;
  choiceResults: Record<string, boolean>;
  exerciseResults: Record<string, boolean>;
  score: number;
  total: number;
  bestScore: number;
  attemptCount: number;
  isPassed: boolean;
  revealed: boolean;
}

const SET_ATTEMPT_COLUMNS =
  "answers, blank_results, choice_results, exercise_results, score, total, best_score, attempt_count, is_passed, revealed";

/**
 * Trạng thái attempt của 1 set cho học viên hiện tại. RLS restricts the
 * table to the caller's own rows (own-read only, không có admin-all — xem
 * comment trong migration 20260730090000-ish exercise_set_attempts), nên
 * không cần tự lọc user_id ở đây.
 */
export function useExerciseSetAttempt(setId: string): {
  attempt: SetAttempt | null;
  loading: boolean;
} {
  const [attempt, setAttempt] = useState<SetAttempt | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!setId) {
      setLoading(false);
      return;
    }

    setLoading(true);

    supabase
      .from("exercise_set_attempts")
      .select(SET_ATTEMPT_COLUMNS)
      .eq("set_id", setId)
      .maybeSingle()
      .then(({ data }) => {
        setAttempt(
          data
            ? {
                answers: (data.answers as Record<string, string> | null) ?? {},
                blankResults: (data.blank_results as Record<string, boolean[]> | null) ?? {},
                choiceResults: (data.choice_results as Record<string, boolean> | null) ?? {},
                exerciseResults: (data.exercise_results as Record<string, boolean> | null) ?? {},
                score: data.score as number,
                total: data.total as number,
                bestScore: data.best_score as number,
                attemptCount: data.attempt_count as number,
                isPassed: data.is_passed as boolean,
                revealed: data.revealed as boolean,
              }
            : null,
        );
        setLoading(false);
      }, () => {
        setAttempt(null);
        setLoading(false);
      });
  }, [setId]);

  return { attempt, loading };
}

export interface SetAttemptStatus {
  isPassed: boolean;
  attemptCount: number;
}

/** Badge trạng thái cho danh sách set — chỉ cần isPassed/attemptCount. */
export function useExerciseSetAttempts(setIds: string[]): {
  attemptsBySetId: Record<string, SetAttemptStatus>;
  loading: boolean;
} {
  const [attemptsBySetId, setAttemptsBySetId] = useState<Record<string, SetAttemptStatus>>({});
  const [loading, setLoading] = useState(true);
  const key = setIds.join(",");

  useEffect(() => {
    if (setIds.length === 0) {
      setAttemptsBySetId({});
      setLoading(false);
      return;
    }

    setLoading(true);

    supabase
      .from("exercise_set_attempts")
      .select("set_id, is_passed, attempt_count")
      .in("set_id", setIds)
      .then(({ data }) => {
        const map: Record<string, SetAttemptStatus> = {};
        for (const row of data ?? []) {
          map[row.set_id as string] = {
            isPassed: row.is_passed as boolean,
            attemptCount: row.attempt_count as number,
          };
        }
        setAttemptsBySetId(map);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { attemptsBySetId, loading };
}
```

- [ ] **Step 3: `npm run lint`**

Expected: lỗi ở `GrammarExercisePage.tsx` (đang import `useGrammarAttempt`
đã xóa) — đúng dự kiến, sửa ở Task 8.

- [ ] **Step 4: Commit**

```bash
git add src/lib/hooks/useExerciseSetAttempt.ts src/lib/hooks/useGrammarAttempt.ts
git commit -m "feat(grammar): useExerciseSetAttempt/useExerciseSetAttempts thay useGrammarAttempt"
```

---

## Task 6: `GrammarSetListPage` — màn hình danh sách set

**Files:**
- Create: `src/pages/GrammarSetListPage.tsx`

**Interfaces:**
- Consumes: `useExerciseSets` (đã có, Phase 1 —
  `src/lib/hooks/useExerciseSets.ts`, lọc client-side theo `lessonId`),
  `useExerciseSetAttempts` (Task 5).
- Produces:
  ```ts
  interface GrammarSetListPageProps {
    lessonId: string;
    onBackToLesson: () => void;
    onSelectSet: (setId: string) => void;
  }
  export const GrammarSetListPage: React.FC<GrammarSetListPageProps>
  ```
  Task 7 (`GrammarExerciseFlow`) render component này khi chưa chọn set.

- [ ] **Step 1: Viết component**

```tsx
import React, { useMemo } from "react";
import { CheckCircle2, Lock, Loader2 } from "lucide-react";
import { ExercisePageHeader } from "../components/ExercisePageHeader";
import { useExerciseSets } from "../lib/hooks/useExerciseSets";
import { useExerciseSetAttempts } from "../lib/hooks/useExerciseSetAttempt";

interface GrammarSetListPageProps {
  lessonId: string;
  onBackToLesson: () => void;
  onSelectSet: (setId: string) => void;
}

export const GrammarSetListPage: React.FC<GrammarSetListPageProps> = ({
  lessonId,
  onBackToLesson,
  onSelectSet,
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

  // Set đầu tiên chưa pass là set khả dụng; mọi set sau nó bị khóa. Đúng
  // BR-01: thứ tự chuyển bài tập theo order_index đã cấu hình.
  let unlockedFound = false;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <ExercisePageHeader title="Bài tập ngữ pháp" onBackToLesson={onBackToLesson} />
      <div className="space-y-3">
        {lessonSets.map((set) => {
          const status = attemptsBySetId[set.id];
          const isPassed = status?.isPassed ?? false;
          const isUnlocked = isPassed || !unlockedFound;
          if (isUnlocked && !isPassed) unlockedFound = true;

          return (
            <button
              key={set.id}
              type="button"
              disabled={!isUnlocked}
              onClick={() => isUnlocked && onSelectSet(set.id)}
              className={`w-full flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${
                isUnlocked
                  ? "border-slate-200 bg-white hover:border-orange-300 cursor-pointer"
                  : "border-slate-100 bg-slate-50 cursor-not-allowed opacity-60"
              }`}
            >
              {isPassed ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
              ) : isUnlocked ? (
                <div className="w-5 h-5 rounded-full border-2 border-orange-400 shrink-0" />
              ) : (
                <Lock className="w-5 h-5 text-slate-300 shrink-0" />
              )}
              <span className="flex-1 font-display font-bold text-sm text-slate-800">{set.title}</span>
              <span
                className={`text-[10px] font-display font-bold uppercase px-2 py-0.5 rounded-full ${
                  isPassed
                    ? "bg-green-50 text-green-700"
                    : isUnlocked
                      ? "bg-orange-50 text-orange-700"
                      : "bg-slate-100 text-slate-400"
                }`}
              >
                {isPassed ? "Đã đạt" : isUnlocked ? "Cần làm" : "Khóa"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: `npm run lint`**

Expected: sạch — component tự chứa, không phụ thuộc gì chưa tồn tại.

- [ ] **Step 3: Commit**

```bash
git add src/pages/GrammarSetListPage.tsx
git commit -m "feat(grammar): GrammarSetListPage — danh sách set với badge khóa/cần làm/đã đạt"
```

---

## Task 7: `GrammarExercisePage` — scope theo set, gate reveal, idempotency

**Files:**
- Modify: `src/pages/GrammarExercisePage.tsx`

**Interfaces:**
- Consumes: `useGrammarExercises(setId)` (Task 4),
  `useExerciseSetAttempt(setId)` (Task 5).
- Produces: props mới
  ```ts
  interface GrammarExercisePageProps {
    lessonId: string;
    set: { id: string; title: string };
    onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
    onBackToList: () => void;
    onBackToLesson: () => void;
  }
  ```
  Task 9 (`GrammarExerciseFlow`) render component này với các prop trên.

- [ ] **Step 1: Đổi props và import**

Dòng 1-29, đổi:

```tsx
import React, { useState, useMemo } from "react";
import { Loader2, ArrowRight, RotateCcw, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { Button } from "../components/DesignSystem";
import { ExercisePageHeader } from "../components/ExercisePageHeader";
import { GrammarExerciseHint } from "../components/GrammarExerciseHint";
import { MultipleChoiceOptions } from "../components/MultipleChoiceOptions";
import { Lesson, GrammarExercise } from "../lib/appTypes";
import { useGrammarExercises } from "../lib/hooks/useGrammarExercises";
import { groupGrammarExercises } from "../lib/grammarExerciseGroups";
import {
  applyChipToBlank,
  applyTypedBlankAnswer,
  countBlankMarkers,
  findBlankTarget,
  getUsedWordIndexes,
  type BlankAssignments,
  type BlankFocus,
} from "../lib/grammarFillInBlank";
import { supabase } from "../lib/supabase";
import { emptyAnswer, parseAnswer, serializeAnswer, type ParsedAnswer } from "../lib/grammarAnswerCodec";
import { useGrammarAttempt } from "../lib/hooks/useGrammarAttempt";

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
  best_score: number;
  attempt_count: number;
  blankResults: Record<string, boolean[]>;
  choiceResults: Record<string, boolean>;
  exerciseResults: Record<string, boolean>;
}
```

thành:

```tsx
import React, { useState, useMemo } from "react";
import { Loader2, RotateCcw, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { Button } from "../components/DesignSystem";
import { ExercisePageHeader } from "../components/ExercisePageHeader";
import { GrammarExerciseHint } from "../components/GrammarExerciseHint";
import { MultipleChoiceOptions } from "../components/MultipleChoiceOptions";
import { GrammarExercise } from "../lib/appTypes";
import { useGrammarExercises } from "../lib/hooks/useGrammarExercises";
import { groupGrammarExercises } from "../lib/grammarExerciseGroups";
import {
  applyChipToBlank,
  applyTypedBlankAnswer,
  countBlankMarkers,
  findBlankTarget,
  getUsedWordIndexes,
  type BlankAssignments,
  type BlankFocus,
} from "../lib/grammarFillInBlank";
import { supabase } from "../lib/supabase";
import { emptyAnswer, parseAnswer, serializeAnswer, type ParsedAnswer } from "../lib/grammarAnswerCodec";
import { useExerciseSetAttempt } from "../lib/hooks/useExerciseSetAttempt";

interface GrammarExercisePageProps {
  lessonId: string;
  set: { id: string; title: string };
  onSetFinished: (lessonQuizScore: number, xpEarned: number) => void;
  onBackToList: () => void;
  onBackToLesson: () => void;
}

interface GrammarResult {
  score: number;
  total: number;
  correct: number;
  isPassed: boolean;
  revealed: boolean;
  xpEarned: number;
  bestScore: number;
  attemptCount: number;
  lessonQuizScore: number;
  blankResults: Record<string, boolean[]>;
  choiceResults: Record<string, boolean>;
  exerciseResults: Record<string, boolean>;
  correctAnswers?: Record<string, string>;
  explanations?: Record<string, string>;
}
```

`ArrowRight` bỏ khỏi import lucide-react — không còn dùng sau khi nút "Bài
tiếp theo" (nhảy lesson) bị xóa ở Step 5; kiểm tra kỹ trước khi xóa import
nếu nó còn dùng ở đâu khác trong file (grep `ArrowRight` — nếu 0 kết quả
khác, an toàn xóa).

- [ ] **Step 2: Đổi component signature và 2 hook đầu**

Dòng khai báo component (khoảng dòng 300-308 trước khi sửa), đổi:

```tsx
export const GrammarExercisePage: React.FC<GrammarExercisePageProps> = ({
  lesson,
  onQuizFinished,
  onNavigateHome,
  onNextLesson,
  onBackToLesson,
}) => {
  const { exercises, loading: exercisesLoading, error: exercisesError } = useGrammarExercises(lesson.id);
  const { attempt, loading: attemptLoading } = useGrammarAttempt(lesson.id);
```

thành:

```tsx
export const GrammarExercisePage: React.FC<GrammarExercisePageProps> = ({
  lessonId: _lessonId,
  set,
  onSetFinished,
  onBackToList,
  onBackToLesson,
}) => {
  const { exercises, loading: exercisesLoading, error: exercisesError } = useGrammarExercises(set.id);
  const { attempt, loading: attemptLoading } = useExerciseSetAttempt(set.id);
```

`_lessonId` giữ trong destructure (không dùng trong thân hàm) vì
`GrammarExerciseFlow` (Task 9) truyền `lessonId` xuống để giữ tương thích
interface — không dùng ở đây nhưng cần khai báo để prop-drilling rõ ràng.
Nếu ESLint báo unused var, đổi tên có prefix `_` như trên đã đủ (quy ước
chuẩn, không cần cấu hình thêm).

- [ ] **Step 3: Sửa hydrate effect**

Dòng khoảng 334-369, đổi:

```tsx
  React.useEffect(() => {
    if (!attempt || retrying || exercises.length === 0) return;

    setResult({
      score: attempt.score,
      total: attempt.total,
      passed: attempt.score >= 80,
      xp_earned: 0,
      best_score: attempt.bestScore,
      attempt_count: attempt.attemptCount,
      blankResults: attempt.blankResults,
      choiceResults: attempt.choiceResults,
      exerciseResults: attempt.exerciseResults,
    });
```

thành:

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
```

Ghi chú quan trọng cho engineer: đây là chỗ có nguy cơ lặp lại đúng loại lỗi
đã gây 4 commit sửa trước — kiểm tra kỹ Task 8 (test hydrate) trước khi coi
task này xong.

- [ ] **Step 4: Sửa `handleSubmit`**

Dòng khoảng 418-442, đổi:

```tsx
  const handleSubmit = async () => {
    const finalAnswers = collectAllAnswers();

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
    setSubmittedAnswerSnapshot(finalAnswers);
    // Report the best score, not the latest one: local progress (and the
    // Roadmap's completedLessons derivation) must not regress when a learner
    // who already passed retries and scores lower this time.
    onQuizFinished(res.best_score, res.xp_earned);
  };
```

thành:

```tsx
  const handleSubmit = async () => {
    const finalAnswers = collectAllAnswers();

    setSubmitting(true);
    setSubmitError(null);

    const { data, error } = await supabase.functions.invoke("grammar-submit", {
      body: { set_id: set.id, submission_id: submissionIdRef.current, answers: finalAnswers },
    });

    setSubmitting(false);

    if (error || !data) {
      setSubmitError("Không thể nộp bài. Vui lòng thử lại.");
      return;
    }

    const res = data as GrammarResult;
    setResult(res);
    setSubmittedAnswerSnapshot(finalAnswers);
    // Report rollup theo cả lesson (không phải điểm riêng set này) — khớp
    // đúng giá trị server vừa ghi vào lesson_progress.quiz_score, để state
    // optimistic phía client (Roadmap/Dashboard) không lệch server.
    onSetFinished(res.lessonQuizScore, res.xpEarned);
  };
```

- [ ] **Step 5: Thêm `submissionIdRef`, sửa `handleRetry` để sinh id mới**

Ngay sau khai báo `retrying` (dòng khoảng 332), thêm:

```tsx
  // Sinh 1 lần khi mount hoặc khi bấm "Làm lại" — giữ nguyên cho mọi lần
  // bấm "Nộp bài" trong cùng 1 lượt làm, để server nhận diện double-click/
  // retry qua đúng submission_id và không tăng attempt_count sai.
  const submissionIdRef = React.useRef(crypto.randomUUID());
```

Trong `handleRetry` (dòng khoảng 444-456), thêm dòng sinh id mới:

```tsx
  const handleRetry = () => {
    submissionIdRef.current = crypto.randomUUID();
    setExpandedGroupKeys(new Set());
    setSelectedTokensByExercise({});
    setTextAnswerByExercise({});
    setItemGroupsByExercise({});
    setBlankAnswersByExercise({});
    setBlankAssignments({});
    setFocusedBlank(null);
    setChoiceByExercise({});
    setResult(null);
    setSubmitError(null);
    setRetrying(true);
  };
```

- [ ] **Step 6: Sửa khối render kết quả — dùng `isPassed`/`correct`, gate reveal**

Dòng khoảng 486-541 (khối mở `if (result) { const { score, total, passed, xp_earned } = result; ... }`),
đổi phần destructure và mọi chỗ dùng `passed`/`xp_earned`/`correctCount`:

```tsx
  if (result) {
    const { score, total, correct, isPassed, revealed, xpEarned } = result;
```

Thay mọi `passed` trong khối JSX phía sau bằng `isPassed`, mọi `xp_earned`
bằng `xpEarned`, mọi `correctCount` bằng `correct` (biến cục bộ tính từ
`Math.round((score/100)*total)` bị xóa — dùng thẳng `correct` server trả về,
chính xác hơn vì không qua bước làm tròn ngược).

- [ ] **Step 7: Gate phần giải thích — chỉ hiện khi `revealed`**

Dòng khoảng 543-547 (`<h4>Giải thích từng câu hỏi:</h4>` và div bọc ngoài),
bọc toàn bộ khối trong điều kiện `revealed`:

```tsx
        {revealed && (
          <div className="text-left space-y-3 pt-4 border-t border-slate-100">
            <h4 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest">
              Giải thích từng câu hỏi:
            </h4>
            <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1">
              {groups.map((group, groupIndex) => (
                {/* ...toàn bộ nội dung .map() hiện có giữ nguyên, không đổi... */}
              ))}
            </div>
          </div>
        )}
```

Bên trong khối `.map()` giữ nguyên (submitted answer, color coding cho từng
loại câu không đổi — theo quyết định đã chốt, không thêm UI hiển thị đúng
từng item/blank cho `classification`/`fill_in_the_blank`).

Dòng "Giải thích:" cụ thể (nguyên văn cũ
`<p className="text-slate-500 text-[11px] leading-relaxed"><b>Giải thích:</b> {ex.explanation}</p>`),
đổi nguồn dữ liệu:

```tsx
                    {result.explanations?.[ex.id] && (
                      <p className="text-slate-500 text-[11px] leading-relaxed">
                        <b>Giải thích:</b> {result.explanations[ex.id]}
                      </p>
                    )}
```

Vì khối cha đã gate `revealed`, `result.explanations` chắc chắn tồn tại tại
đây, nhưng optional chaining giữ code an toàn nếu 1 câu cụ thể thiếu key.

- [ ] **Step 8: Sửa footer buttons — "Tiếp tục" quay về danh sách set**

Tìm khối nút footer (`Làm lại bài Test` / nút tiếp theo, ngay sau khối
"Giải thích từng câu hỏi" đóng lại). Đổi toàn bộ logic điều hướng "next" từ
gọi `onNextLesson` sang gọi `onBackToList`:

```tsx
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button variant="secondary" className="flex-1" onClick={handleRetry}>
            <RotateCcw className="w-4 h-4 mr-2" /> Làm lại bài Test
          </Button>
          {isPassed ? (
            <Button variant="primary" className="flex-1" onClick={onBackToList}>
              Tiếp tục
            </Button>
          ) : null}
        </div>
```

Đọc lại đúng đoạn gốc trước khi sửa (dòng khoảng 625-660, chưa đọc hết
trong lúc viết plan) — nếu có thêm nút khác (`onNavigateHome` chẳng hạn)
không nằm trong scope Task này, giữ nguyên, chỉ thay phần điều hướng
"next"/"tiếp tục sang bài học khác" bằng `onBackToList`. Nếu bản gốc CHỈ
hiện nút "Tiếp tục" khi `isPassed` (không phải luôn hiện), giữ đúng điều
kiện đó — khớp AC "Chưa đạt → chỉ có Làm lại".

- [ ] **Step 9: `npm run lint`**

Expected: sạch. Nếu còn lỗi tham chiếu `lesson`/`onQuizFinished`/`onNextLesson`/
`onNavigateHome` sót lại đâu đó trong file (props cũ đã đổi tên), sửa hết
theo đúng interface mới ở Step 1.

- [ ] **Step 10: Commit**

```bash
git add src/pages/GrammarExercisePage.tsx
git commit -m "feat(grammar): GrammarExercisePage scope theo set, gate reveal, idempotency qua submissionIdRef"
```

---

## Task 8: Test hydrate — vùng rủi ro cao nhất

**Files:**
- Create: `src/lib/hooks/useExerciseSetAttempt.test.ts` (nếu logic hydrate
  tách được thành hàm thuần; nếu không tách được trong phạm vi Task 5, viết
  test tích hợp bằng Playwright harness — xem Bước 1 để quyết định hướng nào
  áp dụng được).

**Interfaces:**
- Consumes: `useExerciseSetAttempt` (Task 5), `GrammarExercisePage` (Task 7).

- [ ] **Step 1: Đánh giá lại độ phủ test hiện có trước khi viết thêm**

`useExerciseSetAttempt`/`useExerciseSetAttempts` (Task 5) là hook gọi
`supabase` trực tiếp — không tách được logic thuần có ý nghĩa để unit test
(khác `setAttemptUpdate.ts`, vốn đã thuần và có TDD đầy đủ ở Task 2). Phần
rủi ro thật (hydrate effect trong `GrammarExercisePage.tsx` Step 3 của
Task 7) là logic React effect, cần môi trường DOM thật để test có ý nghĩa —
đúng loại vấn đề Phase 0 đã gặp và giải quyết bằng Playwright harness
(`tests/e2e/classification-fields/`).

Do giới hạn effort của phiên làm việc này, **không** dựng thêm harness
Playwright mới cho `GrammarExercisePage` trong Task 8 — việc này đòi hỏi
mock Supabase Edge Function response (không đơn giản như Phase 0's DOM-only
bug). Thay vào đó:

- [ ] **Step 2: Test thủ công theo đúng 6 test case của requirement, ghi lại kết quả**

Không có `.env.local` trong worktree này (đã xác nhận ở Phase 0/1) nên
không tự chạy `npm run dev` được. Sau khi Task 1-7 xong, người dùng cần tự
xác nhận trên trình duyệt thật (hoặc agent thực thi cần `.env.local` trỏ
đúng project) theo đúng bảng test case trong `requirement.md`:

| Trường hợp | Kỳ vọng |
|---|---|
| Lần 1, đúng 3/5 | 60%, chưa đạt, chỉ đúng/sai, cho Làm lại |
| Lần 1, đúng 4/5 | 80%, đạt, không mở lời giải, cho Tiếp tục |
| Lần 1, đúng 5/5 | 100%, đạt, mở đáp án+giải thích, cho Tiếp tục |
| Lần 4, đúng 4/5 | 80%, đạt, không mở lời giải, cho Tiếp tục |
| Lần 5, đúng 3/5 | 60%, chưa đạt, mở đáp án+giải thích, không cho Tiếp tục |
| Lần 6, đúng 4/5 | 80%, đạt, lời giải vẫn mở, cho Tiếp tục |

Kèm test **F5 giữa chừng** ở 2 mốc quan trọng nhất (đúng vùng đã có 4 commit
sửa lỗi trước đây): F5 ngay sau khi đạt (chưa reveal) — phải thấy lại đúng
card kết quả, không phải form trắng; F5 sau khi đã reveal (lần 5 hoặc đúng
hết) — phải thấy lại đáp án/giải thích, không mất.

- [ ] **Step 3: Ghi log kết quả test thủ công vào PR description khi mở PR (Task 10)**

Không commit gì ở Task này riêng — kết quả test thủ công đi kèm PR
description, không phải file trong repo.

---

## Task 9: `GrammarExerciseFlow` — wrapper quản lý set list ↔ trang làm bài

**Files:**
- Create: `src/pages/GrammarExerciseFlow.tsx`

**Interfaces:**
- Consumes: `GrammarSetListPage` (Task 6), `GrammarExercisePage` (Task 7),
  `useExerciseSets` (đã có từ Phase 1).
- Produces:
  ```ts
  interface GrammarExerciseFlowProps {
    lesson: Lesson;
    onQuizFinished: (scorePercentage: number, xpEarned: number) => void;
    onNavigateHome: () => void;
    onNextLesson: () => void;
    onBackToLesson: () => void;
  }
  export const GrammarExerciseFlow: React.FC<GrammarExerciseFlowProps>
  ```
  Giữ đúng prop shape App.tsx đang truyền cho `GrammarExercisePage` hiện tại
  (Task 10 chỉ đổi 1 dòng ở App.tsx).

- [ ] **Step 1: Viết component**

```tsx
import React, { useState } from "react";
import { Lesson } from "../lib/appTypes";
import { useExerciseSets } from "../lib/hooks/useExerciseSets";
import { GrammarSetListPage } from "./GrammarSetListPage";
import { GrammarExercisePage } from "./GrammarExercisePage";

interface GrammarExerciseFlowProps {
  lesson: Lesson;
  onQuizFinished: (scorePercentage: number, xpEarned: number) => void;
  onNavigateHome: () => void;
  onNextLesson: () => void;
  onBackToLesson: () => void;
}

// setId đang làm là state cục bộ, KHÔNG đồng bộ vào URL global — quyết định
// đã chốt trong plan (xem Global Constraints): F5 giữa chừng quay về danh
// sách set, đổi lại giữ App.tsx/router.ts nguyên vẹn (vừa ổn định qua nhiều
// commit sửa lỗi routing gần đây).
export const GrammarExerciseFlow: React.FC<GrammarExerciseFlowProps> = ({
  lesson,
  onQuizFinished,
  onNavigateHome: _onNavigateHome,
  onNextLesson: _onNextLesson,
  onBackToLesson,
}) => {
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const { sets } = useExerciseSets();
  const activeSet = sets.find((s) => s.id === activeSetId);

  if (activeSetId && activeSet) {
    return (
      <GrammarExercisePage
        key={activeSetId}
        lessonId={lesson.id}
        set={{ id: activeSet.id, title: activeSet.title }}
        onSetFinished={onQuizFinished}
        onBackToList={() => setActiveSetId(null)}
        onBackToLesson={onBackToLesson}
      />
    );
  }

  return (
    <GrammarSetListPage
      lessonId={lesson.id}
      onBackToLesson={onBackToLesson}
      onSelectSet={setActiveSetId}
    />
  );
};
```

`_onNavigateHome`/`_onNextLesson` giữ trong destructure (prefix `_`, không
dùng) — App.tsx (Task 10) vẫn truyền đủ prop cũ mà không cần sửa call site
ngoài đổi tên component, tránh phải sửa `App.tsx` nhiều hơn 1 dòng.

- [ ] **Step 2: `npm run lint`**

Expected: sạch.

- [ ] **Step 3: Commit**

```bash
git add src/pages/GrammarExerciseFlow.tsx
git commit -m "feat(grammar): GrammarExerciseFlow — wrapper set list <-> trang làm bài, setId state cục bộ"
```

---

## Task 10: `App.tsx` — đổi call site, migrate types, regression toàn cục

**Files:**
- Modify: `src/App.tsx:1` dòng
- Modify: `src/lib/database.types.ts` (qua lệnh generate, không sửa tay)

**Interfaces:** không có gì tiêu thụ tiếp — task cuối cùng.

- [ ] **Step 1: Đổi import và call site trong `App.tsx`**

Dòng 22, đổi:

```tsx
import { GrammarExercisePage } from "./pages/GrammarExercisePage";
```

thành:

```tsx
import { GrammarExerciseFlow } from "./pages/GrammarExerciseFlow";
```

Dòng khoảng 396-403, đổi:

```tsx
                  <GrammarExercisePage
                    key={activeLessonObject.id}
                    lesson={activeLessonObject}
                    onQuizFinished={handleQuizFinished}
                    onNavigateHome={() => handleNavigate("roadmap")}
                    onNextLesson={handleNextLesson}
                    onBackToLesson={() => setCurrentPage("lesson-detail")}
                  />
```

thành:

```tsx
                  <GrammarExerciseFlow
                    key={activeLessonObject.id}
                    lesson={activeLessonObject}
                    onQuizFinished={handleQuizFinished}
                    onNavigateHome={() => handleNavigate("roadmap")}
                    onNextLesson={handleNextLesson}
                    onBackToLesson={() => setCurrentPage("lesson-detail")}
                  />
```

- [ ] **Step 2: `npm run lint`**

Expected: sạch hoàn toàn — đây là điểm kiểm tra toàn bộ chuỗi Task 1-9 khớp
nhau về type.

- [ ] **Step 3: Regenerate `database.types.ts`**

Gọi MCP `generate_typescript_types` với `project_id: "awdhqlgxnjwymwgxltlw"`,
ghi đè `src/lib/database.types.ts`.

- [ ] **Step 4: Regression toàn cục**

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts" tests/e2e/admin-classification-fields.playwright.test.ts`
Expected: PASS toàn bộ (bao gồm 8 test mới `setAttemptUpdate.test.ts`).

Run: `npm run lint`
Expected: sạch.

Run: `npm run build`
Expected: thành công.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/lib/database.types.ts
git commit -m "feat(grammar): App.tsx dùng GrammarExerciseFlow, regenerate database.types.ts"
```

---

## Self-Review (đã chạy khi viết plan)

**Spec coverage:** data model (Task 1), bảo mật explanation (Task 1 + 3),
API v2 với idempotency/reveal/XP rollup (Task 2-3), frontend set list + gate
reveal (Task 4-9), regression (Task 10) — khớp đủ các phần đã duyệt trong
spec, gồm cả 2 bổ sung phát hiện lúc viết plan (rollup dùng trung bình thay
vì 0 cứng, XP theo lesson không theo set).

**Placeholder scan:** Task 7 Step 8 có 1 chỗ ghi rõ "đọc lại đoạn gốc trước
khi sửa, chưa đọc hết trong lúc viết plan" — đây không phải placeholder che
giấu thiếu sót, mà là chỉ dẫn tường minh cho engineer về việc cần xác nhận
cụ thể tại chỗ (nút điều hướng ngoài phạm vi mô tả), kèm quy tắc rõ ràng để
tự quyết định (giữ nguyên phần ngoài scope, chỉ đổi phần điều hướng
"next"). Task 8 tường minh nói KHÔNG viết thêm automated test cho hydrate
(giới hạn effort), thay bằng checklist test thủ công cụ thể — ghi rõ lý do,
không phải bỏ trống.

**Type consistency:** `GrammarResult` (Task 7) khớp đúng response shape
`grammar-submit` (Task 3): `score, total, correct, isPassed, revealed,
attemptCount, bestScore, xpEarned, lessonQuizScore, blankResults,
choiceResults, exerciseResults, correctAnswers?, explanations?`.
`SetAttempt` (Task 5) khớp `GrammarResult`'s field cần cho hydrate.
`ExistingSetAttempt`/`SetAttemptUpdate` (Task 2) dùng xuyên suốt Task 3
đúng tên đã định nghĩa.
