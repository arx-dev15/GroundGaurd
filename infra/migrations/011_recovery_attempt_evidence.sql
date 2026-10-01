-- 011_recovery_attempt_evidence.sql
-- GroundGuard Phase 10: Recovery-Specific Evidence Provenance Exposure

ALTER TABLE claim_recovery_attempts
ADD COLUMN IF NOT EXISTS recovery_evidence jsonb;
