-- Independent practice reuses exercise sets without course progress or rewards.
ALTER TABLE public.lessons
 ADD COLUMN content_scope text NOT NULL DEFAULT 'lesson' CHECK(content_scope IN ('lesson','practice')),
 ADD COLUMN practice_category text,
 ADD CONSTRAINT lessons_practice_shape CHECK(
  (content_scope='lesson' AND practice_category IS NULL) OR
  (content_scope='practice' AND practice_category IN ('nguphap','doc','nghe')
   AND practice_category IS NOT NULL AND module_id IS NULL AND next_lesson_id IS NULL AND xp_reward=0));
CREATE INDEX lessons_practice_catalog ON public.lessons(level,practice_category,order_index) WHERE content_scope='practice';

CREATE FUNCTION public.practice_can_read_level(p_level text) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (public.is_jwt_admin_or_tutor() OR EXISTS(
 SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND (
  (p.subscription_end_date IS NULL AND p_level='A1') OR
  (p.subscription_end_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND p_level=ANY(p.unlocked_levels)))))
$$;
REVOKE ALL ON FUNCTION public.practice_can_read_level(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_can_read_level(text) TO authenticated;

-- Definer is required to inspect sets whose raw transcription must stay private.
CREATE FUNCTION public.practice_can_read_set(p_set_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
 SELECT 1 FROM public.exercise_sets s JOIN public.lessons l ON l.id=s.lesson_id
 WHERE s.id=p_set_id AND (public.is_jwt_admin_or_tutor() OR
  (s.status='published' AND l.status='published' AND
   (l.content_scope='lesson' OR public.practice_can_read_level(l.level)))))
$$;
REVOKE ALL ON FUNCTION public.practice_can_read_set(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_can_read_set(uuid) TO authenticated;

CREATE FUNCTION public.practice_catalog()
RETURNS TABLE(topic_id text,topic_title text,topic_title_vi text,level text,category text,order_index integer,sets jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT l.id,l.title,l.title_vi,l.level,l.practice_category,l.order_index,
  jsonb_agg(jsonb_build_object('id',s.id,'lesson_id',s.lesson_id,'category',s.category,'title',s.title,
   'order_index',s.order_index,'status',s.status,'general_instruction',s.general_instruction,
   'audio_clip_id',s.audio_clip_id,'audio_r2_key',(SELECT c.r2_key FROM public.listening_clips c WHERE c.id=s.audio_clip_id AND c.lesson_id=l.id),'transcription',NULL,
   'question_types', CASE WHEN s.category='doc' THEN (SELECT jsonb_agg(DISTINCT q.question_type) FROM public.reading_question_groups q WHERE q.set_id=s.id)
    ELSE (SELECT jsonb_agg(DISTINCT q.type) FROM public.grammar_exercises q WHERE q.set_id=s.id) END,
   'passage_count',(SELECT count(*) FROM public.reading_passages p WHERE p.set_id=s.id),'question_count',
   CASE WHEN s.category='doc' THEN (SELECT coalesce(sum(jsonb_array_length(CASE WHEN q.question_type='richtig_falsch' THEN coalesce(q.statements,'[]'::jsonb) ELSE coalesce(q.sub_questions,'[]'::jsonb) END)),0) FROM public.reading_question_groups q WHERE q.set_id=s.id)
   ELSE (SELECT count(*) FROM public.grammar_exercises q WHERE q.set_id=s.id) END) ORDER BY s.order_index,s.id)
 FROM public.lessons l JOIN public.exercise_sets s ON s.lesson_id=l.id
 WHERE auth.uid() IS NOT NULL AND l.content_scope='practice' AND
  (public.is_jwt_admin_or_tutor() OR (l.status='published' AND s.status='published' AND public.practice_can_read_level(l.level) AND (EXISTS(SELECT 1 FROM public.grammar_exercises g WHERE g.set_id=s.id) OR EXISTS(SELECT 1 FROM public.reading_question_groups g WHERE g.set_id=s.id))))
 GROUP BY l.id ORDER BY l.order_index,l.id
$$;
REVOKE ALL ON FUNCTION public.practice_catalog() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_catalog() TO authenticated;
-- A restrictive policy also applies to existing permissive staff/read policies.
CREATE POLICY "lessons: practice access" ON public.lessons AS RESTRICTIVE FOR SELECT TO authenticated
 USING(content_scope='lesson' OR public.is_jwt_admin_or_tutor() OR
 (status='published' AND public.practice_can_read_level(level) AND EXISTS(
  SELECT 1 FROM public.practice_catalog() c WHERE c.topic_id=lessons.id)));

CREATE POLICY "exercise_sets: private practice metadata" ON public.exercise_sets AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.is_jwt_admin_or_tutor() OR EXISTS(SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND l.content_scope='lesson'));

CREATE POLICY "reading_passages: practice published set" ON public.reading_passages AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.is_jwt_admin_or_tutor() OR EXISTS(SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND
  (l.content_scope='lesson' OR (set_id IS NOT NULL AND public.practice_can_read_set(set_id)))));
CREATE POLICY "listening_clips: practice published set" ON public.listening_clips AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.is_jwt_admin_or_tutor() OR EXISTS(SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND
  (l.content_scope='lesson' OR EXISTS(SELECT 1 FROM public.practice_catalog() c,
   LATERAL jsonb_array_elements(c.sets) s WHERE c.topic_id=lesson_id AND s->>'audio_clip_id'=listening_clips.id::text))));

