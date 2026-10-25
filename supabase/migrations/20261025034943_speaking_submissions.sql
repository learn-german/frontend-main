CREATE TABLE public.speaking_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id text NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  object_key text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  note text CHECK (length(note) <= 2000),
  score integer CHECK (score BETWEEN 0 AND 100),
  comment text CHECK (length(comment) <= 10000),
  graded_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((score IS NULL) = (graded_at IS NULL)),
  CHECK (object_key ~ ('^' || user_id::text || '/[a-f0-9-]+\.(mp3|m4a|wav|webm|ogg)$'))
);
CREATE INDEX speaking_submissions_user_lesson ON public.speaking_submissions(user_id, lesson_id);
ALTER TABLE public.speaking_submissions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.speaking_submissions TO authenticated;

CREATE POLICY "speaking: owner or staff read" ON public.speaking_submissions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_jwt_admin_or_tutor());
CREATE POLICY "speaking: own insert" ON public.speaking_submissions
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid() AND score IS NULL AND comment IS NULL AND graded_at IS NULL
    AND EXISTS (SELECT 1 FROM public.lessons WHERE id = lesson_id AND status = 'published' AND coalesce(speaking_md, '') <> '')
  );
CREATE POLICY "speaking: staff grade" ON public.speaking_submissions
  FOR UPDATE TO authenticated
  USING (public.is_jwt_admin_or_tutor()) WITH CHECK (public.is_jwt_admin_or_tutor());

-- A per-user lock makes the two-attempt cap safe across concurrent browser tabs.
CREATE FUNCTION public.enforce_speaking_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.lesson_id, NEW.user_id, NEW.object_key, NEW.file_name, NEW.note, NEW.submitted_at)
      IS DISTINCT FROM (OLD.id, OLD.lesson_id, OLD.user_id, OLD.object_key, OLD.file_name, OLD.note, OLD.submitted_at) THEN
      RAISE EXCEPTION 'speaking submission is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
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
REVOKE ALL ON FUNCTION public.enforce_speaking_submission() FROM PUBLIC;
CREATE TRIGGER speaking_submission_guard BEFORE INSERT OR UPDATE ON public.speaking_submissions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_speaking_submission();

CREATE FUNCTION public.notify_speaking_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications(for_admin, type, lesson_id, message)
    VALUES (true, 'speaking_submitted', NEW.lesson_id, 'Có bài nói mới cần chấm cho bài học ' || NEW.lesson_id);
  ELSIF NEW.graded_at IS NOT NULL AND (NEW.score, NEW.comment, NEW.graded_at) IS DISTINCT FROM (OLD.score, OLD.comment, OLD.graded_at) THEN
    INSERT INTO public.notifications(user_id, for_admin, type, lesson_id, message)
    VALUES (NEW.user_id, false, 'speaking_graded', NEW.lesson_id, 'Bài nói của bạn đã được chấm điểm: ' || NEW.score || '/100');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_speaking_submission() FROM PUBLIC;
CREATE TRIGGER speaking_submission_notification AFTER INSERT OR UPDATE ON public.speaking_submissions
  FOR EACH ROW EXECUTE FUNCTION public.notify_speaking_submission();

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('speaking-recordings', 'speaking-recordings', false, 26214400,
  ARRAY['audio/mpeg','audio/mp4','audio/wav','audio/webm','audio/ogg']);

CREATE POLICY "speaking audio: own upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'speaking-recordings' AND (storage.foldername(name))[1] = auth.uid()::text
    AND name ~ ('^' || auth.uid()::text || '/[a-f0-9-]+\.(mp3|m4a|wav|webm|ogg)$'));
CREATE POLICY "speaking audio: owner or staff read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'speaking-recordings' AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (public.is_jwt_admin_or_tutor() AND EXISTS (SELECT 1 FROM public.speaking_submissions WHERE object_key = name))
  ));
-- Only failed, unsubmitted uploads may be removed by the uploader.
CREATE POLICY "speaking audio: remove unused upload" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'speaking-recordings' AND (storage.foldername(name))[1] = auth.uid()::text
    AND NOT EXISTS (SELECT 1 FROM public.speaking_submissions WHERE object_key = name));
