-- =============================================================================
-- Phase 6a — bảng nhóm câu hỏi đọc (richtig_falsch/multiple_choice), gắn vào
-- văn bản (reading_passages, tái dùng) qua passage_id, và vào exercise_sets
-- qua set_id để tái dùng draft/publish/reorder. Xem
-- docs/superpowers/specs/2026-08-10-reading-exercise-admin-design.md.
--
-- Xoá sạch dữ liệu Đọc cũ (category=doc trong grammar_exercises, toàn bộ
-- reading_passages hiện có) — chưa có người dùng thật, không cần migrate.
-- =============================================================================

DELETE FROM grammar_exercises
WHERE set_id IN (SELECT id FROM exercise_sets WHERE category = 'doc');

DELETE FROM reading_passages;

CREATE TABLE reading_question_groups (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  passage_id     UUID NOT NULL REFERENCES reading_passages(id) ON DELETE CASCADE,
  set_id         UUID NOT NULL REFERENCES exercise_sets(id) ON DELETE CASCADE,
  order_index    INTEGER NOT NULL DEFAULT 0,
  title          TEXT,
  question_intro TEXT,
  question_type  TEXT NOT NULL CHECK (question_type IN ('richtig_falsch', 'multiple_choice')),
  statements     JSONB,
  sub_questions  JSONB,
  explanation    TEXT,
  CONSTRAINT reading_question_groups_body_shape CHECK (
    (question_type = 'richtig_falsch' AND statements IS NOT NULL AND sub_questions IS NULL)
    OR
    (question_type = 'multiple_choice' AND sub_questions IS NOT NULL AND statements IS NULL)
  )
);

ALTER TABLE reading_question_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reading_question_groups: admin only"
  ON reading_question_groups FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
