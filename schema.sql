-- Curated discussion data mirrored from GitHub.
CREATE TABLE IF NOT EXISTS sync_state (k TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  source_kind TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_date ON conversation_messages(occurred_on,id);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  occurred_on TEXT NOT NULL,
  kind TEXT NOT NULL,
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_observations_date ON observations(occurred_on,id);

CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  occurred_on TEXT NOT NULL,
  name TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT NOT NULL,
  note TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_metrics_name_date ON metrics(name,occurred_on);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL,
  details TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  occurred_on TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL
);

-- User-entered records. One row is one submit action; structured payload is JSON.
-- This keeps a whole day's subject homework in one atomic record.
CREATE TABLE IF NOT EXISTS user_records (
  id TEXT PRIMARY KEY,
  record_date TEXT NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  commit_sha TEXT
);
CREATE INDEX IF NOT EXISTS idx_user_records_date_type ON user_records(record_date DESC,type);


-- V0.4 device authorization. No private key or edit code is stored here.
CREATE TABLE IF NOT EXISTS authorized_devices (
  device_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  public_jwk TEXT NOT NULL,
  status TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS auth_requests (
  request_code TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  label TEXT NOT NULL,
  public_jwk TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_challenges (
  challenge_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  challenge_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
