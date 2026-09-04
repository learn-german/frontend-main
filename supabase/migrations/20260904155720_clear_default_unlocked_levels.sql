ALTER TABLE public.profiles
  ALTER COLUMN unlocked_levels SET DEFAULT '{}'::text[];
