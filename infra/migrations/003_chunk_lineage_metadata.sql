-- 003_chunk_lineage_metadata.sql
-- GroundGuard Phase 3: Chunk Lineage and Structured Metadata

ALTER TABLE chunks
ADD COLUMN IF NOT EXISTS section text,
ADD COLUMN IF NOT EXISTS heading text,
ADD COLUMN IF NOT EXISTS identifiers jsonb DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_chunks_identifiers_gin ON chunks USING gin (identifiers);
