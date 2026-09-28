-- 008_claim_recovery_attempts.sql
-- GroundGuard Phase 8: Failure-Aware Agentic Recovery Audit History

CREATE TABLE IF NOT EXISTS claim_recovery_attempts (
    id varchar(64) PRIMARY KEY,
    claim_id varchar(64) NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    attempt_number integer NOT NULL,
    failure_reason varchar(64) NOT NULL,
    action varchar(32) NOT NULL,
    original_text text NOT NULL,
    candidate_text text,
    verification_label varchar(32),
    entailment_score double precision,
    contradiction_score double precision,
    neutral_score double precision,
    grounding_score double precision,
    model_version varchar(64),
    recovery_model_version varchar(64),
    created_at timestamptz NOT NULL,
    CONSTRAINT uq_claim_recovery_attempt UNIQUE (claim_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_claim_recovery_attempts_claim_id ON claim_recovery_attempts(claim_id);
