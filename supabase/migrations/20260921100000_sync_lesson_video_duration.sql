-- Fix known stale lesson duration (Deutsch kennenlernen: actual 14:22, was 05:40).
-- Also allow authenticated clients to persist measured R2 video duration so roadmap/dashboard stay accurate.

UPDATE lessons
SET duration = '14:22'
WHERE (
  title ILIKE '%Deutsch kennenlernen%'
  OR title_vi ILIKE '%Làm quen với tiếng Đức%'
)
AND duration IS DISTINCT FROM '14:22';

CREATE OR REPLACE FUNCTION public.sync_lesson_video_duration(
  p_lesson_id text,
  p_seconds integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clock text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_seconds IS NULL OR p_seconds < 1 OR p_seconds > 7200 THEN
    RAISE EXCEPTION 'invalid duration';
  END IF;

  v_clock := lpad((p_seconds / 60)::text, 2, '0') || ':' || lpad((p_seconds % 60)::text, 2, '0');

  UPDATE lessons
  SET duration = v_clock
  WHERE id = p_lesson_id
    AND video_r2_key IS NOT NULL
    AND duration IS DISTINCT FROM v_clock;

  RETURN v_clock;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_lesson_video_duration(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_lesson_video_duration(text, integer) TO authenticated;
