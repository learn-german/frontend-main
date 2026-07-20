-- =============================================================================
-- DeutschPath — grammar_exercises_public: bổ sung group_id vào view public
-- để phía học viên gom đúng ranh giới "câu cha / câu con" theo đợt tạo,
-- thay vì gom theo type. Mirror lại view gốc, chỉ thêm 1 cột.
-- =============================================================================

DROP VIEW IF EXISTS grammar_exercises_public;

CREATE VIEW grammar_exercises_public AS
  SELECT
    g.id,
    g.lesson_id,
    g.type,
    g.group_id,
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