-- Existing safe views already strip answers; add practice access without changing their projection.
DO $$ DECLARE v text; definition text; BEGIN
 FOREACH v IN ARRAY ARRAY['grammar_exercises_public','reading_question_groups_public'] LOOP
  definition := rtrim(pg_get_viewdef(('public.'||v)::regclass,true),';' || chr(10));
  EXECUTE format('CREATE OR REPLACE VIEW public.%I WITH (security_barrier=true) AS SELECT safe.* FROM (%s) safe WHERE public.practice_can_read_set(safe.set_id)',v,definition);
 END LOOP;
END $$;

CREATE FUNCTION public.enforce_practice_parent() RETURNS trigger
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
   IF set_row.lesson_id IS DISTINCT FROM NEW.lesson_id THEN
    RAISE EXCEPTION 'practice child must belong to its set topic' USING ERRCODE='23514';
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_practice_parent() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enforce_practice_parent BEFORE INSERT OR UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.enforce_practice_parent();
CREATE TRIGGER enforce_practice_parent BEFORE INSERT OR UPDATE ON public.exercise_sets FOR EACH ROW EXECUTE FUNCTION public.enforce_practice_parent();
CREATE TRIGGER enforce_practice_parent BEFORE INSERT OR UPDATE ON public.grammar_exercises FOR EACH ROW EXECUTE FUNCTION public.enforce_practice_parent();
CREATE TRIGGER enforce_practice_parent BEFORE INSERT OR UPDATE ON public.reading_passages FOR EACH ROW EXECUTE FUNCTION public.enforce_practice_parent();
CREATE TRIGGER enforce_practice_parent BEFORE INSERT OR UPDATE ON public.lesson_progress FOR EACH ROW EXECUTE FUNCTION public.enforce_practice_parent();

ALTER TABLE public.exercise_set_attempts ADD COLUMN correct_count integer NOT NULL DEFAULT 0;
CREATE TABLE public.practice_submission_history(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 set_id uuid NOT NULL REFERENCES public.exercise_sets(id) ON DELETE CASCADE, submission_id text NOT NULL,
 answers jsonb NOT NULL, score integer NOT NULL, total integer NOT NULL, correct_count integer NOT NULL DEFAULT 0, is_passed boolean NOT NULL,
 revealed boolean NOT NULL, attempt_count integer NOT NULL, best_score integer NOT NULL, results jsonb NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,set_id,submission_id));
