-- =============================================================================
-- DeutschPath — grammar_exercises: dạng thứ 8 `multiple_choice`
-- Trắc nghiệm một đáp án đúng, số phương án linh hoạt (>= 2).
-- options JSONB = mảng chuỗi theo thứ tự hiển thị (nhãn A/B/C sinh ở client).
-- Đáp án đúng dùng lại cột correct_answer, lưu index dạng chuỗi ("0", "1", ...).
-- =============================================================================

ALTER TABLE grammar_exercises
  DROP CONSTRAINT grammar_exercises_type_check,
  ADD CONSTRAINT grammar_exercises_type_check CHECK (type IN (
    'word_reorder',
    'error_correction',
    'translation',
    'sentence_transformation',
    'guided_sentence_writing',
    'classification',
    'fill_in_the_blank',
    'multiple_choice'
  )),
  ADD COLUMN options JSONB,
  ADD CONSTRAINT grammar_exercises_options_shape
    CHECK (
      options IS NULL
      OR (
        jsonb_typeof(options) = 'array'
        AND jsonb_array_length(options) >= 2
      )
    );

DROP VIEW IF EXISTS grammar_exercises_public;

CREATE VIEW grammar_exercises_public AS
  SELECT
    g.id,
    g.lesson_id,
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
  JOIN lessons l ON l.id = g.lesson_id
  WHERE g.status = 'published'
    AND (l.status = 'published' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

GRANT SELECT ON grammar_exercises_public TO authenticated;
