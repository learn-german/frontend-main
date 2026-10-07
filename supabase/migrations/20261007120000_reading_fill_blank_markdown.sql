-- Reading fill-blank dùng marker ___ giống ngữ pháp.
-- Legacy { question, accepted_answers } → thêm ___ nếu thiếu + blanks[].
-- View học viên strip blanks (chứa đáp án).

UPDATE reading_question_groups g
SET sub_questions = converted.items
FROM (
  SELECT
    id,
    (
      SELECT jsonb_agg(
        CASE
          WHEN elem ? 'blanks' THEN elem
          ELSE
            jsonb_build_object(
              'question',
              CASE
                WHEN COALESCE(elem->>'question', '') LIKE '%___%' THEN COALESCE(elem->>'question', '')
                WHEN COALESCE(elem->>'question', '') = '' THEN '___'
                ELSE trim(both FROM (elem->>'question')) || ' ___'
              END,
              'blanks',
              jsonb_build_array(
                jsonb_build_object(
                  'acceptedAnswers',
                  CASE
                    WHEN jsonb_typeof(elem->'accepted_answers') = 'array' THEN elem->'accepted_answers'
                    ELSE '[]'::jsonb
                  END
                )
              )
            )
            || CASE WHEN elem ? 'explanation' THEN jsonb_build_object('explanation', elem->'explanation') ELSE '{}'::jsonb END
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
      SELECT jsonb_agg(elem - 'correct_answer' - 'explanation')
      FROM jsonb_array_elements(g.statements) elem
    ) AS statements,
    (
      SELECT jsonb_agg(elem - 'correct_option_id' - 'accepted_answers' - 'blanks' - 'explanation')
      FROM jsonb_array_elements(g.sub_questions) elem
    ) AS sub_questions,
    es.lesson_id
  FROM reading_question_groups g
  JOIN exercise_sets es ON es.id = g.set_id
  JOIN lessons l ON l.id = es.lesson_id
  WHERE es.status = 'published'
    AND (l.status = 'published' OR public.is_jwt_admin_or_tutor());
