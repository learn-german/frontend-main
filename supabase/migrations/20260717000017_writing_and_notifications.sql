-- 1. Writing prompt column on lessons (mirrors grammar_md/speaking_md pattern).
ALTER TABLE lessons ADD COLUMN writing_prompt_md TEXT;

-- 2. writing_submissions: one submission per (lesson_id, user_id), overwritten
--    on resubmit. user_id references profiles(id) (not auth.users(id)
--    directly) so the admin grading UI can nested-select profiles(email,
--    full_name) in one query, matching the pattern AdminUsersSection.tsx
--    already uses for user_stats.
CREATE TABLE writing_submissions (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id    TEXT        NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content      TEXT        NOT NULL,
  score        INTEGER,
  comment      TEXT,
  graded_at    TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, user_id)
);

ALTER TABLE writing_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "writing_submissions: own read"
  ON writing_submissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Students may only INSERT their own submission with score/comment/graded_at
-- left NULL — grading is admin-only, enforced by the WITH CHECK below.
CREATE POLICY "writing_submissions: own insert"
  ON writing_submissions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND score IS NULL AND comment IS NULL AND graded_at IS NULL);

-- Students may only UPDATE their own row (resubmit), and the new row must
-- again have score/comment/graded_at NULL — this is what makes "resubmit
-- resets grading" a server-enforced invariant, not just client behavior.
CREATE POLICY "writing_submissions: own resubmit"
  ON writing_submissions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND score IS NULL AND comment IS NULL AND graded_at IS NULL);

CREATE POLICY "writing_submissions: admin all"
  ON writing_submissions FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 3. notifications: broadcast-to-admins (for_admin=true, user_id NULL) or
--    targeted-to-one-user (user_id set, for_admin=false). user_id here
--    references auth.users(id) directly (not profiles) since no admin UI
--    ever needs to join this table against profiles — it only displays
--    the pre-built `message` text.
CREATE TABLE notifications (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  for_admin  BOOLEAN     NOT NULL DEFAULT false,
  type       TEXT        NOT NULL,
  lesson_id  TEXT        REFERENCES lessons(id) ON DELETE CASCADE,
  message    TEXT        NOT NULL,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ( (for_admin = true AND user_id IS NULL) OR (for_admin = false AND user_id IS NOT NULL) )
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications: own read"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "notifications: admin read broadcast"
  ON notifications FOR SELECT
  TO authenticated
  USING (for_admin = true AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "notifications: own update"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications: admin update broadcast"
  ON notifications FOR UPDATE
  TO authenticated
  USING (for_admin = true AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK (for_admin = true AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Deliberately NO INSERT policy on notifications at all — every row is
-- created exclusively by the two SECURITY DEFINER trigger functions below,
-- which bypass RLS by running with the function owner's elevated
-- privilege. A student can never forge a notification for another user or
-- a fake admin broadcast, because no role has direct INSERT access.

-- 4. Trigger: every INSERT or content-changing UPDATE on writing_submissions
--    creates one broadcast "writing_submitted" notification for admins.
CREATE OR REPLACE FUNCTION notify_writing_submitted()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (for_admin, type, lesson_id, message)
  VALUES (
    true,
    'writing_submitted',
    NEW.lesson_id,
    'Có bài viết mới cần chấm cho bài học ' || NEW.lesson_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_writing_submitted
  AFTER INSERT ON writing_submissions
  FOR EACH ROW
  EXECUTE FUNCTION notify_writing_submitted();

CREATE TRIGGER trg_notify_writing_resubmitted
  AFTER UPDATE OF content ON writing_submissions
  FOR EACH ROW
  WHEN (OLD.content IS DISTINCT FROM NEW.content)
  EXECUTE FUNCTION notify_writing_submitted();

-- 5. Trigger: an UPDATE that sets score (grading) creates one
--    "writing_graded" notification for the submitting student.
CREATE OR REPLACE FUNCTION notify_writing_graded()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO notifications (user_id, for_admin, type, lesson_id, message)
  VALUES (
    NEW.user_id,
    false,
    'writing_graded',
    NEW.lesson_id,
    'Bài viết của bạn đã được chấm điểm: ' || NEW.score || '/100'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_notify_writing_graded
  AFTER UPDATE OF score ON writing_submissions
  FOR EACH ROW
  WHEN (NEW.score IS NOT NULL AND OLD.score IS DISTINCT FROM NEW.score)
  EXECUTE FUNCTION notify_writing_graded();
