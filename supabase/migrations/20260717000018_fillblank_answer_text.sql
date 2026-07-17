-- Split fill-blank authoring into two fields going forward: question_text
-- becomes a plain prompt (no {{...}}), answer_text holds the {{...}}
-- blank sentence. Existing fill-blank rows are NOT backfilled — they keep
-- {{...}} in question_text and answer_text stays NULL. Both the view
-- below and the quiz-submit Edge Function apply the same fallback rule
-- (prefer answer_text, fall back to question_text when answer_text is
-- empty/NULL) so pre-existing questions keep working unmigrated.
ALTER TABLE quiz_questions ADD COLUMN answer_text TEXT;

-- Recreate the public view to also expose answer_text, stripped with the
-- same unconditional (type-independent) {{...}} -> {{blank}} regex as
-- question_text already uses. regexp_replace(NULL, ...) returns NULL in
-- Postgres, so rows with no answer_text keep passing through as NULL
-- (not ''), letting the client tell "no answer_text" apart from "empty
-- answer_text".
DROP VIEW IF EXISTS quiz_questions_public;

CREATE VIEW quiz_questions_public AS
  SELECT
    id,
    lesson_id,
    type,
    category,
    regexp_replace(question_text, '\{\{[^}]*\}\}', '{{blank}}', 'g') AS question_text,
    regexp_replace(answer_text, '\{\{[^}]*\}\}', '{{blank}}', 'g') AS answer_text,
    audio_text,
    options,
    matching_pairs,
    audio_clip_id,
    reading_passage_id,
    explanation,
    order_index
  FROM quiz_questions;

GRANT SELECT ON quiz_questions_public TO authenticated;
