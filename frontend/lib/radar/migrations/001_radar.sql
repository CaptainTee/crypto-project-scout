-- Additive, repeatable foundation. Apply explicitly; application never migrates automatically.
BEGIN;
CREATE TABLE IF NOT EXISTS radar_projects (
  id text PRIMARY KEY, canonical_identity_key text NOT NULL UNIQUE,
  record jsonb NOT NULL, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS radar_identity_aliases (
  identity_key text PRIMARY KEY, project_id text NOT NULL REFERENCES radar_projects(id)
);
CREATE INDEX IF NOT EXISTS radar_alias_project_idx ON radar_identity_aliases(project_id);
CREATE TABLE IF NOT EXISTS radar_discovery_events (
  event_id text PRIMARY KEY, project_id text NOT NULL REFERENCES radar_projects(id),
  content_fingerprint text NOT NULL UNIQUE, retrieved_at timestamptz NOT NULL, record jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS radar_events_project_idx ON radar_discovery_events(project_id, retrieved_at);
CREATE TABLE IF NOT EXISTS radar_classifications (
  id text PRIMARY KEY, sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  project_id text NOT NULL REFERENCES radar_projects(id), classified_at timestamptz NOT NULL, record jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS radar_classification_project_idx ON radar_classifications(project_id, sequence DESC);
CREATE TABLE IF NOT EXISTS radar_review_state (
  project_id text PRIMARY KEY REFERENCES radar_projects(id),
  state text NOT NULL CHECK (state IN ('NEW','SEEN','REVIEWED','DISMISSED')), updated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS radar_monitor_runs (
  run_id text PRIMARY KEY, started_at timestamptz NOT NULL, record jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS radar_runs_started_idx ON radar_monitor_runs(started_at DESC);
COMMIT;
