-- Strip {{...}} answer markers from question_text in the public view,
-- unconditionally for ALL rows regardless of `type` — this is a
-- deliberate security choice: if an admin changes a question's `type`
-- away from 'fill-blank' while {{...}} markers are still present in
-- question_text, the raw answer must still never leak through this view.
DROP VIEW IF EXISTS quiz_questions_public;

CREATE VIEW quiz_questions_public AS
  SELECT
    id,
    lesson_id,
    type,
    category,
    regexp_replace(question_text, '\{\{[^}]*\}\}', '{{blank}}', 'g') AS question_text,
    audio_text,
    options,
    matching_pairs,
    audio_clip_id,
    reading_passage_id,
    explanation,
    order_index
  FROM quiz_questions;

GRANT SELECT ON quiz_questions_public TO authenticated;
