-- Background reports have a service JWT without a user sub. Keep learner gates intact.
CREATE OR REPLACE FUNCTION public.practice_can_read_set(p_set_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(
 SELECT 1 FROM public.exercise_sets s JOIN public.lessons l ON l.id=s.lesson_id
 WHERE s.id=p_set_id AND (
  (coalesce(auth.jwt()->>'role','')='service_role' AND s.status='published' AND l.status='published') OR
  (auth.uid() IS NOT NULL AND (public.is_jwt_admin_or_tutor() OR
   (s.status='published' AND l.status='published' AND
    (l.content_scope='lesson' OR public.practice_can_read_level(l.level)))))))
$$;
REVOKE ALL ON FUNCTION public.practice_can_read_set(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.practice_can_read_set(uuid) TO authenticated,service_role;
