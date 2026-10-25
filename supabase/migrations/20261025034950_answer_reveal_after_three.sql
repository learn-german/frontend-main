-- Existing learners with three or more submissions get the same reveal rule.
UPDATE public.exercise_set_attempts
SET revealed = true
WHERE attempt_count >= 3 AND revealed = false;
