-- =============================================================================
-- Phase 4a — quiz_questions mirror đúng cấu trúc grammar_exercises: thêm
-- set_id, bỏ category (suy ra từ exercise_sets.category). Dữ liệu cũ (3 câu
-- "đọc") bị xoá vì chưa có set_id để gắn vào — đã được xác nhận, ứng dụng
-- chưa có user thật dùng tính năng Nghe/Đọc.
-- =============================================================================

DROP VIEW IF EXISTS quiz_questions_public;

DELETE FROM quiz_questions;

ALTER TABLE quiz_questions
  ADD COLUMN set_id UUID NOT NULL REFERENCES exercise_sets(id) ON DELETE CASCADE,
  DROP COLUMN category;

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
