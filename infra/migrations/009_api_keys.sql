-- 009_api_keys.sql
-- GroundGuard API Key Authentication & Management

CREATE TABLE IF NOT EXISTS api_keys (
    id varchar(64) PRIMARY KEY,
    user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id varchar(64) REFERENCES projects(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    key_prefix varchar(32) NOT NULL,
    key_hash varchar(128) NOT NULL UNIQUE,
    last_used_at timestamptz,
    expires_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_project_id ON api_keys(project_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
