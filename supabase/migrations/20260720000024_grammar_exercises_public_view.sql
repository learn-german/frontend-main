-- =============================================================================
-- DeutschPath — grammar_exercises_public: view cho phía học viên, ẩn
-- correct_answer và group đúng trong classification_items (chỉ lộ tên item).
-- Mirror quiz_questions_public.
-- =============================================================================

DROP VIEW IF EXISTS grammar_exercises_public;

CREATE VIEW grammar_exercises_public AS
  SELECT
    g.id,
    g.lesson_id,
    g.type,
    g.prompt_text,
    g.transformation_hint,
    g.tokens,
    g.classification_groups,
    (
      SELECT jsonb_agg(elem ->> 'item')
      FROM jsonb_array_elements(g.classification_items) elem
    ) AS classification_items,
    g.explanation,
    g.order_index
  FROM grammar_exercises g
  JOIN lessons l ON l.id = g.lesson_id
  WHERE g.status = 'published'
    AND (l.status = 'published' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

GRANT SELECT ON grammar_exercises_public TO authenticated;
