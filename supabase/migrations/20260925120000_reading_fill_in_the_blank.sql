-- Dạng bài đọc "Điền vào ô trống": cùng shape sub_questions với trắc nghiệm
-- (options + correct_option_id), learner chọn cụm từ từ dropdown.

ALTER TABLE reading_question_groups DROP CONSTRAINT reading_question_groups_question_type_check;
ALTER TABLE reading_question_groups
  ADD CONSTRAINT reading_question_groups_question_type_check
  CHECK (question_type IN ('richtig_falsch', 'multiple_choice', 'fill_in_the_blank'));

ALTER TABLE reading_question_groups DROP CONSTRAINT reading_question_groups_body_shape;
ALTER TABLE reading_question_groups
  ADD CONSTRAINT reading_question_groups_body_shape CHECK (
    (question_type = 'richtig_falsch' AND statements IS NOT NULL AND sub_questions IS NULL)
    OR
    (question_type IN ('multiple_choice', 'fill_in_the_blank') AND sub_questions IS NOT NULL AND statements IS NULL)
  );
