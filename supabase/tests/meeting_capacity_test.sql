-- Run with supabase test db; fixtures and successful mutations are rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(19);

INSERT INTO auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
SELECT ('ca000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', 'capacity-' || n || '@test.local', '{}', '{}'
FROM generate_series(1, 13) n;

INSERT INTO public.meeting_sessions(id, title, level, session_date, start_time, end_time, meet_url)
VALUES ('cb000000-0000-0000-0000-000000000001', 'Capacity default', 'A1', '2099-01-05', '10:00', '11:00', 'https://meet.google.com/capacity');
SELECT is((SELECT max_participants FROM public.meeting_sessions WHERE id='cb000000-0000-0000-0000-000000000001'),10,'new sessions default to ten');
SELECT throws_ok($$UPDATE public.meeting_sessions SET max_participants=0 WHERE id='cb000000-0000-0000-0000-000000000001'$$,'23514',NULL,'zero rejected');
SELECT throws_ok($$UPDATE public.meeting_sessions SET max_participants=-1 WHERE id='cb000000-0000-0000-0000-000000000001'$$,'23514',NULL,'negative rejected');
SELECT throws_ok($$UPDATE public.meeting_sessions SET max_participants=NULL WHERE id='cb000000-0000-0000-0000-000000000001'$$,'23502',NULL,'null rejected');
SELECT throws_ok($$UPDATE public.meeting_sessions SET max_participants='1.5' WHERE id='cb000000-0000-0000-0000-000000000001'$$,'22P02',NULL,'fractional input rejected');

UPDATE public.meeting_sessions SET max_participants=12 WHERE id='cb000000-0000-0000-0000-000000000001';
DO $$ BEGIN
  FOR n IN 1..12 LOOP
    PERFORM public.register_meeting_session('cb000000-0000-0000-0000-000000000001',
      ('ca000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid);
  END LOOP;
END $$;
SELECT is((SELECT count(*) FROM public.meeting_registrations WHERE session_id='cb000000-0000-0000-0000-000000000001'),12::bigint,'custom limit above ten allows twelve registrations');
SELECT throws_ok($$SELECT public.register_meeting_session('cb000000-0000-0000-0000-000000000001','ca000000-0000-0000-0000-000000000013')$$,'P0001','full','thirteenth registration rejected');
SELECT throws_ok($$UPDATE public.meeting_sessions SET max_participants=11 WHERE id='cb000000-0000-0000-0000-000000000001'$$,'23514','capacity_below_registrations','cannot shrink below bookings');
SELECT is((SELECT max_participants FROM public.meeting_sessions WHERE id='cb000000-0000-0000-0000-000000000001'),12,'failed shrink preserves capacity');
SELECT is((SELECT count(*) FROM public.meeting_registrations WHERE session_id='cb000000-0000-0000-0000-000000000001'),12::bigint,'failed shrink preserves bookings');
SELECT lives_ok($$UPDATE public.meeting_sessions SET max_participants=12 WHERE id='cb000000-0000-0000-0000-000000000001'$$,'capacity may equal bookings');

INSERT INTO public.meeting_sessions(id, title, level, session_date, start_time, end_time, meet_url, max_participants)
VALUES ('cb000000-0000-0000-0000-000000000002', 'Small capacity', 'A1', '2099-01-12', '10:00', '11:00', 'https://meet.google.com/capacity', 1),
       ('cb000000-0000-0000-0000-000000000003', 'Same week', 'A1', '2099-01-13', '10:00', '11:00', 'https://meet.google.com/capacity', 20);
SELECT lives_ok($$SELECT public.register_meeting_session('cb000000-0000-0000-0000-000000000002','ca000000-0000-0000-0000-000000000001')$$,'smaller session accepts first booking in next week');
SELECT throws_ok($$SELECT public.register_meeting_session('cb000000-0000-0000-0000-000000000002','ca000000-0000-0000-0000-000000000002')$$,'P0001','full','smaller limit enforced');
SELECT throws_ok($$SELECT public.register_meeting_session('cb000000-0000-0000-0000-000000000003','ca000000-0000-0000-0000-000000000001')$$,'P0001','week_limit','weekly rule preserved with larger capacity');
SELECT is(has_function_privilege('anon','public.register_meeting_session(uuid,uuid)','execute'),false,'anon cannot call registration RPC');
SELECT is(has_function_privilege('authenticated','public.register_meeting_session(uuid,uuid)','execute'),false,'learner cannot call registration RPC');
SELECT is(has_function_privilege('service_role','public.register_meeting_session(uuid,uuid)','execute'),true,'service role can call registration RPC');
SELECT is(has_function_privilege('anon','public.check_meeting_session_capacity()','execute'),false,'anon cannot call trigger function');
SELECT is(has_function_privilege('authenticated','public.check_meeting_session_capacity()','execute'),false,'learner cannot call trigger function');
SELECT * FROM finish();
ROLLBACK;
