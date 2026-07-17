-- Fix: quiz_questions_public exposed quiz questions belonging to draft
-- (unpublished) lessons to any authenticated user.
--
-- quiz_questions has no SELECT RLS policy for `authenticated` by design
-- (20260624000001_initial_schema.sql) — only the admin "FOR ALL" policy
-- (20260629000004_admin_role.sql) and access through this view are
-- allowed, so correct_answer can never leak via direct table access.
-- Because the view runs as SECURITY DEFINER (the default) it bypasses RLS
-- entirely, and it never filtered on lessons.status, so it returned every
-- row regardless of the "lessons: authenticated read" policy
-- (20260714000010_lesson_status_draft_publish.sql) that otherwise hides
-- draft lessons from non-admins.
--
-- Re-adding `security_invoker = true` (the original
-- 20260624000002_security_fixes.sql intent) is NOT the fix here: without a
-- SELECT policy on quiz_questions for `authenticated`, invoker mode makes
-- every row invisible to non-admins, not just draft ones — this exact
-- regression was already hit once and reverted in
-- 20260624000003_helpers.sql. Instead, filter the view itself against
-- lessons.status, mirroring the "lessons: authenticated read" predicate,
-- and keep SECURITY DEFINER.
DROP VIEW IF EXISTS quiz_questions_public;

CREATE VIEW quiz_questions_public AS
  SELECT
    q.id,
    q.lesson_id,
    q.type,
    q.category,
    regexp_replace(q.question_text, '\{\{[^}]*\}\}', '{{blank}}', 'g') AS question_text,
    regexp_replace(q.answer_text, '\{\{[^}]*\}\}', '{{blank}}', 'g') AS answer_text,
    q.audio_text,
    q.options,
    q.matching_pairs,
    q.audio_clip_id,
    q.reading_passage_id,
    q.explanation,
    q.order_index
  FROM quiz_questions q
  JOIN lessons l ON l.id = q.lesson_id
  WHERE l.status = 'published'
     OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';

GRANT SELECT ON quiz_questions_public TO authenticated;
