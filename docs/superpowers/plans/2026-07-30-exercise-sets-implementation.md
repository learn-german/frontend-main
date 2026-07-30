# Phase 1 — Thực thể exercise_sets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dựng thực thể "bộ bài tập" (`exercise_sets`) làm nền cho toàn bộ business rule pass/attempt sau này, chuyển published/draft từ cấp câu hỏi lên cấp bộ bài tập, mà không đổi bất kỳ hành vi nào học viên đang thấy.

**Architecture:** Migration 3 bước (schema → backfill → view) áp dụng và kiểm chứng trên **Supabase development branch** trước, chỉ merge vào production sau khi xác nhận đúng. Song song sửa `grammar-submit` Edge Function và `AdminGrammarExerciseSection.tsx` để đọc/ghi qua `exercise_sets` thay vì cột `status` (sắp xóa) trên từng câu.

**Tech Stack:** Supabase Postgres + RLS, Deno Edge Functions, React 19 + TypeScript, `node:test`.

## Global Constraints

- Ngôn ngữ code: English. Nội dung hiển thị cho user: Tiếng Việt.
- Naming: `camelCase` biến/hàm, `PascalCase` component/type.
- Không dùng `any` trong TypeScript.
- Named exports, không default export (trừ `App.tsx`).
- Không thêm npm package mới.
- Không sửa `src/lib/database.types.ts` bằng tay — chỉ qua `npm run gen:types`.
- `correctAnswer`/`correct_answer` không bao giờ lộ qua PostgREST — không đổi gì liên quan trong plan này.
- Mọi migration phải test trên Supabase development branch trước, KHÔNG áp trực tiếp vào production khi chưa xác nhận qua branch.
- Tạo branch Supabase phát sinh chi phí thật (hourly) — bắt buộc gọi `confirm_cost` và có xác nhận của người dùng trước khi tạo, xóa branch ngay sau khi merge xong để dừng phát sinh phí.
- `npm run lint` sạch sau mỗi task có sửa code sản phẩm.

---

## Bối cảnh cho engineer chưa biết gì về việc này

Spec đầy đủ: [docs/superpowers/specs/2026-07-30-exercise-sets-design.md](../specs/2026-07-30-exercise-sets-design.md).

Tóm tắt: bảng `grammar_exercises` hiện tại là danh sách câu hỏi phẳng, gom
nhóm hiển thị qua cột `group_id` (nullable). Plan này thêm bảng
`exercise_sets` làm đơn vị "bộ bài tập" — mỗi `group_id` hiện có ứng đúng 1
`exercise_sets` row (xác nhận qua dữ liệu production thật: 5 group, 0 câu mồ
côi, không group nào trộn trạng thái hay trải qua 2 lesson). Trạng thái
published/draft chuyển hẳn từ cột `grammar_exercises.status` (sắp xóa) lên
`exercise_sets.status`.

Ba nơi cần sửa đồng bộ: (1) migration DB, (2) `grammar-submit` Edge Function
đang lọc `.eq("status", "published")` trên từng câu, (3)
`AdminGrammarExerciseSection.tsx` — file admin 1700+ dòng, hiện đang
publish/unpublish TỪNG CÂU qua `handlePublish`/`handleUnpublish`
(`.eq("id", editId)`), cần chuyển thành thao tác trên cả set.

**An toàn migration:** dùng Supabase development branch (`create_branch` —
replay lại toàn bộ migration history bao gồm cả các migration seed data, nên
branch có dữ liệu đủ giống thật để test backfill) để áp và kiểm chứng cả 3
migration trước khi merge vào production thật.

---

## File Structure

**Tạo mới:**
- `supabase/migrations/<ts>_exercise_sets.sql` — bảng `exercise_sets`, cột `grammar_exercises.set_id` (nullable), RLS.
- `supabase/migrations/<ts>_exercise_sets_backfill.sql` — backfill, xóa orphan, `set_id NOT NULL`, xóa cột `status`.
- `supabase/migrations/<ts>_grammar_exercises_public_set_id.sql` — view public đọc status từ set.
- `src/lib/hooks/useExerciseSets.ts` — fetch + rename + toggle status cho `exercise_sets`, tách phần logic thuần (đặt tên mặc định) ra hàm export riêng, test được bằng `node:test` không cần import supabase.
- `src/lib/hooks/useExerciseSets.test.ts` — test phần logic thuần.

**Sửa:**
- `supabase/functions/grammar-submit/index.ts` — lọc theo status của set thay vì của câu.
- `src/pages/admin/AdminGrammarExerciseSection.tsx` — type, fetch, save handler, JSX header/modal (chi tiết trong từng task).
- `src/lib/database.types.ts` — chạy lại `npm run gen:types`, không sửa tay.

---

## Task 1: Migration schema — bảng `exercise_sets` + cột `set_id` (nullable) + RLS, test trên branch

**Files:**
- Create: `supabase/migrations/<ts>_exercise_sets.sql`

**Interfaces:**
- Produces: bảng `exercise_sets(id, lesson_id, category, title, order_index, status)`, cột `grammar_exercises.set_id UUID NULL REFERENCES exercise_sets(id)`. Task 2 dùng cả hai.

- [ ] **Step 1: Xin xác nhận chi phí và tạo Supabase development branch**

