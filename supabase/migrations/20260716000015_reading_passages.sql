-- =============================================================================
-- DeutschPath — multi-passage reading exercises: reading_passages table,
-- quiz_questions.reading_passage_id, backfill from existing single-passage
-- lessons. No Vietnamese translation field (text_de only, per product
-- decision) — reading_text_vi is intentionally NOT migrated or read anywhere.
-- =============================================================================

-- 1. reading_passages: 1 lesson can now have multiple reading passages.
CREATE TABLE reading_passages (
  id          UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id   TEXT    NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  text_de     TEXT    NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE reading_passages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reading_passages: authenticated read"
  ON reading_passages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "reading_passages: admin write"
  ON reading_passages FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 2. quiz_questions: link Đọc questions to a specific passage. Deleting a
--    passage cascades to delete its questions (admin UI relies on this
--    instead of manually deleting each question first).
ALTER TABLE quiz_questions
  ADD COLUMN reading_passage_id UUID REFERENCES reading_passages(id) ON DELETE CASCADE;

-- 3. quiz_questions_public view: add reading_passage_id (still no correct_answer).
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
    audio_clip_id,
    reading_passage_id,
    explanation,
    order_index
  FROM quiz_questions;

GRANT SELECT ON quiz_questions_public TO authenticated;

-- 4. Backfill: lessons that already have a single reading_text (from before
--    multi-passage support) get one reading_passages row created from it
--    (text only, no VI translation carried over), and their existing 'doc'
--    questions (which had no passage link before) get reassigned to that
--    new passage — preserves already-authored content (e.g. lesson a1-l1).
INSERT INTO reading_passages (lesson_id, text_de, order_index)
SELECT id, reading_text, 0
FROM lessons
WHERE reading_text IS NOT NULL;

UPDATE quiz_questions q
SET reading_passage_id = rp.id
FROM reading_passages rp
WHERE q.category = 'doc'
  AND q.lesson_id = rp.lesson_id
  AND q.reading_passage_id IS NULL;
