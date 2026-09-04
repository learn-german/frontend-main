-- Register a learner atomically so capacity and VN-week limits cannot race.
CREATE OR REPLACE FUNCTION public.register_meeting_session(
  p_session_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  registration_id UUID,
  registration_session_id UUID,
  registration_user_id UUID,
  registration_registered_at TIMESTAMPTZ,
  session_title TEXT,
  session_level TEXT,
  session_date DATE,
  session_start_time TIME,
  session_end_time TIME,
  session_meet_url TEXT,
  session_note TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_session public.meeting_sessions%ROWTYPE;
  new_registration public.meeting_registrations%ROWTYPE;
  week_start DATE;
BEGIN
  SELECT *
  INTO target_session
  FROM public.meeting_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'not_found';
  END IF;

  -- Serialize a learner's registrations across different sessions in one week.
  PERFORM 1
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'user_not_found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.meeting_registrations AS registration
    WHERE registration.session_id = p_session_id
      AND registration.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'already';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.meeting_registrations AS registration
    WHERE registration.session_id = p_session_id
  ) >= 10 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'full';
  END IF;

  week_start := date_trunc('week', target_session.session_date::TIMESTAMP)::DATE;

  IF EXISTS (
    SELECT 1
    FROM public.meeting_registrations AS registration
    JOIN public.meeting_sessions AS registered_session
      ON registered_session.id = registration.session_id
    WHERE registration.user_id = p_user_id
      AND registered_session.session_date BETWEEN week_start AND week_start + 6
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'week_limit';
  END IF;

  INSERT INTO public.meeting_registrations (session_id, user_id)
  VALUES (p_session_id, p_user_id)
  RETURNING * INTO new_registration;

  RETURN QUERY
  SELECT
    new_registration.id,
    new_registration.session_id,
    new_registration.user_id,
    new_registration.registered_at,
    target_session.title,
    target_session.level,
    target_session.session_date,
    target_session.start_time,
    target_session.end_time,
    target_session.meet_url,
    target_session.note;
END;
$$;

REVOKE EXECUTE
  ON FUNCTION public.register_meeting_session(UUID, UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.register_meeting_session(UUID, UUID)
  TO service_role;
