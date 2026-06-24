-- Fix 1: View quiz_questions_public dùng security_invoker
-- Tránh view chạy với quyền superuser thay vì quyền của user đang query
DROP VIEW IF EXISTS quiz_questions_public;
CREATE VIEW quiz_questions_public
  WITH (security_invoker = true)
AS
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

-- Fix 2: Revoke EXECUTE trên handle_new_user() khỏi PUBLIC
-- Function này chỉ được gọi bởi trigger on_auth_user_created, không phải client
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
