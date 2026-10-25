-- Supabase also grants EXECUTE directly via default privileges.
-- Trigger invocation remains available; direct client RPC invocation does not.
REVOKE ALL ON FUNCTION public.enforce_speaking_submission() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_speaking_submission() FROM PUBLIC, anon, authenticated;
