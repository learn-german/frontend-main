-- Drop legacy single-passage reading columns superseded by reading_passages.
-- reading_text backfilled in 20260716000015_reading_passages.sql (user confirmed drop).

ALTER TABLE lessons DROP COLUMN IF EXISTS reading_text;
ALTER TABLE lessons DROP COLUMN IF EXISTS reading_text_vi;
ALTER TABLE lessons DROP COLUMN IF EXISTS listening_url;
