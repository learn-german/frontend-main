-- Switch writing_submissions from one-row-per-(lesson,user) upsert to a
-- multi-attempt model: each "Nộp bài" INSERTs a new attempt row, capped at 6
-- per (lesson_id, user_id). Students never UPDATE content anymore (each
-- submission is a fresh attempt); admins still grade via UPDATE of
-- score/comment on a specific row.

-- 1. Allow multiple attempts: drop the uniqueness that forced upsert.
ALTER TABLE writing_submissions DROP CONSTRAINT writing_submissions_lesson_id_user_id_key;

-- 2. Server-enforced 6-attempt cap.
CREATE OR REPLACE FUNCTION enforce_writing_attempt_limit()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM writing_submissions
      WHERE lesson_id = NEW.lesson_id AND user_id = NEW.user_id) >= 6 THEN
    RAISE EXCEPTION 'writing attempt limit reached'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_writing_attempt_limit
  BEFORE INSERT ON writing_submissions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_writing_attempt_limit();

-- 3. Students are INSERT-only now — drop the resubmit UPDATE policy and the
--    resubmit-notify trigger (there are no content updates by students).
DROP POLICY "writing_submissions: own resubmit" ON writing_submissions;
DROP TRIGGER trg_notify_writing_resubmitted ON writing_submissions;
