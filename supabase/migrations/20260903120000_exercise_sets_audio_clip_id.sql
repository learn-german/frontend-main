-- Persist listening audio at set level (upload before questions).
ALTER TABLE exercise_sets
  ADD COLUMN IF NOT EXISTS audio_clip_id UUID REFERENCES listening_clips(id) ON DELETE SET NULL;

-- Backfill from existing grammar_exercises.audio_clip_id
UPDATE exercise_sets es
SET audio_clip_id = sub.audio_clip_id
FROM (
  SELECT DISTINCT ON (set_id) set_id, audio_clip_id
  FROM grammar_exercises
  WHERE audio_clip_id IS NOT NULL
  ORDER BY set_id, order_index, id
) sub
WHERE es.id = sub.set_id
  AND es.audio_clip_id IS NULL
  AND es.category = 'nghe';
