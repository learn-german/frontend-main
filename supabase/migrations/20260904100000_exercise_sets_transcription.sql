-- Plain-text listening transcription at set level (1 audio = 1 transcript).
ALTER TABLE exercise_sets
  ADD COLUMN IF NOT EXISTS transcription TEXT;
