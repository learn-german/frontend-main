-- =============================================================================
-- Xoá dạng bài "text_fill_blank" (nhãn UI "Điền vào chỗ trống") — chưa từng có
-- exercise/attempt thật nào dùng type này (xác nhận qua execute_sql trước khi
-- viết migration này), không cần backfill/migrate dữ liệu.
-- =============================================================================

ALTER TABLE grammar_exercises
  DROP CONSTRAINT grammar_exercises_type_check,
  ADD CONSTRAINT grammar_exercises_type_check CHECK (type IN (
    'word_reorder', 'error_correction', 'translation', 'sentence_transformation',
    'guided_sentence_writing', 'classification', 'fill_in_the_blank', 'multiple_choice',
    'matching'
  ));

DROP VIEW IF EXISTS grammar_exercises_public;

-- Bỏ regexp_replace che prompt_text: chỉ tồn tại để giấu đáp án nhúng trong
-- {{...}} của text_fill_blank (correct_answer nằm ngay trong prompt_text, khác
-- các type khác lưu đáp án ở cột riêng). Type đó không còn tồn tại nên không
-- còn dữ liệu nào khớp pattern {{...}} — regex thành thừa.
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
