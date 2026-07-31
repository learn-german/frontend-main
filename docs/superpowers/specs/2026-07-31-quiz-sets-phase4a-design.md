# Phase 4a — Data model: gắn `quiz_questions` vào `exercise_sets` — Spec

## Bối cảnh

Nghe/Đọc hiện dùng hệ thống cũ tách biệt (`quiz_questions`, Edge Function
`quiz-submit`, `QuizPage.tsx`) — chấm điểm theo cả lesson, không có "bộ bài
tập", không draft, không reveal-ở-lần-5, và có bug làm tròn BR-02 giống bug
đã sửa ở Grammar. Phase 4 hợp nhất Nghe/Đọc vào đúng hệ thống đã xây cho
Ngữ pháp (`exercise_sets`/`exercise_set_attempts`/`exercise_set_drafts`),
chia làm 4 sub-phase: 4a data model → 4b submit logic → 4c learner UI → 4d
admin UI. Spec này là **4a**.

Dữ liệu `quiz_questions` hiện có rất ít (3 câu "đọc", 0 câu "nghe") — đã
được xác nhận xoá sạch, không cần backfill/giữ lại (khác Phase 1 grammar,
vốn phải backfill vì có dữ liệu thật).

## Thay đổi schema

`exercise_sets` / `exercise_set_attempts` / `exercise_set_drafts` đã
category-agnostic từ đầu (CHECK constraint `category` đã cho phép
`'nguphap'`, `'nghe'`, `'doc'`) — **không đổi gì** ở 3 bảng này.

`quiz_questions` — mirror đúng cấu trúc `grammar_exercises` đã có (thêm
`set_id`, bỏ `category` vì suy ra được từ `exercise_sets.category`):

```sql
DELETE FROM quiz_questions;

ALTER TABLE quiz_questions
  ADD COLUMN set_id UUID NOT NULL REFERENCES exercise_sets(id) ON DELETE CASCADE,
  DROP COLUMN category;
```

Không cần bước "nullable → backfill → not null" như Phase 1 vì bảng rỗng
sau `DELETE` — thêm thẳng `NOT NULL`.

`reading_passages` / `listening_clips` — giữ nguyên, không phụ thuộc
`set_id` (media/passage vẫn scope theo `lesson_id` như cũ).

## View `quiz_questions_public`

Đổi điều kiện lọc từ "status của từng câu" (không còn tồn tại) sang
"status của set", đúng pattern `grammar_exercises_public`:

```sql
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

Giữ `category` trong view (suy ra từ `es.category`) để không phải sửa
`appTypes.QuizQuestion`/`useQuizQuestions` ngay ở sub-phase này.

## RLS

`quiz_questions` giữ nguyên policy hiện có (`admin write`, `FOR ALL`,
không có SELECT cho user thường) — học viên đọc qua view, view được tạo
bởi role bypass RLS, đúng pattern đã dùng cho `grammar_exercises`/
`grammar_exercises_public` từ Phase 1. Không cần thêm policy SELECT nào
(khác với bug đã gặp ở `exercise_sets` — bảng đó bị đọc TRỰC TIẾP từ
client qua `useExerciseSets()`, còn `quiz_questions` học viên chỉ đọc qua
view, không đọc bảng gốc trực tiếp).

## Ảnh hưởng tạm thời

`AdminQuizSection.tsx` sẽ lỗi ngay sau migration này (insert thiếu
`set_id` bắt buộc, và code vẫn gửi `category` — cột đã bị xoá) — chấp
nhận được, sẽ viết lại ở 4d. Không có tính năng học viên nào đang dùng
Nghe/Đọc bị ảnh hưởng thêm (QuizPage.tsx đã lỗi tương tự do view đổi cấu
trúc SELECT, nhưng dữ liệu hiện đang trống nên không ai đang thực sự dùng
tính năng này).

## Testing

Không có logic thuần mới (chỉ DDL) — không cần unit test. Verify bằng
SQL sau khi apply: `select * from quiz_questions_public limit 1;` không
lỗi (trả rỗng vì chưa có dữ liệu), và `\d quiz_questions` xác nhận đúng
cột `set_id NOT NULL`, không còn cột `category`.
