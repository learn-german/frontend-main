-- =============================================================================
-- DeutschPath — R2-hosted video/audio: object key columns
-- =============================================================================

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS video_r2_key TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS audio_r2_key TEXT;