Gọi `mcp__supabase__get_cost` với `type: "branch"`, rồi `mcp__supabase__confirm_cost`
với `type: "branch"`, đúng `amount`/`recurrence` trả về. **Trình bày chi phí
cho người dùng và chờ xác nhận trước khi tiếp tục** — đây là hành động phát
sinh phí thật, không tự ý làm.

Sau khi có `confirm_cost_id`, gọi `mcp__supabase__create_branch` với
`project_id: "awdhqlgxnjwymwgxltlw"`, `name: "exercise-sets-phase1"`. Ghi
lại `project_ref` của branch trả về (dùng cho mọi bước sau trong Task 1-3
thay vì project_id production).

- [ ] **Step 2: Viết migration file**

Tạo `supabase/migrations/<ts>_exercise_sets.sql` (thay `<ts>` bằng
timestamp UTC dạng `YYYYMMDDHHMMSS` tại lúc viết, ví dụ `20260730090000`):

```sql
-- =============================================================================
-- DeutschPath — exercise_sets: đơn vị "bộ bài tập" — chấm điểm/pass/attempt
-- và published/draft chuyển hẳn lên cấp này (thay vì từng câu hỏi). Mỗi
-- group_id hiện có trong grammar_exercises sẽ ứng đúng 1 exercise_sets row
-- (backfill ở migration kế tiếp).
-- =============================================================================

CREATE TABLE exercise_sets (
  id           UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id    TEXT    NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  category     TEXT    NOT NULL DEFAULT 'nguphap' CHECK (category IN ('nguphap', 'nghe', 'doc')),
  title        TEXT    NOT NULL,
  order_index  INTEGER NOT NULL DEFAULT 0,
  status       TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published'))
);

ALTER TABLE exercise_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercise_sets: admin write"
  ON exercise_sets FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

ALTER TABLE grammar_exercises
  ADD COLUMN set_id UUID REFERENCES exercise_sets(id) ON DELETE CASCADE;
```

Không thêm policy đọc cho `authenticated` trên `exercise_sets` — dữ liệu học
viên cần đi qua view `grammar_exercises_public` (Task 3), theo đúng pattern
`lessons` đang áp dụng (view chạy bằng quyền người tạo, không cần base table
có policy đọc công khai).

- [ ] **Step 3: Áp migration lên branch**

Gọi `mcp__supabase__apply_migration` với `project_id` = **project_ref của
branch** (không phải production), `name: "exercise_sets"`, `query` = nội
dung file Step 2.

- [ ] **Step 4: Kiểm chứng trên branch**

Gọi `mcp__supabase__execute_sql` trên branch:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'exercise_sets' ORDER BY ordinal_position;
```

Expected: đúng 6 cột `id, lesson_id, category, title, order_index, status`.

```sql
SELECT relrowsecurity FROM pg_class WHERE relname = 'exercise_sets';
```

Expected: `true`.

```sql
SELECT policyname FROM pg_policies WHERE tablename = 'exercise_sets';
```

Expected: đúng 1 policy `exercise_sets: admin write`.

```sql
SELECT count(*) FROM grammar_exercises WHERE set_id IS NOT NULL;
```

Expected: `0` (branch replay migration nhưng chưa backfill — cột vừa thêm,
toàn bộ NULL).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/<ts>_exercise_sets.sql
git commit -m "feat(db): tạo bảng exercise_sets + cột set_id (nullable), test trên Supabase branch"
```

---

## Task 2: Migration backfill — gán set_id, xóa orphan, khóa ràng buộc, xóa cột status

**Files:**
- Create: `supabase/migrations/<ts>_exercise_sets_backfill.sql`

**Interfaces:**
- Consumes: bảng `exercise_sets` và cột `set_id` từ Task 1, trên cùng branch.
- Produces: mọi `grammar_exercises.set_id` NOT NULL và đúng; `grammar_exercises.status` không còn tồn tại. Task 3, 4, 5 dựa vào điều này.

- [ ] **Step 1: Viết migration file**

Tạo `supabase/migrations/<ts>_exercise_sets_backfill.sql`:

```sql
-- =============================================================================
-- DeutschPath — backfill exercise_sets từ group_id hiện có, xóa câu mồ côi
-- (group_id IS NULL — di sản trước khi có cột group_id), khóa set_id NOT
-- NULL, xóa cột status khỏi grammar_exercises (chuyển hẳn lên exercise_sets).
--
-- An toàn theo giả định nền: hệ thống chưa có user thật dùng grammar_attempts
-- gắn với các câu bị xóa — grammar_attempts không tham chiếu khóa ngoại tới
-- grammar_exercises nên không bị ảnh hưởng bởi DELETE dưới đây.
-- =============================================================================

-- Mỗi group_id -> 1 set. status của set = published chỉ khi TẤT CẢ câu
-- trong group đang published (không có group nào trộn trạng thái ở dữ liệu
-- hiện tại, nhưng migration viết đúng cho trường hợp tổng quát).
WITH group_to_set AS (
  INSERT INTO exercise_sets (lesson_id, category, title, order_index, status)
  SELECT
    lesson_id,
    'nguphap',
    'Bài tập ' || row_number() OVER (PARTITION BY lesson_id ORDER BY min(order_index)),
    min(order_index),
    CASE WHEN bool_and(status = 'published') THEN 'published' ELSE 'draft' END
  FROM grammar_exercises
  WHERE group_id IS NOT NULL
  GROUP BY lesson_id, group_id
  RETURNING id, lesson_id, title, order_index
),
-- Nối lại group_id gốc bằng cách join qua đúng (lesson_id, min(order_index))
-- đã dùng để sinh set — order_index là duy nhất trong phạm vi 1 lesson
-- (ràng buộc ngầm của order_index hiện có), nên cặp (lesson_id, order_index)
-- xác định đúng 1 group.
group_key AS (
  SELECT lesson_id, group_id, min(order_index) AS min_order
  FROM grammar_exercises
  WHERE group_id IS NOT NULL
  GROUP BY lesson_id, group_id
)
UPDATE grammar_exercises g
SET set_id = gts.id
FROM group_key gk
JOIN group_to_set gts ON gts.lesson_id = gk.lesson_id AND gts.order_index = gk.min_order
WHERE g.group_id = gk.group_id AND g.lesson_id = gk.lesson_id;

DELETE FROM grammar_exercises WHERE group_id IS NULL;

ALTER TABLE grammar_exercises ALTER COLUMN set_id SET NOT NULL;
ALTER TABLE grammar_exercises DROP COLUMN status;
```

