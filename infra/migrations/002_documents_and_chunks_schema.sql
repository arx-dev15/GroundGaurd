-- 002_documents_and_chunks_schema.sql
-- GroundGuard Phase 3: Documents and Vector Chunks Schema



CREATE TABLE IF NOT EXISTS documents (
    id varchar(64) PRIMARY KEY,
    project_id varchar(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename varchar(255) NOT NULL,
    file_size integer NOT NULL,
    mime_type varchar(128) NOT NULL,
    file_path text NOT NULL,
    status varchar(32) NOT NULL DEFAULT 'uploaded',
    error_message text,
    chunks_count integer DEFAULT 0,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);

CREATE TABLE IF NOT EXISTS chunks (
    id varchar(64) PRIMARY KEY,
    document_id varchar(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index integer NOT NULL,
    page_number integer NOT NULL,
    text text NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON chunks(document_id);
