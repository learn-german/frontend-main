-- =============================================================================
-- Gộp Nghe/Đọc vào grammar_exercises thay vì module quiz_questions riêng —
-- tái dùng nguyên grammar-submit/GrammarExercisePage thay vì xây song song.
-- Xoá hẳn quiz_questions (dữ liệu đã trống từ migration trước).
-- =============================================================================

DROP VIEW IF EXISTS quiz_questions_public;
DROP TABLE IF EXISTS quiz_questions;

ALTER TABLE grammar_exercises
  ADD COLUMN audio_clip_id UUID REFERENCES listening_clips(id) ON DELETE SET NULL,
  ADD COLUMN reading_passage_id UUID REFERENCES reading_passages(id) ON DELETE SET NULL,
  ADD COLUMN matching_pairs JSONB,
  DROP CONSTRAINT grammar_exercises_type_check,
  ADD CONSTRAINT grammar_exercises_type_check CHECK (type IN (
    'word_reorder', 'error_correction', 'translation', 'sentence_transformation',
    'guided_sentence_writing', 'classification', 'fill_in_the_blank', 'multiple_choice',
    'text_fill_blank', 'matching'
  )),
  ADD CONSTRAINT grammar_exercises_matching_pairs_shape
    CHECK (
      matching_pairs IS NULL
      OR (jsonb_typeof(matching_pairs) = 'array' AND jsonb_array_length(matching_pairs) >= 1)
    );

DROP VIEW IF EXISTS grammar_exercises_public;

CREATE VIEW grammar_exercises_public AS
  SELECT
    g.id,
    g.lesson_id,
    g.set_id,
    g.type,
    g.group_id,
    g.hint,
    regexp_replace(g.prompt_text, '\{\{[^}]*\}\}', '{{blank}}', 'g') AS prompt_text,
    g.transformation_hint,
    g.tokens,
    g.classification_groups,
    (
      SELECT jsonb_agg(elem ->> 'item')
      FROM jsonb_array_elements(g.classification_items) elem
    ) AS classification_items,
    g.word_bank,
    g.options,
    g.matching_pairs,
    g.audio_clip_id,
    g.reading_passage_id,
    g.order_index,
    es.category
  FROM grammar_exercises g
  JOIN exercise_sets es ON es.id = g.set_id
  JOIN lessons l ON l.id = g.lesson_id
  WHERE es.status = 'published'
    AND (l.status = 'published' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

GRANT SELECT ON grammar_exercises_public TO authenticated;