- [ ] **Step 2: Áp migration lên branch**

Gọi `mcp__supabase__apply_migration` trên project_ref của branch,
`name: "exercise_sets_backfill"`, `query` = nội dung Step 1.

- [ ] **Step 3: Kiểm chứng trên branch — không mất dữ liệu, không tách đôi group**

```sql
SELECT count(*) AS n_exercises, count(*) FILTER (WHERE set_id IS NULL) AS n_null_set
FROM grammar_exercises;
```

Expected: `n_null_set = 0`.

```sql
SELECT g.group_id, count(DISTINCT g.set_id) AS n_sets
FROM grammar_exercises g
GROUP BY g.group_id
HAVING count(DISTINCT g.set_id) > 1;
```

Expected: 0 dòng (không group nào bị tách đôi giữa 2 set).

```sql
SELECT count(*) FROM exercise_sets;
```

Ghi lại con số này — so sánh với `SELECT count(DISTINCT group_id) FROM grammar_exercises WHERE group_id IS NOT NULL` chạy TRƯỚC migration (nếu implementer chạy Task 2 ngay sau Task 1 trên cùng branch, hai số phải bằng nhau).

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'grammar_exercises' AND column_name = 'status';
```

Expected: 0 dòng (cột đã xóa).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<ts>_exercise_sets_backfill.sql
git commit -m "feat(db): backfill exercise_sets từ group_id, xóa cột status khỏi grammar_exercises"
```

---

## Task 3: Migration view public — lọc theo status của set

**Files:**
- Create: `supabase/migrations/<ts>_grammar_exercises_public_set_id.sql`

**Interfaces:**
- Consumes: `exercise_sets.status`, `grammar_exercises.set_id` từ Task 1-2.
- Produces: view `grammar_exercises_public` có thêm cột `set_id`, lọc theo `es.status`. Task 4 (frontend) sẽ dùng `set_id` này ở Phase 2, chưa dùng trong plan này.

- [ ] **Step 1: Viết migration file**

Tạo `supabase/migrations/<ts>_grammar_exercises_public_set_id.sql`:

```sql
-- =============================================================================
-- DeutschPath — grammar_exercises_public: đổi filter published/draft từ cột
-- status trên từng câu (đã xóa) sang status của exercise_sets. Thêm set_id
-- vào SELECT list — chưa dùng ở frontend, chuẩn bị sẵn cho Phase 2.
-- =============================================================================

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
    g.explanation,
    g.order_index
  FROM grammar_exercises g
  JOIN exercise_sets es ON es.id = g.set_id
  JOIN lessons l ON l.id = g.lesson_id
  WHERE es.status = 'published'
    AND (l.status = 'published' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

GRANT SELECT ON grammar_exercises_public TO authenticated;
```

- [ ] **Step 2: Áp migration lên branch**

Gọi `mcp__supabase__apply_migration` trên project_ref của branch,
`name: "grammar_exercises_public_set_id"`, `query` = nội dung Step 1.

- [ ] **Step 3: Kiểm chứng trên branch — view trả đúng số dòng như trước migration**

```sql
SELECT count(*) FROM grammar_exercises_public;
```

Ghi lại con số. So sánh với số câu published thực tế trên branch (chạy TRƯỚC
Task 2, hoặc suy ra: mọi câu published trước migration của lesson published
phải xuất hiện ở đây sau migration — vì backfill Task 2 gán set.status =
'published' khi mọi câu trong group đều published, và dữ liệu hiện tại
không có group trộn trạng thái, nên số dòng phải bằng chính xác số câu
`status = 'published'` đã đếm được trước khi Task 2 xóa cột đó. Nếu
implementer làm Task 1-3 tuần tự trên cùng branch không tách phiên, ghi lại
con số `published_count` từ Task 1 Step 4 hoặc trước đó để đối chiếu).

```sql
SELECT set_id FROM grammar_exercises_public LIMIT 1;
```

