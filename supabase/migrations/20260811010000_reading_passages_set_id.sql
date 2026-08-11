-- =============================================================================
-- Revert 20260811000000 (exercise_sets.passage_id, 1:1) — sai hướng, chặn yêu
-- cầu "1 bài đọc có nhiều văn bản". Đổi sang reading_passages.set_id (N:1):
-- 1 exercise_sets (category=doc) chứa nhiều reading_passages.
-- Xem docs/superpowers/specs/2026-08-11-reading-exercise-multi-passage-design.md.
--
-- Dữ liệu Đọc hiện có toàn rác test rỗng (đã xác nhận qua execute_sql trước khi
-- viết migration này) — xoá thẳng, không backfill, giống quyết định gốc ở
-- 20260810120000_reading_question_groups.sql.
-- =============================================================================

DELETE FROM reading_question_groups;
DELETE FROM reading_passages;
DELETE FROM exercise_sets WHERE category = 'doc';

ALTER TABLE reading_passages
  ADD COLUMN set_id UUID REFERENCES exercise_sets(id) ON DELETE CASCADE;

ALTER TABLE exercise_sets
  DROP COLUMN passage_id;
