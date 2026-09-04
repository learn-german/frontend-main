-- Default new users to trial role on profiles.
-- app_metadata.role is intentionally NOT written here: mutating auth.users
-- from its own AFTER INSERT trigger is fragile under GoTrue. Self-signup
-- falls back to "trial" in App.tsx; admin-create-user sets app_metadata.

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'trial';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- full_name stays null so Google/OAuth users still hit RegistrationPage
  -- (see 20260902000000_google_user_onboarding.sql).
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    null,
    COALESCE(NEW.raw_app_meta_data ->> 'role', 'trial')
  );

  INSERT INTO public.user_stats (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$;
