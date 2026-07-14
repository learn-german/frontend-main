-- =============================================================================
-- DeutschPath — per-user level access (which of A1/A2/B1/B2 a learner can see)
-- =============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS unlocked_levels TEXT[] NOT NULL DEFAULT ARRAY['A1']::text[];

-- Backfill: a user who has already completed lessons in a level keeps access
-- to it — without this, the DEFAULT above would silently re-lock levels
-- existing users had already unlocked by progressing through them.
UPDATE profiles p
SET unlocked_levels = (
  SELECT array_agg(DISTINCT l.level)
  FROM lesson_progress lp
  JOIN lessons l ON l.id = lp.lesson_id
  WHERE lp.user_id = p.id
) || ARRAY['A1']::text[]
WHERE EXISTS (
  SELECT 1 FROM lesson_progress lp WHERE lp.user_id = p.id
);
