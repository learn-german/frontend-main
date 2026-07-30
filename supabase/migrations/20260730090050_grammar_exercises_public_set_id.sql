-- =============================================================================
-- DeutschPath — grammar_exercises_public: đổi filter published/draft từ cột
-- status trên từng câu (sắp xóa ở migration backfill kế tiếp) sang status
-- của exercise_sets. Thêm set_id vào SELECT list — chưa dùng ở frontend,
-- chuẩn bị sẵn cho Phase 2.
--
-- Áp TRƯỚC migration backfill (không phải sau như dự kiến ban đầu trong
-- plan) vì DROP COLUMN status sẽ fail nếu view cũ còn phụ thuộc cột đó.
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