Expected: chạy không lỗi, cột `set_id` tồn tại trong kết quả.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/<ts>_grammar_exercises_public_set_id.sql
git commit -m "feat(db): grammar_exercises_public lọc theo status của exercise_sets, thêm set_id"
```

---

## Task 4: Edge Function `grammar-submit` — lọc câu theo status của set

**Files:**
- Modify: `supabase/functions/grammar-submit/index.ts:57-64`

**Interfaces:**
- Consumes: `exercise_sets.status` qua PostgREST embedded resource filter.
- Không đổi response shape của function — Task này chỉ đổi nguồn dữ liệu đầu vào truy vấn.

- [ ] **Step 1: Đọc code hiện tại để xác nhận đúng vị trí**

Trong `supabase/functions/grammar-submit/index.ts`, tìm đoạn:

```ts
    const { data: exercises, error: exErr } = await supabase
      .from("grammar_exercises")
      .select("id, type, correct_answer, acceptable_answers, classification_items, blanks, options")
      .eq("lesson_id", lesson_id)
      .eq("status", "published");
```

- [ ] **Step 2: Sửa query lọc theo status của set qua embedded filter**

Đổi thành:

```ts
    const { data: exercises, error: exErr } = await supabase
      .from("grammar_exercises")
      .select("id, type, correct_answer, acceptable_answers, classification_items, blanks, options, exercise_sets!inner(status)")
      .eq("lesson_id", lesson_id)
      .eq("exercise_sets.status", "published");
```

PostgREST hỗ trợ lọc qua embedded resource khi dùng `!inner` join —
`exercise_sets!inner(status)` bắt buộc join, `.eq("exercise_sets.status", "published")`
lọc theo cột đó. Trường `exercise_sets` sẽ xuất hiện trong mỗi object trả về
(`{ ...exercise fields, exercise_sets: { status: "published" } }`) — không
ảnh hưởng `computeGrammarScore`/`projectAnswers` vì các hàm đó chỉ đọc field
đã biết trước (`id, type, correct_answer, ...`), field thừa `exercise_sets`
bị bỏ qua tự nhiên do TypeScript không strict-check field thừa trên object
literal đọc động từ Supabase response.

- [ ] **Step 3: Chạy lại test hiện có của grammar-submit, xác nhận không vỡ**

Run: `npx tsx --test supabase/functions/grammar-submit/scoring.test.ts supabase/functions/grammar-submit/attemptUpdate.test.ts`
Expected: PASS toàn bộ — các test này test `computeGrammarScore`/
`projectAnswers`/`computeAttemptUpdate` bằng dữ liệu giả lập trực tiếp,
không phụ thuộc câu query vừa sửa, nên phải không đổi kết quả.

- [ ] **Step 4: Kiểm chứng thủ công trên branch (không có test tự động cho index.ts)**

Gọi `mcp__supabase__execute_sql` trên project_ref của branch:

```sql
SELECT g.id, es.status
FROM grammar_exercises g
JOIN exercise_sets es ON es.id = g.set_id
LIMIT 5;
```

Xác nhận join hoạt động đúng, `es.status` có giá trị hợp lệ
(`draft`/`published`) cho mọi dòng — đúng dữ liệu mà query PostgREST ở
Step 2 sẽ nhận được.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/grammar-submit/index.ts
git commit -m "fix(grammar-submit): lọc câu hỏi theo status của exercise_sets thay vì từng câu"
```

---

## Task 5: `useExerciseSets` hook — fetch, đặt tên mặc định, rename, toggle status

**Files:**
- Create: `src/lib/hooks/useExerciseSets.ts`
- Create: `src/lib/hooks/useExerciseSets.test.ts`

**Interfaces:**
- Produces:
  - `nextDefaultSetTitle(existingCount: number): string` — hàm thuần, export riêng để test không cần supabase.
  - `interface ExerciseSet { id: string; lessonId: string; category: string; title: string; orderIndex: number; status: "draft" | "published"; }`
  - `useExerciseSets(lessonId: string | null): { sets: ExerciseSet[]; loading: boolean; refetch: () => void; renameSet: (id: string, title: string) => Promise<{ error: string | null }>; toggleSetStatus: (id: string, current: "draft" | "published") => Promise<{ error: string | null }>; createSet: (lessonId: string, category: string, orderIndex: number) => Promise<{ data: ExerciseSet | null; error: string | null }>; }`
- Task 6, 7 dùng `ExerciseSet`, `useExerciseSets`, `nextDefaultSetTitle`.

- [ ] **Step 1: Viết hàm thuần đặt tên mặc định + test**

Tạo `src/lib/hooks/useExerciseSets.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { nextDefaultSetTitle } from "./useExerciseSets";

test("đặt tên mặc định theo đúng số thứ tự tiếp theo", () => {
  assert.equal(nextDefaultSetTitle(0), "Bài tập 1");
  assert.equal(nextDefaultSetTitle(4), "Bài tập 5");
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL (chưa có file nguồn)**

Run: `npx tsx --test src/lib/hooks/useExerciseSets.test.ts`
Expected: FAIL — module `./useExerciseSets` không tồn tại.

- [ ] **Step 3: Viết `useExerciseSets.ts`**

```ts
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";

export interface ExerciseSet {
  id: string;
  lessonId: string;
  category: string;
  title: string;
  orderIndex: number;
  status: "draft" | "published";
}

interface ExerciseSetRow {
  id: string;
  lesson_id: string;
  category: string;
  title: string;
  order_index: number;
  status: "draft" | "published";
}

const fromRow = (row: ExerciseSetRow): ExerciseSet => ({
  id: row.id,
  lessonId: row.lesson_id,
  category: row.category,
  title: row.title,
  orderIndex: row.order_index,
  status: row.status,
});

