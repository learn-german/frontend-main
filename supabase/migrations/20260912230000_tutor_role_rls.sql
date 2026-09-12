-- =============================================================================
-- DeutschPath — Tutor role: additive RLS for tutor admin sections
-- =============================================================================

CREATE OR REPLACE FUNCTION public.jwt_app_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), '');
$$;

CREATE OR REPLACE FUNCTION public.is_jwt_tutor()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.jwt_app_role() = 'tutor';
$$;

CREATE OR REPLACE FUNCTION public.is_jwt_admin_or_tutor()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT public.jwt_app_role() IN ('admin', 'tutor');
$$;

CREATE POLICY "profiles: tutor read"
  ON profiles FOR SELECT TO authenticated
  USING (public.is_jwt_tutor());

CREATE POLICY "user_stats: tutor read"
  ON user_stats FOR SELECT TO authenticated
  USING (public.is_jwt_tutor());

CREATE POLICY "lesson_progress: tutor read"
  ON lesson_progress FOR SELECT TO authenticated
  USING (public.is_jwt_tutor());

CREATE POLICY "lessons: tutor read"
  ON lessons FOR SELECT TO authenticated
  USING (public.is_jwt_tutor());

CREATE POLICY "grammar_exercises: tutor write"
  ON grammar_exercises FOR ALL TO authenticated
  USING (public.is_jwt_tutor()) WITH CHECK (public.is_jwt_tutor());

CREATE POLICY "listening_clips: tutor write"
  ON listening_clips FOR ALL TO authenticated
  USING (public.is_jwt_tutor()) WITH CHECK (public.is_jwt_tutor());

CREATE POLICY "reading_passages: tutor write"
  ON reading_passages FOR ALL TO authenticated
  USING (public.is_jwt_tutor()) WITH CHECK (public.is_jwt_tutor());

CREATE POLICY "reading_question_groups: tutor write"
  ON reading_question_groups FOR ALL TO authenticated
  USING (public.is_jwt_tutor()) WITH CHECK (public.is_jwt_tutor());

CREATE POLICY "exercise_sets: tutor write"
  ON exercise_sets FOR ALL TO authenticated
  USING (public.is_jwt_tutor()) WITH CHECK (public.is_jwt_tutor());

CREATE POLICY "writing_submissions: tutor all"
  ON writing_submissions FOR ALL TO authenticated
  USING (public.is_jwt_tutor()) WITH CHECK (public.is_jwt_tutor());

CREATE POLICY "support_tickets: tutor all"
  ON support_tickets FOR ALL TO authenticated
  USING (public.is_jwt_tutor()) WITH CHECK (public.is_jwt_tutor());

CREATE POLICY "support_ticket_messages: tutor all"
  ON support_ticket_messages FOR ALL TO authenticated
  USING (public.is_jwt_tutor()) WITH CHECK (public.is_jwt_tutor());

CREATE POLICY "meeting_sessions: tutor all"
  ON meeting_sessions FOR ALL TO authenticated
  USING (public.is_jwt_tutor()) WITH CHECK (public.is_jwt_tutor());

CREATE POLICY "meeting_registrations: tutor all"
  ON meeting_registrations FOR ALL TO authenticated
  USING (public.is_jwt_tutor()) WITH CHECK (public.is_jwt_tutor());

CREATE POLICY "notifications: tutor read broadcast"
  ON notifications FOR SELECT TO authenticated
  USING (for_admin = true AND public.is_jwt_tutor());

CREATE POLICY "notifications: tutor update broadcast"
  ON notifications FOR UPDATE TO authenticated
  USING (for_admin = true AND public.is_jwt_tutor())
  WITH CHECK (for_admin = true AND public.is_jwt_tutor());

CREATE OR REPLACE FUNCTION support_message_set_is_staff()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM support_ticket_messages WHERE ticket_id = NEW.ticket_id
  ) THEN
    NEW.is_staff := false;
  ELSE
    NEW.is_staff := COALESCE(public.is_jwt_admin_or_tutor(), false);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP VIEW IF EXISTS grammar_exercises_public;

CREATE VIEW grammar_exercises_public AS
  SELECT
    g.id,
    g.lesson_id,
    g.set_id,
    g.type,
    g.group_id,
    g.hint,
    g.prompt_text,
    g.transformation_hint,
    g.tokens,
    g.classification_groups,
    (
      SELECT jsonb_agg(elem ->> 'item')
      FROM jsonb_array_elements(g.classification_items) elem
    ) AS classification_items,
    g.word_bank,
    g.options,
    g.matching_pairs,
    g.audio_clip_id,
    g.reading_passage_id,
    g.order_index,
    es.category
  FROM grammar_exercises g
  JOIN exercise_sets es ON es.id = g.set_id
  JOIN lessons l ON l.id = g.lesson_id
  WHERE es.status = 'published'
    AND (l.status = 'published' OR public.is_jwt_admin_or_tutor());

GRANT SELECT ON grammar_exercises_public TO authenticated;

DROP VIEW IF EXISTS reading_question_groups_public;

CREATE VIEW reading_question_groups_public AS
  SELECT
    g.id,
    g.passage_id,
    g.set_id,
    g.order_index,
    g.title,
    g.question_intro,
    g.question_type,
    (
      SELECT jsonb_agg(elem - 'correct_answer')
      FROM jsonb_array_elements(g.statements) elem
    ) AS statements,
    (
      SELECT jsonb_agg(elem - 'correct_option_id')
      FROM jsonb_array_elements(g.sub_questions) elem
    ) AS sub_questions,
    es.lesson_id
  FROM reading_question_groups g
  JOIN exercise_sets es ON es.id = g.set_id
  JOIN lessons l ON l.id = es.lesson_id
  WHERE es.status = 'published'
    AND (l.status = 'published' OR public.is_jwt_admin_or_tutor());

GRANT SELECT ON reading_question_groups_public TO authenticated;