ALTER TABLE public.practice_submission_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.practice_submission_history FROM anon,authenticated;
GRANT SELECT ON public.practice_submission_history TO authenticated;
GRANT ALL ON public.practice_submission_history TO service_role;
CREATE POLICY "practice history: own read" ON public.practice_submission_history FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE FUNCTION public.append_practice_submission() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.exercise_sets s JOIN public.lessons l ON l.id=s.lesson_id WHERE s.id=NEW.set_id AND l.content_scope='practice') THEN
  INSERT INTO public.practice_submission_history(user_id,set_id,submission_id,answers,score,total,correct_count,is_passed,revealed,attempt_count,best_score,results,submitted_at)
  VALUES(NEW.user_id,NEW.set_id,NEW.last_submission_id,NEW.answers,NEW.score,NEW.total,NEW.correct_count,NEW.is_passed,NEW.revealed,NEW.attempt_count,NEW.best_score,
   jsonb_build_object('blankResults',NEW.blank_results,'choiceResults',NEW.choice_results,
    'itemResults',NEW.exercise_results,'exerciseResults',NEW.exercise_results,'classificationResults',NEW.classification_results),NEW.submitted_at)
  ON CONFLICT(user_id,set_id,submission_id) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.append_practice_submission() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER append_practice_submission AFTER INSERT OR UPDATE ON public.exercise_set_attempts FOR EACH ROW EXECUTE FUNCTION public.append_practice_submission();

CREATE OR REPLACE FUNCTION public.admin_exercise_score_summary(p_user_id uuid)
RETURNS TABLE(lesson_id text,category text,quiz_score integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_jwt_admin_or_tutor() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Staff required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  WITH eligible AS (
    SELECT s.id,s.lesson_id,s.category FROM public.exercise_sets s
    WHERE EXISTS(SELECT 1 FROM public.lessons l WHERE l.id=s.lesson_id AND l.content_scope='lesson') AND s.status='published' AND (
      (s.category IN ('nguphap','nghe') AND EXISTS(SELECT 1 FROM public.grammar_exercises g WHERE g.set_id=s.id))
      OR (s.category='doc' AND EXISTS(SELECT 1 FROM public.reading_question_groups r WHERE r.set_id=s.id))
    )
  ), totals AS (
    SELECT e.lesson_id,e.category,count(*) AS set_count FROM eligible e GROUP BY e.lesson_id,e.category
  )
  SELECT e.lesson_id,e.category,round(sum(a.best_score)::numeric/t.set_count)::integer
  FROM eligible e JOIN public.exercise_set_attempts a ON a.set_id=e.id AND a.user_id=p_user_id
  JOIN totals t ON t.lesson_id=e.lesson_id AND t.category=e.category
  GROUP BY e.lesson_id,e.category,t.set_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.dictionary_can_read(entry_course text, source_lessons text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT public.is_jwt_admin_or_tutor() OR EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND (
   (p.subscription_end_date >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AND entry_course=ANY(p.unlocked_levels))
   OR (p.subscription_end_date IS NULL AND entry_course='A1' AND source_lessons && ARRAY(
    SELECT l.id FROM public.lessons l LEFT JOIN public.modules m ON m.id=l.module_id
    WHERE l.content_scope='lesson' AND l.level='A1' AND l.status='published' ORDER BY m.order_index NULLS LAST,l.order_index,l.id LIMIT 3
   ))
  )
 )
$$;

CREATE OR REPLACE VIEW public.lesson_positions AS SELECT id,module_id,order_index,status FROM public.lessons WHERE content_scope='lesson';
CREATE POLICY "writing: course only" ON public.writing_submissions AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(EXISTS(SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND l.content_scope='lesson'));
CREATE POLICY "speaking: course only" ON public.speaking_submissions AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(EXISTS(SELECT 1 FROM public.lessons l WHERE l.id=lesson_id AND l.content_scope='lesson'));

CREATE FUNCTION public.enforce_practice_reading_group() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.exercise_sets s JOIN public.lessons l ON l.id=s.lesson_id
  WHERE s.id=NEW.set_id AND l.content_scope='practice') AND NOT EXISTS(
  SELECT 1 FROM public.reading_passages p WHERE p.id=NEW.passage_id AND p.set_id=NEW.set_id) THEN
  RAISE EXCEPTION 'practice reading question must use its set passage' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_practice_reading_group() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER enforce_practice_reading_group BEFORE INSERT OR UPDATE ON public.reading_question_groups FOR EACH ROW EXECUTE FUNCTION public.enforce_practice_reading_group();