// existingCount = số set đã có trong lesson trước khi tạo set này — tên mặc
// định theo đúng số thứ tự hiển thị admin đang quen thấy ("Bài 1", "Bài 2"),
// không phụ thuộc order_index thực tế (có thể có khoảng trống sau khi xóa).
export function nextDefaultSetTitle(existingCount: number): string {
  return `Bài tập ${existingCount + 1}`;
}

export function useExerciseSets(lessonId: string | null) {
  const [sets, setSets] = useState<ExerciseSet[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    if (!lessonId) {
      setSets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("exercise_sets")
      .select("id, lesson_id, category, title, order_index, status")
      .eq("lesson_id", lessonId)
      .order("order_index")
      .then(({ data }) => {
        setSets(((data ?? []) as ExerciseSetRow[]).map(fromRow));
        setLoading(false);
      });
  }, [lessonId]);

  useEffect(() => { refetch(); }, [refetch]);

  const renameSet = async (id: string, title: string): Promise<{ error: string | null }> => {
    const { error } = await supabase.from("exercise_sets").update({ title }).eq("id", id);
    if (!error) refetch();
    return { error: error?.message ?? null };
  };

  const toggleSetStatus = async (
    id: string,
    current: "draft" | "published",
  ): Promise<{ error: string | null }> => {
    const next = current === "draft" ? "published" : "draft";
    const { error } = await supabase.from("exercise_sets").update({ status: next }).eq("id", id);
    if (!error) refetch();
    return { error: error?.message ?? null };
  };

  const createSet = async (
    forLessonId: string,
    category: string,
    orderIndex: number,
  ): Promise<{ data: ExerciseSet | null; error: string | null }> => {
    const { data, error } = await supabase
      .from("exercise_sets")
      .insert({
        lesson_id: forLessonId,
        category,
        title: nextDefaultSetTitle(sets.length),
        order_index: orderIndex,
        status: "draft",
      })
      .select("id, lesson_id, category, title, order_index, status")
      .single();
    if (error || !data) return { data: null, error: error?.message ?? "Không tạo được bài tập." };
    const created = fromRow(data as ExerciseSetRow);
    setSets((prev) => [...prev, created]);
    return { data: created, error: null };
  };

  return { sets, loading, refetch, renameSet, toggleSetStatus, createSet };
}
```

- [ ] **Step 4: Chạy lại test, xác nhận PASS**

Run: `npx tsx --test src/lib/hooks/useExerciseSets.test.ts`
Expected: PASS.

- [ ] **Step 5: `npm run lint`**

Expected: sạch.

- [ ] **Step 6: Commit**

```bash
git add src/lib/hooks/useExerciseSets.ts src/lib/hooks/useExerciseSets.test.ts
git commit -m "feat(admin): thêm useExerciseSets — fetch/rename/toggle status/tạo set"
```

---

## Task 6: `AdminGrammarExerciseSection.tsx` — type, fetch, gắn `set_id` khi tạo/nối câu

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx`

**Interfaces:**
- Consumes: `useExerciseSets`, `ExerciseSet`, `nextDefaultSetTitle` từ Task 5.
- Produces: mỗi `GrammarExercise` có `setId: string`; `groups: LessonGroup[]` state không đổi shape ngoài field mới; hàm `handleSave` luôn gắn `set_id` hợp lệ. Task 7 dựa vào `setId` để hiển thị/toggle.

- [ ] **Step 1: Xóa `status` khỏi interface `GrammarExercise`, thêm `setId`**

Dòng 46-75, đổi:

```tsx
interface GrammarExercise {
  id: string;
  lesson_id: string;
  type: ...;
  group_id: string | null;
  status: "draft" | "published";
  prompt_text: string | null;
  ...
  order_index: number;
  groupId: string | null;
  orderIndex: number;
}
```

thành (xóa dòng `status`, thêm `set_id`/`setId`):

```tsx
interface GrammarExercise {
  id: string;
  lesson_id: string;
  type: ...;
  group_id: string | null;
  set_id: string;
  prompt_text: string | null;
  ...
  order_index: number;
  groupId: string | null;
  setId: string;
  orderIndex: number;
}
```

(giữ nguyên toàn bộ field ở giữa không đổi, chỉ xóa `status:` và chèn
`set_id`/`setId` đúng vị trí tương ứng `group_id`/`groupId`).

- [ ] **Step 2: Import `useExerciseSets`**

Thêm sau dòng 9 (`import { useModuleOrder } ...`):

```tsx
import { useExerciseSets, nextDefaultSetTitle, type ExerciseSet } from "../../lib/hooks/useExerciseSets";
```

- [ ] **Step 3: Xóa `status` khỏi `fetchExercises` select, gắn `setId`**

Dòng 906, đổi:

```tsx
supabase.from("grammar_exercises").select("*").order("lesson_id").order("order_index"),
```

Không cần đổi (`select("*")` tự động không còn trả `status` sau Task 2 vì
cột đã xóa ở DB — không cần sửa câu query này).

Dòng 910-918, đổi mapping để thêm `setId`:

```tsx
    const exercisesByLesson: Record<string, GrammarExercise[]> = {};
    for (const ex of exercisesRes.data ?? []) {
      const exercise = ex as Omit<GrammarExercise, "groupId" | "orderIndex" | "setId">;
      (exercisesByLesson[ex.lesson_id] ??= []).push({
        ...exercise,
        groupId: exercise.group_id,
        setId: exercise.set_id,
        orderIndex: exercise.order_index,
      });
    }
```

