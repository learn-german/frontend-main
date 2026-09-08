-- Learning activity days + streak recorder (Asia/Ho_Chi_Minh)

CREATE TABLE IF NOT EXISTS learning_activity_days (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date date NOT NULL,
  PRIMARY KEY (user_id, activity_date)
);

CREATE INDEX IF NOT EXISTS learning_activity_days_user_date_idx
  ON learning_activity_days (user_id, activity_date);

ALTER TABLE learning_activity_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY learning_activity_days_select_own
  ON learning_activity_days
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies for authenticated — only service_role via RPC.

CREATE OR REPLACE FUNCTION record_learning_activity(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (timezone('Asia/Ho_Chi_Minh', now()))::date;
  v_last date;
  v_streak integer;
  v_new_streak integer;
  v_gap integer;
BEGIN
  INSERT INTO learning_activity_days (user_id, activity_date)
  VALUES (p_user_id, v_today)
  ON CONFLICT (user_id, activity_date) DO NOTHING;

  SELECT streak, last_activity_date
    INTO v_streak, v_last
  FROM user_stats
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO user_stats (user_id, xp, streak, last_activity_date, updated_at)
    VALUES (p_user_id, 0, 1, v_today, now())
    ON CONFLICT (user_id) DO NOTHING;
    RETURN 1;
  END IF;

  v_streak := COALESCE(v_streak, 0);

  IF v_last IS NULL THEN
    v_new_streak := 1;
  ELSE
    v_gap := (v_today - v_last);
    IF v_gap = 0 THEN
      v_new_streak := v_streak;
    ELSIF v_gap IN (1, 2) THEN
      v_new_streak := v_streak + 1;
    ELSE
      v_new_streak := 1;
    END IF;
  END IF;

  UPDATE user_stats
  SET streak = v_new_streak,
      last_activity_date = v_today,
      updated_at = now()
  WHERE user_id = p_user_id;

  RETURN v_new_streak;
END;
$$;

REVOKE ALL ON FUNCTION record_learning_activity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_learning_activity(uuid) TO service_role;
