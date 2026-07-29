-- Resubmitting while the previous attempt is still ungraded should overwrite
-- that attempt instead of burning one of the 6 slots. 20260726000002 made
-- students INSERT-only (it dropped the "own resubmit" UPDATE policy); this
-- migration gives the UPDATE path back, but only for a row that has not been
-- graded yet.

-- 1. Students may UPDATE their own submission only while it is still ungraded.
--    USING inspects the existing row (must be theirs and ungraded); WITH CHECK
--    inspects the new row (must stay theirs and stay ungraded), so a student
--    can never grade themselves and can never touch an already-graded attempt.
CREATE POLICY "writing_submissions: own overwrite ungraded"
  ON writing_submissions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() AND graded_at IS NULL)
  WITH CHECK (user_id = auth.uid() AND score IS NULL AND comment IS NULL AND graded_at IS NULL);

-- 2. WITH CHECK cannot compare against OLD, so it cannot stop a student from
--    re-pointing a pending row at a different lesson — which would move an
--    attempt between lessons and could push another lesson past the 6-attempt
--    cap (that cap trigger only fires BEFORE INSERT). Freeze the identity
--    columns on every UPDATE instead; nothing, including grading, changes them.
CREATE OR REPLACE FUNCTION freeze_writing_submission_identity()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lesson_id IS DISTINCT FROM OLD.lesson_id OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'writing submission cannot be moved to another lesson or user'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_freeze_writing_submission_identity
  BEFORE UPDATE ON writing_submissions
  FOR EACH ROW
  EXECUTE FUNCTION freeze_writing_submission_identity();

-- No resubmit-notify trigger is restored here on purpose: the admin's original
-- "cần chấm" notification for this attempt is still unread and still accurate,
-- so re-notifying on every overwrite would only duplicate it.
