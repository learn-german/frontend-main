-- =============================================================================
-- DeutschPath — exercise category (nguphap/nghe/doc) on quiz_questions +
-- lesson_progress, so future Listening/Reading exercises can reuse the
-- existing quiz mechanism without their scores overwriting each other.
-- =============================================================================

-- 1. quiz_questions: tag every question with which exercise category it
--    belongs to. Existing rows (all currently serving the "Quiz" tab)
--    backfill to 'nguphap' via the DEFAULT.
ALTER TABLE quiz_questions
  ADD COLUMN category TEXT NOT NULL DEFAULT 'nguphap'
  CHECK (category IN ('nguphap', 'nghe', 'doc'));

-- 2. quiz_questions_public view: add category (still no correct_answer).
DROP VIEW IF EXISTS quiz_questions_public;

CREATE VIEW quiz_questions_public AS
  SELECT
    id,
    lesson_id,
    type,
    category,
    question_text,
    audio_text,
    options,
    matching_pairs,
    explanation,
    order_index
  FROM quiz_questions;

GRANT SELECT ON quiz_questions_public TO authenticated;

-- 3. lesson_progress: each exercise category gets its own score row instead
--    of all categories sharing one (user_id, lesson_id) row. Existing rows
--    (all currently from the "Quiz"/completion flow) backfill to 'nguphap'
--    via the DEFAULT, then become part of the new composite primary key.
ALTER TABLE lesson_progress
  ADD COLUMN category TEXT NOT NULL DEFAULT 'nguphap'
  CHECK (category IN ('nguphap', 'nghe', 'doc'));

ALTER TABLE lesson_progress DROP CONSTRAINT lesson_progress_pkey;
ALTER TABLE lesson_progress ADD PRIMARY KEY (user_id, lesson_id, category);
