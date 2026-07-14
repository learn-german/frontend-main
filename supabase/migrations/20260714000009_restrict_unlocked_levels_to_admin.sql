-- =============================================================================
-- DeutschPath — restrict writes to profiles.unlocked_levels to admins only
-- =============================================================================
--
-- profiles RLS ("profiles: update") is row-level: it lets a user update
-- their own row OR an admin update any row, but does not restrict which
-- columns a self-update can touch. Without this trigger, a non-admin user
-- could PATCH their own unlocked_levels directly via PostgREST and unlock
-- every level themselves, bypassing the admin-only UI entirely.

CREATE OR REPLACE FUNCTION restrict_unlocked_levels_to_admin()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.unlocked_levels IS DISTINCT FROM OLD.unlocked_levels
     AND (((SELECT auth.jwt()) -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin')
  THEN
    NEW.unlocked_levels := OLD.unlocked_levels;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_restrict_unlocked_levels ON profiles;
CREATE TRIGGER trg_restrict_unlocked_levels
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION restrict_unlocked_levels_to_admin();