- [ ] **Step 4: Gọi `useExerciseSets` cho lesson đang mở modal, dùng trong save handler**

Sau dòng khai báo `const { modules: moduleOrder, ... } = useModuleOrder();`
(dòng 881), thêm:

```tsx
  const { sets: exerciseSets, refetch: refetchExerciseSets, createSet } = useExerciseSets(editLessonId || null);
```

`editLessonId` đã là state có sẵn (dòng 888), luôn được set trước khi modal
mở (`openCreate`/`openEdit`/`openAppendChildren` đều gọi `setEditLessonId`)
— hook tự refetch đúng lesson mỗi khi modal đổi lesson.

- [ ] **Step 5: Sửa nhánh `create-group` trong `handleSave` — tạo set trước, gắn `set_id`**

Dòng 1073-1083, đổi:

```tsx
    } else if (modalMode === "create-group") {
      const groupId = crypto.randomUUID();
      const payloads = entries.map((entry, index) => ({
        ...buildPayload(entry),
        lesson_id: editLessonId,
        group_id: groupId,
        hint: normalizedHint,
        word_bank: sharedWordBank,
        order_index: createStartOrder + index,
      }));
      ({ error } = await supabase.from("grammar_exercises").insert(payloads));
    }
```

thành:

```tsx
    } else if (modalMode === "create-group") {
      const groupId = crypto.randomUUID();
      const setResult = await createSet(editLessonId, "nguphap", createStartOrder);
      if (setResult.error || !setResult.data) {
        error = { message: setResult.error ?? "Không tạo được bài tập mới." };
      } else {
        const payloads = entries.map((entry, index) => ({
          ...buildPayload(entry),
          lesson_id: editLessonId,
          group_id: groupId,
          set_id: setResult.data!.id,
          hint: normalizedHint,
          word_bank: sharedWordBank,
          order_index: createStartOrder + index,
        }));
        ({ error } = await supabase.from("grammar_exercises").insert(payloads));
      }
    }
```

- [ ] **Step 6: Sửa nhánh `appendContext` — kế thừa `set_id` có sẵn của group**

Dòng 1102-1110, đổi:

```tsx
      if (!error) {
        const payloads = entries.map((entry, index) => ({
          ...buildPayload(entry),
          lesson_id: editLessonId,
          group_id: resolved.groupId,
          hint: normalizedHint,
          word_bank: sharedWordBank,
          order_index: createStartOrder + index,
        }));
        const insertResult = await supabase.from("grammar_exercises").insert(payloads);
        error = insertResult.error;
```

thành (lấy `set_id` từ câu đầu tiên của group đang thêm vào — luôn tồn tại
vì `appendContext` chỉ mở được từ một group đã có ít nhất 1 câu):

```tsx
      if (!error) {
        const existingSetId = groups
          .find((g) => g.lesson_id === editLessonId)
          ?.exercises.find((ex) => ex.groupId === resolved.groupId)?.setId;
        if (!existingSetId) {
          error = { message: "Không tìm thấy bài tập chứa nhóm câu hỏi này." };
        } else {
          const payloads = entries.map((entry, index) => ({
            ...buildPayload(entry),
            lesson_id: editLessonId,
            group_id: resolved.groupId,
            set_id: existingSetId,
            hint: normalizedHint,
            word_bank: sharedWordBank,
            order_index: createStartOrder + index,
          }));
          const insertResult = await supabase.from("grammar_exercises").insert(payloads);
          error = insertResult.error;
        }
```

Giữ nguyên khối `if (error && resolved.assignedLegacyId) { ... }` ngay sau
đó (rollback), chỉ cần đóng thêm 1 dấu `}` cho khối `else` mới thêm — kiểm
tra kỹ khi áp dụng để không lệch ngoặc.

- [ ] **Step 7: `npm run lint`, xác nhận sạch (chưa cần đúng UI hoàn chỉnh, chỉ cần biên dịch được)**

Expected: có thể còn lỗi type do Task 7 (JSX header) chưa sửa — nếu vậy, ghi
chú lại các lỗi liên quan tới `ex.status` (sẽ sửa ở Task 7), không phải lỗi
của Task 6.

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/AdminGrammarExerciseSection.tsx
git commit -m "feat(admin): gắn set_id khi tạo bài tập mới/thêm câu vào nhóm có sẵn"
```

---

## Task 7: `AdminGrammarExerciseSection.tsx` — UI header set (rename + publish/draft), xóa UI cấp câu

**Files:**
- Modify: `src/pages/admin/AdminGrammarExerciseSection.tsx`

**Interfaces:**
- Consumes: `ExerciseSet`, `useExerciseSets` từ Task 5; `setId` trên `GrammarExercise` từ Task 6.
- Produces: không có gì tiêu thụ tiếp — task cuối cùng sửa code sản phẩm.

- [ ] **Step 1: Truyền `exerciseSets` xuống `ExerciseGroupList`/`SortableExerciseGroupRow`**

`ExerciseGroupList` (dòng 379) hiện nhận `exercises: GrammarExercise[]` rồi
tự `groupGrammarExercises(exercises)`. Mỗi exercise trong group đã mang
`setId` (Task 6) — không cần truyền thêm prop `exerciseSets` riêng, chỉ cần
tra `set` tương ứng bằng cách thêm 1 prop `findSet: (setId: string) => ExerciseSet | undefined`
truyền xuống từ component cha, lookup trong mảng `exerciseSets` đã fetch ở
Task 6 Step 4.

Thêm vào interface props của `ExerciseGroupList` (dòng 379-392) và
`SortableExerciseGroupRow` (`ExerciseGroupRowProps`, dòng 303-316):

```tsx
  findSet: (setId: string) => ExerciseSet | undefined;
