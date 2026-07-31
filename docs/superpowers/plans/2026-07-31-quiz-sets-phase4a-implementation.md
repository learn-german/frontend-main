# Phase 4a — Data model: gắn quiz_questions vào exercise_sets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `quiz_questions` mirror đúng cấu trúc `grammar_exercises` (có `set_id`, không còn `category`), view `quiz_questions_public` lọc theo status của set.

**Architecture:** Migration DDL thuần, không có logic ứng dụng mới. `exercise_sets`/`exercise_set_attempts`/`exercise_set_drafts` không đổi.

**Tech Stack:** Supabase Postgres migration — không có thay đổi frontend/Edge Function ở sub-phase này.

## Global Constraints

- Xoá sạch dữ liệu `quiz_questions` hiện có (3 câu "đọc") — đã được xác nhận, không backfill.
- Áp migration trực tiếp lên production (đúng quy ước đã dùng xuyên suốt session: app chưa có user thật dùng tính năng này).
- Không sửa `AdminQuizSection.tsx`/`QuizPage.tsx` ở sub-phase này — chúng sẽ tạm gãy, xử lý ở 4c/4d.

---

### Task 1: Migration — thêm set_id, bỏ category, viết lại view

**Files:**
- Create: `supabase/migrations/20260731100000_quiz_questions_set_id.sql`
- Modify: `src/lib/database.types.ts` (regenerate sau khi apply)

**Interfaces:**
- Không có — thuần DDL.

- [ ] **Step 1: Viết migration**

```sql
-- =============================================================================
-- Phase 4a — quiz_questions mirror đúng cấu trúc grammar_exercises: thêm
-- set_id, bỏ category (suy ra từ exercise_sets.category). Dữ liệu cũ (3 câu
-- "đọc") bị xoá vì chưa có set_id để gắn vào — đã được xác nhận, ứng dụng
-- chưa có user thật dùng tính năng Nghe/Đọc.
-- =============================================================================

DELETE FROM quiz_questions;

ALTER TABLE quiz_questions
  ADD COLUMN set_id UUID NOT NULL REFERENCES exercise_sets(id) ON DELETE CASCADE,
  DROP COLUMN category;

DROP VIEW IF EXISTS quiz_questions_public;

CREATE VIEW quiz_questions_public AS
  SELECT
    q.id,
    q.lesson_id,
    q.set_id,
    q.type,
    regexp_replace(q.question_text, '\{\{[^}]*\}\}', '{{blank}}', 'g') AS question_text,
    regexp_replace(q.answer_text, '\{\{[^}]*\}\}', '{{blank}}', 'g') AS answer_text,
    q.audio_text,
    q.options,
    q.matching_pairs,
    q.audio_clip_id,
    q.reading_passage_id,
    q.explanation,
    q.order_index,
    es.category
  FROM quiz_questions q
  JOIN exercise_sets es ON es.id = q.set_id
  JOIN lessons l ON l.id = q.lesson_id
  WHERE es.status = 'published'
    AND (l.status = 'published' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

GRANT SELECT ON quiz_questions_public TO authenticated;
```

- [ ] **Step 2: Apply migration lên production**

Dùng Supabase MCP `apply_migration` với tên `quiz_questions_set_id` và nội dung SQL ở Step 1.

- [ ] **Step 3: Verify bằng SQL**

Chạy lần lượt (tách riêng câu, không gộp `;` vì `execute_sql` chỉ trả kết quả câu cuối):

```sql
select count(*) from quiz_questions;
```
Kỳ vọng: `0`.

```sql
select column_name, is_nullable from information_schema.columns where table_name = 'quiz_questions' and column_name in ('set_id', 'category');
```
Kỳ vọng: 1 dòng — `set_id` với `is_nullable = 'NO'`. Không có dòng `category`.

```sql
select * from quiz_questions_public limit 1;
```
Kỳ vọng: không lỗi, trả rỗng.

- [ ] **Step 4: Regenerate `database.types.ts`**

Dùng Supabase MCP `generate_typescript_types`, ghi đè `src/lib/database.types.ts` — xác nhận `quiz_questions.Row` có `set_id: string`, không còn `category`; `quiz_questions_public.Row` có `set_id: string | null`, `category: string | null`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260731100000_quiz_questions_set_id.sql src/lib/database.types.ts
git commit -m "feat(db): quiz_questions mirror grammar_exercises — thêm set_id, bỏ category (Phase 4a)"
```

---

### Task 2: Regression toàn bộ

**Files:** không tạo/sửa file mới.

- [ ] **Step 1: Type check**

```bash
npm run lint
```

Kỳ vọng: **có lỗi** ở `AdminQuizSection.tsx`/`QuizPage.tsx`/`useQuizQuestions.ts` — đúng như dự đoán trong spec (dùng cột `category` đã xoá, hoặc insert thiếu `set_id`). Đây là trạng thái trung gian có chủ đích của Phase 4a — KHÔNG sửa các file này ở đây (thuộc 4c/4d). Ghi lại chính xác danh sách lỗi vào phần báo cáo cuối task để 4c/4d biết trước cần sửa gì.

- [ ] **Step 2: Chạy test suite hiện có**

```bash
npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts" tests/e2e/admin-classification-fields.playwright.test.ts
```

Kỳ vọng: pass toàn bộ — không có test nào phụ thuộc `quiz_questions.category` hay `AdminQuizSection`/`QuizPage` (đây là thay đổi schema thuần, các test hiện có đều thuộc phần Grammar/Admin phân loại, không liên quan).

- [ ] **Step 3: Không chạy `npm run build`**

Build sẽ fail do lỗi type ở Step 1 — đúng dự kiến, bỏ qua, không phải lỗi cần fix ở task này.
