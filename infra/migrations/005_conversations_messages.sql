-- 005_conversations_messages.sql
-- GroundGuard Phase 5: Conversations and Messages
-- Ownership is traced through Project to User, so no user_id column here.
-- messages.generation_id is a plain column for now, the FK is added with the generations table.

CREATE TABLE IF NOT EXISTS conversations (
    id varchar(64) PRIMARY KEY,
    project_id varchar(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title varchar(255) NOT NULL DEFAULT 'New conversation',
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON conversations(project_id);

CREATE TABLE IF NOT EXISTS messages (
    id varchar(64) PRIMARY KEY,
    conversation_id varchar(64) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role varchar(16) NOT NULL,
    content text NOT NULL,
    generation_id varchar(64),
    created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id, created_at);