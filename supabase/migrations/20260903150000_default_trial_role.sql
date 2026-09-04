-- Default new users to trial role (profiles + auth app_metadata)

ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'trial';

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name',
    COALESCE(NEW.raw_app_meta_data ->> 'role', 'trial')
  );

  INSERT INTO user_stats (user_id)
  VALUES (NEW.id);

  -- Ensure JWT app_metadata.role defaults to trial for self-signup.
  -- Skip if already set (e.g. admin-create-user / set-admin-role).
  IF (NEW.raw_app_meta_data ->> 'role') IS NULL THEN
    UPDATE auth.users
    SET raw_app_meta_data =
      COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'trial')
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;
