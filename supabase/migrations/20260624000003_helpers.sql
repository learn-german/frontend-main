-- =============================================================================
-- DeutschPath — Helpers: quiz_questions_public fix + increment_xp function
-- =============================================================================

-- Fix quiz_questions_public:
-- Migration 002 dùng security_invoker=true nhưng không có SELECT policy trên
-- quiz_questions → authenticated users không đọc được view.
-- Giải pháp: dùng security_definer (default) + GRANT SELECT on view.
-- Base table quiz_questions vẫn KHÔNG có SELECT policy → client không bypass view.
DROP VIEW IF EXISTS quiz_questions_public;

CREATE VIEW quiz_questions_public AS
  SELECT
    id,
    lesson_id,
    type,
    question_text,
    audio_text,
    options,
    matching_pairs,
    explanation,
    order_index
  FROM quiz_questions;

GRANT SELECT ON quiz_questions_public TO authenticated;

-- increment_xp: atomic XP increment, chỉ gọi được từ Edge Function (service_role)
CREATE OR REPLACE FUNCTION increment_xp(p_user_id UUID, p_amount INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE user_stats
  SET xp = xp + p_amount,
      updated_at = NOW()
  WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION increment_xp(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_xp(UUID, INTEGER) TO service_role;
