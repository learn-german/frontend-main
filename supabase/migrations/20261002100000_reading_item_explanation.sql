-- Giải thích từng câu đọc nằm trong JSON. View học viên không được lộ field này.

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
      SELECT jsonb_agg(elem - 'correct_option_id' - 'accepted_answers' - 'explanation')
      FROM jsonb_array_elements(g.sub_questions) elem
    ) AS sub_questions,
    es.lesson_id
  FROM reading_question_groups g
  JOIN exercise_sets es ON es.id = g.set_id
  JOIN lessons l ON l.id = es.lesson_id
  WHERE es.status = 'published'
    AND (l.status = 'published' OR public.is_jwt_admin_or_tutor());
