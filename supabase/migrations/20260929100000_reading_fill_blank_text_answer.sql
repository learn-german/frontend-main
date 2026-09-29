-- Điền vào ô trống là gõ chữ, không chọn phương án.
-- Câu đã lưu dạng phương án A/B/C được chuyển đáp án đúng thành accepted_answers.
-- View học viên strip accepted_answers.

UPDATE reading_question_groups g
SET sub_questions = converted.items
FROM (
  SELECT
    id,
    (
      SELECT jsonb_agg(
        CASE
          WHEN elem ? 'accepted_answers' THEN elem
          ELSE jsonb_build_object(
            'question', COALESCE(elem->>'question', ''),
            'accepted_answers',
            CASE
              WHEN jsonb_typeof(elem->'options') = 'array'
                AND (elem->>'correct_option_id') ~ '^[0-9]+$'
                AND elem->'options'->((elem->>'correct_option_id')::int) IS NOT NULL
              THEN jsonb_build_array(elem->'options'->((elem->>'correct_option_id')::int))
              ELSE '[]'::jsonb
            END
          )
        END
      )
      FROM jsonb_array_elements(sub_questions) elem
    ) AS items
  FROM reading_question_groups
  WHERE question_type = 'fill_in_the_blank'
    AND sub_questions IS NOT NULL
) converted
WHERE g.id = converted.id
  AND converted.items IS NOT NULL;

CREATE OR REPLACE VIEW reading_question_groups_public AS
  SELECT
    g.id,
    g.passage_id,
    g.set_id,
    g.order_index,
    g.title,
    g.question_intro,
    g.question_type,
    (
      SELECT jsonb_agg(elem - 'correct_answer')
      FROM jsonb_array_elements(g.statements) elem
    ) AS statements,
    (
      SELECT jsonb_agg(elem - 'correct_option_id' - 'accepted_answers')
      FROM jsonb_array_elements(g.sub_questions) elem
    ) AS sub_questions,
    es.lesson_id
  FROM reading_question_groups g
  JOIN exercise_sets es ON es.id = g.set_id
  JOIN lessons l ON l.id = es.lesson_id
  WHERE es.status = 'published'
    AND (l.status = 'published' OR public.is_jwt_admin_or_tutor());

  SELECT
    g.id,
    g.passage_id,
    g.set_id,
    g.order_index,
    g.title,
    g.question_intro,
    g.question_type,
    (
      SELECT jsonb_agg(elem - 'correct_answer')
      FROM jsonb_array_elements(g.statements) elem
    ) AS statements,
    (
      SELECT jsonb_agg(elem - 'correct_option_id' - 'accepted_answers')
      FROM jsonb_array_elements(g.sub_questions) elem
    ) AS sub_questions,
    es.lesson_id
  FROM reading_question_groups g
  JOIN exercise_sets es ON es.id = g.set_id
  JOIN lessons l ON l.id = es.lesson_id
  WHERE es.status = 'published'
    AND (l.status = 'published' OR public.is_jwt_admin_or_tutor());
