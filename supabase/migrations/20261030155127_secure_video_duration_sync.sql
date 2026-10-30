-- Only administrators may persist measured durations. Preserve three-digit minutes.
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
  IF auth.uid() IS NULL OR (auth.jwt()->'app_metadata'->>'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin required' USING ERRCODE='42501';
  END IF;
  IF p_seconds IS NULL OR p_seconds < 1 OR p_seconds > 7200 THEN
    RAISE EXCEPTION 'invalid duration';
  END IF;

  v_clock := lpad((p_seconds / 60)::text, greatest(2, length((p_seconds / 60)::text)), '0') || ':' || lpad((p_seconds % 60)::text, 2, '0');

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