CREATE FUNCTION public.reorder_practice_sets(p_topic_id text,p_ids uuid[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF auth.uid() IS NULL OR public.is_jwt_admin_or_tutor() IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'Staff required' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.lessons WHERE id=p_topic_id AND content_scope='practice' FOR UPDATE;
 IF NOT FOUND OR p_ids IS NULL OR cardinality(p_ids)<>(SELECT count(*) FROM public.exercise_sets WHERE lesson_id=p_topic_id)
 OR cardinality(p_ids)<>(SELECT count(DISTINCT id) FROM unnest(p_ids) id)
 OR EXISTS(SELECT 1 FROM unnest(p_ids) id WHERE NOT EXISTS(SELECT 1 FROM public.exercise_sets s WHERE s.id=id AND s.lesson_id=p_topic_id)) THEN
  RAISE EXCEPTION 'IDs must be a complete permutation of topic sets' USING ERRCODE='23514';
 END IF;
 UPDATE public.exercise_sets s SET order_index=ids.ordinality::integer-1
 FROM unnest(p_ids) WITH ORDINALITY ids(id,ordinality) WHERE s.id=ids.id;
END $$;
REVOKE ALL ON FUNCTION public.reorder_practice_sets(text,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reorder_practice_sets(text,uuid[]) TO authenticated;

-- Images belong to a passage/question, so a published topic alone is insufficient.
CREATE FUNCTION public.practice_can_read_image(p_topic_id text,p_key text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND p_key LIKE 'images/'||p_topic_id||'/%' AND (
 public.is_jwt_admin_or_tutor() OR EXISTS(
 SELECT 1 FROM public.exercise_sets s JOIN public.lessons l ON l.id=s.lesson_id
 WHERE l.id=p_topic_id AND l.content_scope='practice' AND public.practice_can_read_set(s.id) AND (
 EXISTS(SELECT 1 FROM public.reading_passages p WHERE p.set_id=s.id AND strpos(to_jsonb(p)::text,p_key)>0) OR
 EXISTS(SELECT 1 FROM public.grammar_exercises_public g WHERE g.set_id=s.id AND strpos(to_jsonb(g)::text,p_key)>0) OR
 EXISTS(SELECT 1 FROM public.reading_question_groups_public g WHERE g.set_id=s.id AND strpos(to_jsonb(g)::text,p_key)>0))))
$$;
REVOKE ALL ON FUNCTION public.practice_can_read_image(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_can_read_image(text,text) TO authenticated;

-- Serialize latest-attempt updates and history under one user/set lock.
CREATE FUNCTION public.save_practice_attempt(p_user_id uuid,p_set_id uuid,p_submission_id text,p_answers jsonb,p_correct integer,p_total integer,p_results jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE previous public.exercise_set_attempts; saved public.practice_submission_history; set_category text;
 score_now integer; count_now integer; passed_now boolean; revealed_now boolean;
BEGIN
 IF p_total<=0 OR p_correct<0 OR p_correct>p_total OR p_submission_id IS NULL OR p_submission_id='' THEN
  RAISE EXCEPTION 'Invalid graded attempt' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_set_id::text,0));
 SELECT * INTO saved FROM public.practice_submission_history WHERE user_id=p_user_id AND set_id=p_set_id AND submission_id=p_submission_id;
 IF FOUND THEN RETURN to_jsonb(saved); END IF;
 SELECT s.category INTO set_category FROM public.exercise_sets s JOIN public.lessons l ON l.id=s.lesson_id
 WHERE s.id=p_set_id AND s.status='published' AND l.status='published' AND l.content_scope='practice';
 IF NOT FOUND THEN RAISE EXCEPTION 'Published practice required' USING ERRCODE='23514'; END IF;
 SELECT * INTO previous FROM public.exercise_set_attempts WHERE user_id=p_user_id AND set_id=p_set_id FOR UPDATE;
 score_now:=round(p_correct::numeric*100/p_total); count_now:=coalesce(previous.attempt_count,0)+1;
 passed_now:=coalesce(previous.is_passed,false) OR p_correct::bigint*100>=p_total::bigint*80;
 revealed_now:=coalesce(previous.revealed,false) OR passed_now OR count_now>=3;
 INSERT INTO public.exercise_set_attempts(user_id,set_id,category,answers,blank_results,choice_results,exercise_results,classification_results,
 score,total,correct_count,best_score,attempt_count,is_passed,revealed,last_submission_id,submitted_at)
 VALUES(p_user_id,p_set_id,set_category,p_answers,coalesce(p_results->'blankResults','{}'),coalesce(p_results->'choiceResults','{}'),
 coalesce(p_results->'exerciseResults',p_results->'itemResults','{}'),coalesce(p_results->'classificationResults','{}'),
 score_now,p_total,p_correct,greatest(coalesce(previous.best_score,0),score_now),count_now,passed_now,revealed_now,p_submission_id,now())
 ON CONFLICT(user_id,set_id) DO UPDATE SET answers=excluded.answers,blank_results=excluded.blank_results,choice_results=excluded.choice_results,
 exercise_results=excluded.exercise_results,classification_results=excluded.classification_results,score=excluded.score,total=excluded.total,
 correct_count=excluded.correct_count,best_score=excluded.best_score,attempt_count=excluded.attempt_count,is_passed=excluded.is_passed,
 revealed=excluded.revealed,last_submission_id=excluded.last_submission_id,submitted_at=excluded.submitted_at;
 SELECT * INTO saved FROM public.practice_submission_history WHERE user_id=p_user_id AND set_id=p_set_id AND submission_id=p_submission_id;
 RETURN to_jsonb(saved);
END $$;
REVOKE ALL ON FUNCTION public.save_practice_attempt(uuid,uuid,text,jsonb,integer,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_practice_attempt(uuid,uuid,text,jsonb,integer,integer,jsonb) TO service_role;

CREATE FUNCTION public.validate_practice_publish() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$ BEGIN
 IF NEW.status<>'published' OR NOT EXISTS(SELECT 1 FROM public.lessons l WHERE l.id=NEW.lesson_id AND l.content_scope='practice') THEN RETURN NEW; END IF;
 IF NEW.category='nghe' AND (NEW.audio_clip_id IS NULL OR EXISTS(
  SELECT 1 FROM public.grammar_exercises g WHERE g.set_id=NEW.id AND g.type NOT IN ('fill_in_the_blank','multiple_choice','richtig_falsch'))) THEN
  RAISE EXCEPTION 'Published listening practice requires audio and supported question types' USING ERRCODE='23514';
 END IF;
 IF NEW.category='doc' THEN
  IF NOT EXISTS(SELECT 1 FROM public.reading_question_groups g JOIN public.reading_passages p ON p.id=g.passage_id
   WHERE g.set_id=NEW.id AND p.set_id=NEW.id AND length(trim(p.text_de))>0
   AND jsonb_array_length(CASE WHEN g.question_type='richtig_falsch' THEN coalesce(g.statements,'[]') ELSE coalesce(g.sub_questions,'[]') END)>0)
   OR EXISTS(SELECT 1 FROM public.reading_question_groups g JOIN public.reading_passages p ON p.id=g.passage_id
    WHERE g.set_id=NEW.id AND (p.set_id IS DISTINCT FROM NEW.id OR length(trim(p.text_de))=0 OR
     jsonb_array_length(CASE WHEN g.question_type='richtig_falsch' THEN coalesce(g.statements,'[]') ELSE coalesce(g.sub_questions,'[]') END)=0)) THEN
   RAISE EXCEPTION 'Published reading practice requires passages and questions' USING ERRCODE='23514';
  END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM public.grammar_exercises g WHERE g.set_id=NEW.id) OR EXISTS(
  SELECT 1 FROM public.grammar_exercises g WHERE g.set_id=NEW.id AND (
   (g.type NOT IN ('classification','fill_in_the_blank','matching') AND nullif(trim(g.correct_answer),'') IS NULL) OR
   (g.type='fill_in_the_blank' AND jsonb_array_length(coalesce(g.blanks,'[]'))=0) OR
   (g.type='classification' AND jsonb_array_length(coalesce(g.classification_items,'[]'))=0) OR
   (g.type='matching' AND jsonb_array_length(coalesce(g.matching_pairs,'[]'))=0))) THEN
  RAISE EXCEPTION 'Published practice requires valid questions and answers' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_practice_publish() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_practice_publish BEFORE INSERT OR UPDATE OF status ON public.exercise_sets FOR EACH ROW EXECUTE FUNCTION public.validate_practice_publish();
