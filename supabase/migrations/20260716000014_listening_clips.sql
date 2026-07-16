-- =============================================================================
-- DeutschPath — multi-audio listening clips: listening_clips table,
-- quiz_questions.audio_clip_id, backfill from existing single-audio lessons.
-- =============================================================================

-- 1. listening_clips: 1 lesson can now have multiple mp3 files (clips).
CREATE TABLE listening_clips (
  id          UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id   TEXT    NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  r2_key      TEXT    NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE listening_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listening_clips: authenticated read"
  ON listening_clips FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "listening_clips: admin write"
  ON listening_clips FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 2. quiz_questions: link Nghe questions to a specific clip. Deleting a
--    clip cascades to delete its questions (admin UI relies on this instead
--    of manually deleting each question first).
ALTER TABLE quiz_questions
  ADD COLUMN audio_clip_id UUID REFERENCES listening_clips(id) ON DELETE CASCADE;

-- 3. quiz_questions_public view: add audio_clip_id (still no correct_answer).
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
    explanation,
    order_index
  FROM quiz_questions;

GRANT SELECT ON quiz_questions_public TO authenticated;

-- 4. Backfill: lessons that already have a single audio_r2_key (from before
--    multi-clip support) get one listening_clips row created from it, and
--    their existing 'nghe' questions (which had no clip link before) get
--    reassigned to that new clip — preserves already-uploaded real audio
--    and already-authored questions (e.g. lesson a1-l1).
INSERT INTO listening_clips (lesson_id, r2_key, order_index)
SELECT id, audio_r2_key, 0
FROM lessons
WHERE audio_r2_key IS NOT NULL;

UPDATE quiz_questions q
SET audio_clip_id = lc.id
FROM listening_clips lc
WHERE q.category = 'nghe'
  AND q.lesson_id = lc.lesson_id
  AND q.audio_clip_id IS NULL;
