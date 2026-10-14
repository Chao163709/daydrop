ALTER TABLE tasks ADD COLUMN completed_at TEXT;
ALTER TABLE tasks ADD COLUMN repeat_source_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_repeat_source ON tasks(repeat_source_id) WHERE repeat_source_id IS NOT NULL;
