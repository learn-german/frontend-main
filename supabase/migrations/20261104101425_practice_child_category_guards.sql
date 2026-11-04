CREATE OR REPLACE FUNCTION public.enforce_practice_parent() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE parent public.lessons; set_row public.exercise_sets; BEGIN
 IF TG_TABLE_NAME='lessons' THEN
  IF TG_OP='UPDATE' AND (NEW.content_scope IS DISTINCT FROM OLD.content_scope OR
   (OLD.content_scope='practice' AND (NEW.practice_category IS DISTINCT FROM OLD.practice_category OR NEW.level IS DISTINCT FROM OLD.level))) THEN
   RAISE EXCEPTION 'content scope, practice category and level are immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.next_lesson_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.lessons WHERE id=NEW.next_lesson_id AND content_scope='practice') THEN
   RAISE EXCEPTION 'practice cannot be a course successor' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 SELECT * INTO parent FROM public.lessons WHERE id=NEW.lesson_id;
 IF TG_TABLE_NAME='exercise_sets' THEN
  IF parent.content_scope='practice' AND NEW.audio_clip_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM public.listening_clips c WHERE c.id=NEW.audio_clip_id AND c.lesson_id=NEW.lesson_id) THEN
   RAISE EXCEPTION 'practice audio must belong to topic' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.lesson_id IS DISTINCT FROM OLD.lesson_id AND
   (parent.content_scope='practice' OR EXISTS(SELECT 1 FROM public.lessons WHERE id=OLD.lesson_id AND content_scope='practice')) THEN
   RAISE EXCEPTION 'practice set topic is immutable' USING ERRCODE='23514';
  END IF;
  IF parent.content_scope='practice' AND NEW.category<>parent.practice_category THEN
   RAISE EXCEPTION 'practice set must inherit topic category' USING ERRCODE='23514';
  END IF;
 ELSIF TG_TABLE_NAME='lesson_progress' THEN
  IF parent.content_scope='practice' THEN RAISE EXCEPTION 'practice cannot update lesson progress' USING ERRCODE='23514'; END IF;
 ELSIF parent.content_scope='practice' AND NEW.set_id IS NULL THEN
  RAISE EXCEPTION 'practice content requires a set' USING ERRCODE='23514';
 ELSIF NEW.set_id IS NOT NULL THEN
  SELECT * INTO set_row FROM public.exercise_sets WHERE id=NEW.set_id;
  IF parent.content_scope='practice' OR EXISTS(SELECT 1 FROM public.lessons WHERE id=set_row.lesson_id AND content_scope='practice') THEN
   IF (TG_TABLE_NAME='reading_passages' AND set_row.category<>'doc') OR
      (TG_TABLE_NAME='grammar_exercises' AND set_row.category='doc') THEN
    RAISE EXCEPTION 'practice content must match set category' USING ERRCODE='23514';
   END IF;
   IF set_row.lesson_id IS DISTINCT FROM NEW.lesson_id THEN
    RAISE EXCEPTION 'practice child must belong to its set topic' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_practice_reading_group() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF (EXISTS(SELECT 1 FROM public.exercise_sets s JOIN public.lessons l ON l.id=s.lesson_id
  WHERE s.id=NEW.set_id AND l.content_scope='practice') OR EXISTS(SELECT 1 FROM public.reading_passages p JOIN public.lessons l ON l.id=p.lesson_id
  WHERE p.id=NEW.passage_id AND l.content_scope='practice')) AND NOT EXISTS(
  SELECT 1 FROM public.reading_passages p WHERE p.id=NEW.passage_id AND p.set_id=NEW.set_id) THEN
  RAISE EXCEPTION 'practice reading question must use its set passage' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
