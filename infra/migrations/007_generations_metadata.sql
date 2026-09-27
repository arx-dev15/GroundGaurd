-- 007_generations_metadata.sql
-- GroundGuard Phase 5: Persist model_version and metadata on generations table

ALTER TABLE generations ADD COLUMN IF NOT EXISTS model_version varchar(64);
ALTER TABLE generations ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;
