CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK(length(trim(title)) > 0),
  note TEXT NOT NULL DEFAULT '', due_at TEXT, remind_at TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
  tags TEXT NOT NULL DEFAULT '[]', subtasks TEXT NOT NULL DEFAULT '[]',
  repeat TEXT NOT NULL DEFAULT 'none' CHECK(repeat IN ('none','daily','weekly','monthly')),
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sort_order REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at, completed, archived);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL CHECK(length(trim(title)) > 0),
  start_at TEXT NOT NULL, end_at TEXT NOT NULL CHECK(end_at >= start_at),
  all_day INTEGER NOT NULL DEFAULT 0 CHECK(all_day IN (0,1)),
  color TEXT NOT NULL DEFAULT '#5279d8', location TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
  repeat TEXT NOT NULL DEFAULT 'none' CHECK(repeat IN ('none','daily','weekly','monthly')), remind_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_dates ON events(start_at, end_at);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
