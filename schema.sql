-- Source of truth is public/data/workbench.json; D1 is the online query mirror.
CREATE TABLE IF NOT EXISTS sync_state (k TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS conversation_messages (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, occurred_on TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, source_kind TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_conversations_date ON conversation_messages(occurred_on,id);
CREATE TABLE IF NOT EXISTS observations (id TEXT PRIMARY KEY, occurred_on TEXT NOT NULL, kind TEXT NOT NULL, category TEXT NOT NULL, content TEXT NOT NULL, source TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_observations_date ON observations(occurred_on,id);
CREATE TABLE IF NOT EXISTS metrics (id TEXT PRIMARY KEY, occurred_on TEXT NOT NULL, name TEXT NOT NULL, value REAL NOT NULL, unit TEXT NOT NULL, note TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_metrics_name_date ON metrics(name,occurred_on);
CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, title TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL, details TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, occurred_on TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL);
