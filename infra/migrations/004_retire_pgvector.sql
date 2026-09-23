-- 004_retire_pgvector.sql
-- GroundGuard Phase 3: Retire pgvector from canonical schema
-- Dense vector storage & semantic retrieval is canonically owned by Qdrant.

ALTER TABLE chunks
DROP COLUMN IF EXISTS embedding;

DROP EXTENSION IF EXISTS vector;
