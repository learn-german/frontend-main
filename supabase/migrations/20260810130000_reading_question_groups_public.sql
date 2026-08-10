-- =============================================================================
-- Phase 6b — view công khai cho reading_question_groups, dùng cho đường đọc
-- của học viên (trang ReadingSetListPage) và cờ "đã có câu hỏi" (useModules,
-- AdminUsersSection). reading_question_groups gốc admin-only vì chứa đáp án
-- (correct_answer trong statements[], correct_option_id trong sub_questions[]).
-- View này strip 2 field đó bằng toán tử JSONB "-" (xoá key theo từng phần tử
-- mảng), chỉ lộ những gì học viên cần để hiển thị câu hỏi.
-- =============================================================================

CREATE VIEW reading_question_groups_public AS
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
      SELECT jsonb_agg(elem - 'correct_option_id')
      FROM jsonb_array_elements(g.sub_questions) elem
    ) AS sub_questions,
    es.lesson_id
  FROM reading_question_groups g
  JOIN exercise_sets es ON es.id = g.set_id
  JOIN lessons l ON l.id = es.lesson_id
  WHERE es.status = 'published'
    AND (l.status = 'published' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

GRANT SELECT ON reading_question_groups_public TO authenticated;
