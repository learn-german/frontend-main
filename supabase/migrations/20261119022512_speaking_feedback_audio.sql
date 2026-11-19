ALTER TABLE public.speaking_submissions
  ADD COLUMN feedback_object_key text UNIQUE,
  ADD COLUMN feedback_file_name text,
  ADD CONSTRAINT speaking_feedback_pair CHECK ((feedback_object_key IS NULL) = (feedback_file_name IS NULL)),
  ADD CONSTRAINT speaking_feedback_name CHECK (length(feedback_file_name) BETWEEN 1 AND 255),
  ADD CONSTRAINT speaking_feedback_graded CHECK (feedback_object_key IS NULL OR graded_at IS NOT NULL),
  ADD CONSTRAINT speaking_feedback_namespace CHECK (
    feedback_object_key ~ ('^feedback/' || id::text || '/[a-f0-9-]+\.(mp3|m4a|wav|webm|ogg)$'));

CREATE OR REPLACE FUNCTION public.enforce_speaking_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.lesson_id, NEW.user_id, NEW.object_key, NEW.file_name, NEW.note, NEW.submitted_at)
      IS DISTINCT FROM (OLD.id, OLD.lesson_id, OLD.user_id, OLD.object_key, OLD.file_name, OLD.note, OLD.submitted_at) THEN
      RAISE EXCEPTION 'speaking submission is immutable' USING ERRCODE = '23514';
    END IF;
    -- Serialize attachment with cleanup, including an upload/update response lost in transit.
    PERFORM pg_advisory_xact_lock(hashtextextended('speaking-feedback/' || NEW.id::text, 0));
    IF NEW.feedback_object_key IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM storage.objects WHERE bucket_id = 'speaking-recordings' AND name = NEW.feedback_object_key
    ) THEN
      RAISE EXCEPTION 'speaking feedback recording not found' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.feedback_object_key IS NOT NULL OR NEW.feedback_file_name IS NOT NULL THEN
    RAISE EXCEPTION 'speaking feedback requires staff grading' USING ERRCODE = '23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));
  IF (SELECT count(*) FROM public.speaking_submissions WHERE user_id = NEW.user_id AND lesson_id = NEW.lesson_id) >= 2 THEN
    RAISE EXCEPTION 'speaking attempt limit reached' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'speaking-recordings' AND name = NEW.object_key) THEN
    RAISE EXCEPTION 'speaking recording not found' USING ERRCODE = '23514';
  END IF;
  NEW.submitted_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_speaking_submission() FROM PUBLIC, anon, authenticated;

CREATE POLICY "speaking feedback: staff upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'speaking-recordings' AND public.is_jwt_admin_or_tutor()
    AND name ~ '^feedback/[a-f0-9-]{36}/[a-f0-9-]+\.(mp3|m4a|wav|webm|ogg)$'
    AND EXISTS (SELECT 1 FROM public.speaking_submissions WHERE id::text = (storage.foldername(name))[2]));
CREATE POLICY "speaking feedback: attached owner or staff read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'speaking-recordings'
    AND name ~ '^feedback/[a-f0-9-]{36}/[a-f0-9-]+\.(mp3|m4a|wav|webm|ogg)$'
    AND EXISTS (SELECT 1 FROM public.speaking_submissions
      WHERE (public.is_jwt_admin_or_tutor() AND id::text = (storage.foldername(name))[2])
        OR (user_id = auth.uid() AND feedback_object_key = name)));
-- Volatile statements recheck references after the lock, rather than using the DELETE snapshot.
CREATE FUNCTION public.can_delete_speaking_feedback(object_path text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_jwt_admin_or_tutor() OR object_path IS NULL
    OR object_path !~ '^feedback/[a-f0-9-]{36}/[a-f0-9-]+\.(mp3|m4a|wav|webm|ogg)$' THEN
    RETURN false;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'speaking-feedback/' || pg_catalog.split_part(object_path, '/', 2), 0));
  RETURN NOT EXISTS (SELECT 1 FROM public.speaking_submissions WHERE feedback_object_key = object_path);
END;
$$;
REVOKE ALL ON FUNCTION public.can_delete_speaking_feedback(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_delete_speaking_feedback(text) TO authenticated;
CREATE POLICY "speaking feedback: staff remove unused" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'speaking-recordings' AND public.can_delete_speaking_feedback(name));
