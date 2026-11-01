CREATE FUNCTION public.admin_exercise_score_summary(p_user_id uuid)
RETURNS TABLE(lesson_id text,category text,quiz_score integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_jwt_admin_or_tutor() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Staff required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  WITH eligible AS (
    SELECT s.id,s.lesson_id,s.category FROM public.exercise_sets s
    WHERE s.status='published' AND (
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
REVOKE ALL ON FUNCTION public.admin_exercise_score_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_exercise_score_summary(uuid) TO authenticated;
