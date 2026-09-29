-- 010_evaluations.sql
-- GroundGuard Benchmark Evaluations and Metric Snapshots

CREATE TABLE IF NOT EXISTS evaluations (
    id varchar(64) PRIMARY KEY,
    project_id varchar(64) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id varchar(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    status varchar(32) NOT NULL,
    dataset varchar(255),
    model_version varchar(64),
    metrics jsonb,
    error_message text,
    created_at timestamptz NOT NULL,
    completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_evaluations_project_id ON evaluations(project_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_user_id ON evaluations(user_id);

CREATE TABLE IF NOT EXISTS evaluation_results (
    id varchar(64) PRIMARY KEY,
    evaluation_id varchar(64) NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    case_id varchar(128) NOT NULL,
    claim text NOT NULL,
    expected_label varchar(32),
    predicted_label varchar(32),
    grounding_score double precision,
    passed boolean NOT NULL,
    latency_ms integer,
    evidence jsonb,
    created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evaluation_results_evaluation_id ON evaluation_results(evaluation_id);