```

Truyền `findSet={(id) => exerciseSets.find((s) => s.id === id)}` tại nơi gọi
`<ExerciseGroupList ... />` (dòng ~1341), và forward xuống
`SortableExerciseGroupRow` trong `ExerciseGroupList`'s render (dòng 403).

- [ ] **Step 2: Header nhóm — thay "Bài N" tĩnh bằng tên set + toggle publish**

Dòng 342 hiện tại:

```tsx
          <span className="text-sm font-black text-slate-700">Bài {groupIndex + 1}</span>
```

Đổi toàn bộ khối button chứa span đó (dòng 340-346) — thêm state rename
inline và badge trạng thái. Vì `SortableExerciseGroupRow` hiện là function
component không có state riêng, thêm state cục bộ cho rename:

```tsx
const SortableExerciseGroupRow: React.FC<ExerciseGroupRowProps> = ({
  exerciseGroup, groupIndex, isExpanded, selectedIds, disabled, onToggleExpanded,
  onToggleGroup, onToggleExercise, onEdit, onDelete, onPreview, onAddChildren,
  findSet, onRenameSet, onToggleSetStatus,
}) => {
  const set = findSet(exerciseGroup.exercises[0]?.setId);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState(set?.title ?? "");
  ...
```

Thay khối JSX dòng 340-346:

```tsx
        <button type="button" onClick={() => onToggleExpanded(exerciseGroup.key)} className="flex flex-1 items-center gap-3 text-left">
          {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
          {renaming ? (
            <input
              autoFocus
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onBlur={() => { if (set && titleDraft.trim()) onRenameSet(set.id, titleDraft.trim()); setRenaming(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className={`${inputBaseCls} w-48`}
            />
          ) : (
            <span
              onClick={(e) => { e.stopPropagation(); setTitleDraft(set?.title ?? ""); setRenaming(true); }}
              className="text-sm font-black text-slate-700 hover:underline"
            >
              {set?.title ?? `Bài ${groupIndex + 1}`}
            </span>
          )}
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TYPE_COLORS[exerciseGroup.type]}`}>{TYPE_LABELS[exerciseGroup.type]}</span>
          <span className="text-xs text-slate-400">{exerciseGroup.exercises.length} câu</span>
          {set && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleSetStatus(set.id, set.status); }}
            >
              <LessonStatusBadge status={set.status} />
            </button>
          )}
        </button>
```

Thêm 2 prop mới vào `ExerciseGroupRowProps` và `ExerciseGroupList`'s props:
`onRenameSet: (id: string, title: string) => void` và
`onToggleSetStatus: (id: string, current: "draft" | "published") => void`,
truyền từ component cha xuống bằng `renameSet`/`toggleSetStatus` của
`useExerciseSets` (Task 6 Step 4).

- [ ] **Step 3: Xóa badge trạng thái ở từng câu con**

Dòng 365 hiện tại:

```tsx
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ex.status === "published" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>{ex.status === "published" ? "Đã publish" : "Nháp"}</span>
```

Xóa hẳn dòng này — `ex.status` không còn tồn tại trên `GrammarExercise` sau
Task 6 Step 1, dòng này đang gây lỗi biên dịch, xóa là bắt buộc chứ không
phải tùy chọn.

- [ ] **Step 4: Xóa `handlePublish`/`handleUnpublish` và nút tương ứng trong modal**

Xóa toàn bộ hàm `handlePublish` (dòng 1221-1233) và `handleRevertToDraft`
(dòng 1235-1247).

Xóa khối JSX dòng 1533-1542:

```tsx
              {modalMode === "edit" && editId &&
                (entries[0].status === "draft" ? (
                  <Button variant="ghost" size="sm" onClick={handlePublish} className="w-full" disabled={saving}>
                    Publish
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={handleRevertToDraft} className="w-full" disabled={saving}>
                    Chuyển về Nháp
                  </Button>
                ))}
```

- [ ] **Step 5: Xóa `status` khỏi `EditForm`, `EMPTY_FORM`, `buildPayload`, mọi nơi gán `status`**

Dòng 106-121 (`EditForm` interface và `EMPTY_FORM`): xóa dòng
`status: "draft" | "published";` khỏi interface và `status: "draft",` khỏi
`EMPTY_FORM`.

Dòng 214+ (`buildPayload`): xóa `status: form.status,` khỏi object trả về.

Dòng 965 (`openEdit`, xây `entries[0]`): xóa `status: ex.status,`.

Dòng 1013 (`handleTypeChange`): xóa `status: prev[0]?.status ?? "draft",`.

Dòng 1023 (`addEntry`): xóa `status: prev[0].status,`.

Dòng 1386 (`LessonStatusBadge status={entries[0].status}` trong header
modal edit): xóa dòng này — trạng thái không còn thuộc về từng
exercise/entry, badge giờ chỉ hiện ở header nhóm (Step 2).

- [ ] **Step 6: `npm run lint`, xác nhận sạch hoàn toàn**

Run: `npm run lint`
Expected: không lỗi. Nếu còn tham chiếu `status`/`ex.status`/`entries[0].status`
sót lại đâu đó, `tsc --noEmit` sẽ báo lỗi type rõ vị trí — sửa hết trước khi
qua bước sau.

- [ ] **Step 7: Test thủ công trên trình duyệt (dev server, không cần Supabase thật nếu đã trỏ .env.local vào branch)**

Nếu implementer có quyền truy cập `.env.local` trỏ vào project branch (Task
1's project_ref), chạy `npm run dev`, mở trang Nội dung > Bài tập, xác nhận:
đổi tên bài tập bằng cách bấm vào tiêu đề; bấm badge để publish/draft cả
nhóm; badge KHÔNG còn hiện ở từng câu con; nút Publish/Chuyển về Nháp KHÔNG
còn trong modal sửa từng câu.

Nếu không có `.env.local`, bỏ qua bước này — Task 8 sẽ verify bằng cách
khác sau khi merge lên production.

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/AdminGrammarExerciseSection.tsx
git commit -m "feat(admin): chuyển publish/draft lên cấp bài tập (set), xóa UI cấp câu hỏi"
```

---

## Task 8: Merge branch vào production, regenerate types, regression toàn cục

**Files:** không sửa code — chỉ chạy migration thật + verify + generate types.
- Modify: `src/lib/database.types.ts` (qua lệnh, không sửa tay)

**Interfaces:** không có gì tiêu thụ tiếp — task đóng phase.

- [ ] **Step 1: Trình bày tóm tắt cho người dùng, xin xác nhận trước khi đụng production**

Trước khi merge, liệt kê lại: 3 migration sẽ áp production (tên file), số
liệu đã verify trên branch (số set tạo ra, số câu backfill đúng, view trả
đúng số dòng). **Dừng lại chờ xác nhận rõ ràng của người dùng** — đây là
thao tác không thể hoàn tác dễ dàng trên dữ liệu thật (xóa cột, xóa câu mồ
côi nếu có phát sinh mới từ lúc tạo branch tới giờ).

- [ ] **Step 2: Merge branch vào production**

Gọi `mcp__supabase__merge_branch` với `branch_id` của branch đã tạo ở Task 1
Step 1. Tool này áp toàn bộ migration đã commit (Task 1-4 dùng chung 1
`supabase/migrations/` history) lên project production
`awdhqlgxnjwymwgxltlw`.

- [ ] **Step 3: Verify trên production — lặp lại đúng các query kiểm chứng đã chạy trên branch**

Chạy lại đúng các câu SQL ở Task 1 Step 4, Task 2 Step 3, Task 3 Step 3
nhưng với `project_id: "awdhqlgxnjwymwgxltlw"` (production). Kết quả phải
khớp kỳ vọng tương tự (số lượng cụ thể có thể khác branch vì dữ liệu
production có thể đã thay đổi từ lúc tạo branch — chấp nhận được, miễn
`n_null_set = 0`, không group nào tách đôi).

- [ ] **Step 4: Xóa Supabase development branch — dừng phát sinh phí**

Gọi `mcp__supabase__delete_branch` với `branch_id`.

- [ ] **Step 5: Regenerate `database.types.ts`**

Gọi `mcp__supabase__generate_typescript_types` với `project_id: "awdhqlgxnjwymwgxltlw"`,
ghi kết quả đè lên `src/lib/database.types.ts` (đúng quy ước CLAUDE.md — chỉ
qua lệnh generate, không sửa tay).

- [ ] **Step 6: Regression toàn cục**

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts"`
Expected: PASS toàn bộ (bao gồm test mới `useExerciseSets.test.ts` và test
grammar-submit hiện có).

Run: `npm run lint`
Expected: sạch.

Run: `npm run build`
Expected: thành công.

- [ ] **Step 7: Commit**

```bash
git add src/lib/database.types.ts
git commit -m "chore: regenerate database.types.ts sau migration exercise_sets"
```

---

## Self-Review (đã chạy khi viết plan)

**Spec coverage:** data model (Task 1), backfill (Task 2), view public
(Task 3), Edge Function (Task 4), admin rename/toggle logic (Task 5), gắn
`set_id` khi tạo/nối câu (Task 6), UI header + xóa UI cấp câu (Task 7), merge
production + types + regression (Task 8) — khớp đủ 4 phần đã duyệt trong
spec.

**Placeholder scan:** không còn "TBD"; mọi bước SQL/TSX đều có code đầy đủ;
các chỗ cần điền `<ts>` là quy ước timestamp thật, không phải nội dung thiếu.

**Type consistency:** `ExerciseSet`, `useExerciseSets`, `nextDefaultSetTitle`
dùng xuyên suốt Task 5-7 với đúng tên đã định nghĩa ở Task 5. `setId` trên
`GrammarExercise` (Task 6) được Task 7 dùng đúng tên.

**Rủi ro cần lưu ý cho người thực thi:** Task 2's migration UPDATE dựa vào
`(lesson_id, order_index)` là khóa xác định duy nhất 1 group trong phạm vi 1
lesson — đúng với dữ liệu hiện tại (đã verify order_index không trùng giữa
2 group cùng lesson), nhưng nếu dữ liệu thay đổi trước khi migration chạy
thật (thêm bài tập mới giữa lúc viết plan và lúc thực thi), cần chạy lại
query kiểm tra ở Task 2 Step 3 ngay sau khi backfill, không giả định suông.
