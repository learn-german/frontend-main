-- =============================================================================
-- DeutschPath — Admin role column on profiles + RLS policies
-- =============================================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

-- Drop existing SELECT policy if any, re-create with admin override
DROP POLICY IF EXISTS "profiles: own read" ON profiles;

CREATE POLICY "profiles: own read"
  ON profiles FOR SELECT
  USING (
    auth.uid() = id
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Admin can update any profile (for ban/role management)
CREATE POLICY "profiles: admin update"
  ON profiles FOR UPDATE
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Admin can read all user_stats
DROP POLICY IF EXISTS "user_stats: admin read" ON user_stats;
CREATE POLICY "user_stats: admin read"
  ON user_stats FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Admin can read all lesson_progress
DROP POLICY IF EXISTS "lesson_progress: admin read" ON lesson_progress;
CREATE POLICY "lesson_progress: admin read"
  ON lesson_progress FOR SELECT
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Admin can insert/update/delete quiz_questions (content management)
CREATE POLICY "quiz_questions: admin write"
  ON quiz_questions FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Admin can insert/update/delete lessons
CREATE POLICY "lessons: admin write"
  ON lessons FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Admin can insert/update/delete modules
CREATE POLICY "modules: admin write"
  ON modules FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
