-- =============================================================================
-- DeutschPath — Online meeting sessions: tables, view, RLS
-- =============================================================================
-- Spec: docs/superpowers/specs/2026-09-04-online-meeting-integration-design.md
--
-- meet_url is sensitive: learners never read it via PostgREST. Admin CRUD uses
-- JWT app_metadata.role = admin on base tables. Register/cancel/list go through
-- Edge Functions with service role (bypasses RLS).
--
-- Learner list is Edge-only (service role). View meeting_sessions_for_learners
-- is kept for optional admin tooling / future use; no GRANT to authenticated
-- because security_invoker would block (no SELECT policy on meeting_sessions).

CREATE TABLE meeting_sessions (
  id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title        TEXT        NOT NULL,
  level        TEXT        NOT NULL,
  session_date DATE        NOT NULL,
  start_time   TIME        NOT NULL,
  end_time     TIME        NOT NULL,
  meet_url     TEXT        NOT NULL,
  note         TEXT,
  created_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT meeting_sessions_level_check
    CHECK (level IN ('A1', 'A2', 'B1', 'B2')),
  CONSTRAINT meeting_sessions_time_check
    CHECK (end_time > start_time)
);

CREATE TABLE meeting_registrations (
  id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id    UUID        NOT NULL REFERENCES meeting_sessions(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

CREATE INDEX meeting_registrations_session_idx
  ON meeting_registrations (session_id);

CREATE INDEX meeting_registrations_user_idx
  ON meeting_registrations (user_id, registered_at DESC);

ALTER TABLE meeting_sessions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_registrations  ENABLE ROW LEVEL SECURITY;

-- --- meeting_sessions --------------------------------------------------------

-- Admin full access only. No SELECT for plain authenticated — learners use Edge.
CREATE POLICY "meeting_sessions: admin all"
  ON meeting_sessions FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- --- meeting_registrations ---------------------------------------------------

CREATE POLICY "meeting_registrations: own read"
  ON meeting_registrations FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/DELETE for authenticated — Edge Functions only (service role).

CREATE POLICY "meeting_registrations: admin all"
  ON meeting_registrations FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- --- learner-safe view (no meet_url) -----------------------------------------
-- Not granted to authenticated; list-learner-meetings Edge reads base tables.

CREATE OR REPLACE VIEW meeting_sessions_for_learners
WITH (security_invoker = true) AS
SELECT
  s.id,
  s.title,
  s.level,
  s.session_date,
  s.start_time,
  s.end_time,
  s.note,
  s.created_at,
  (SELECT COUNT(*)::int FROM meeting_registrations r WHERE r.session_id = s.id)
    AS registration_count
FROM meeting_sessions s;

-- Intentionally no GRANT SELECT to authenticated.
-- Edge list-learner-meetings uses service role on meeting_sessions and strips meet_url.
