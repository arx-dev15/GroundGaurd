-- 001_initial_schema.sql
-- GroundGuard Phase 2 Initial Schema: Users & Projects

CREATE TABLE IF NOT EXISTS users (
    id varchar(64),
    email varchar(255),
    password_hash text,
    name varchar(255),
    created_at timestamptz,
    updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS projects (
    id varchar(64),
    user_id varchar(64),
    name varchar(255),
    description text,
    created_at timestamptz,
    updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);


