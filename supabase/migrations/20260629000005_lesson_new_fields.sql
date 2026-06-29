-- =============================================================================
-- DeutschPath — New lesson fields: grammar_md, listening_url, reading_text
-- =============================================================================

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS grammar_md       TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS listening_url    TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS reading_text     TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS reading_text_vi  TEXT;
