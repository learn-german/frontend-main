ALTER TABLE grammar_exercises
  DROP CONSTRAINT grammar_exercises_type_check,
  ADD CONSTRAINT grammar_exercises_type_check CHECK (type IN (
    'word_reorder',
    'error_correction',
    'translation',
    'sentence_transformation',
    'guided_sentence_writing',
    'classification',
    'fill_in_the_blank'
  )),
  ADD COLUMN blanks JSONB,
  ADD COLUMN word_bank JSONB,
  ADD CONSTRAINT grammar_exercises_blanks_is_array
    CHECK (blanks IS NULL OR jsonb_typeof(blanks) = 'array'),
  ADD CONSTRAINT grammar_exercises_word_bank_shape
    CHECK (
      word_bank IS NULL
      OR (
        jsonb_typeof(word_bank) = 'object'
        AND jsonb_typeof(word_bank -> 'words') = 'array'
        AND word_bank ->> 'mode' IN ('single_use', 'multiple_use')
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
    g.explanation,
    g.order_index
  FROM grammar_exercises g
  JOIN lessons l ON l.id = g.lesson_id
  WHERE g.status = 'published'
    AND (l.status = 'published' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

GRANT SELECT ON grammar_exercises_public TO authenticated;
