-- =============================================================================
-- DeutschPath — Lesson draft/publish status + minimal-metadata position view
-- =============================================================================

-- 1. Add status column, backfill existing lessons as 'published' so nothing
--    currently visible to learners disappears when this migration runs.
ALTER TABLE lessons
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft', 'published'));

UPDATE lessons SET status = 'published';

-- 2. Restrict SELECT: non-admin only sees published lessons; admin sees all.
--    Replaces the previous unconditional "USING (true)" policy.
DROP POLICY IF EXISTS "lessons: authenticated read" ON lessons;

CREATE POLICY "lessons: authenticated read"
  ON lessons FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- 3. lesson_positions: minimal-metadata view exposing id/module_id/order_index
--    /status for EVERY lesson (including drafts), so the Roadmap can block
--    progression at the correct position without leaking draft content
--    (no title/video/vocabulary/grammar exposed here).
--
--    This view intentionally runs with the view owner's privileges (the
--    migration role), NOT the querying user's — same pattern already used
--    for quiz_questions_public (see supabase/migrations/20260624000003_helpers.sql).
--    That means it bypasses the base table's RLS policy above by design:
--    the only data exposed is 4 non-sensitive columns.
CREATE VIEW lesson_positions AS
  SELECT id, module_id, order_index, status FROM lessons;

GRANT SELECT ON lesson_positions TO authenticated;
