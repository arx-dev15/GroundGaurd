-- 006_generations_claims_evidence.sql
-- GroundGuard Phase 5 and 6: Generations, Claims, Claim Evidence
-- Claims and evidence get their own M3 ids. The id M2 returns is kept in external_claim_id, because M2 ids such as claim_1 repeat across generations.
-- Evidence stores a snapshot of the chunk text and has no foreign key to chunks, so it survives document deletion and works with mock chunk ids.

CREATE TABLE IF NOT EXISTS generations (
    id varchar(64) PRIMARY KEY,
    request_id varchar(64) NOT NULL,
    project_id varchar(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    conversation_id varchar(64) REFERENCES conversations(id) ON DELETE CASCADE,
    query text NOT NULL,
    answer text,
    status varchar(32) NOT NULL DEFAULT 'queued',
    error_code varchar(64),
    error_message text,
    max_recovery_attempts integer NOT NULL DEFAULT 2,
    recovery_attempts integer NOT NULL DEFAULT 0,
    retrieval_latency_ms integer,
    generation_latency_ms integer,
    verification_latency_ms integer,
    total_latency_ms integer,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_generations_project_id ON generations(project_id);
CREATE INDEX IF NOT EXISTS idx_generations_request_id ON generations(request_id);
CREATE INDEX IF NOT EXISTS idx_generations_conversation_id ON generations(conversation_id);

CREATE TABLE IF NOT EXISTS claims (
    id varchar(64) PRIMARY KEY,
    generation_id varchar(64) NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
    external_claim_id varchar(64),
    claim_index integer NOT NULL,
    text text NOT NULL,
    status varchar(32) NOT NULL DEFAULT 'pending',
    label varchar(32),
    entailment_score double precision,
    contradiction_score double precision,
    neutral_score double precision,
    grounding_score double precision,
    model_version varchar(64),
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_claims_generation_id ON claims(generation_id, claim_index);

CREATE TABLE IF NOT EXISTS claim_evidence (
    id varchar(64) PRIMARY KEY,
    claim_id varchar(64) NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    chunk_id varchar(64) NOT NULL,
    document_id varchar(64),
    text text NOT NULL,
    retrieval_score double precision,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_claim_evidence_claim_id ON claim_evidence(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_evidence_chunk_id ON claim_evidence(chunk_id);