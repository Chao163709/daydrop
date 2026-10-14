import { isTauri } from '@tauri-apps/api/core';
import type { Task } from '../types';
import { getDatabase, initializeDatabase } from './database';
import { fromRow, upsertStatement, type TaskRow } from './taskSql';
import { validateDraft } from './tasks';
export interface TaskRepository { load: () => Promise<Task[]>; save: (tasks: Task[]) => Promise<void>; remove: (id: string) => Promise<void> }
const browserKey = 'daydrop-tasks-v1';
function readBrowser(): Task[] {
  const text = localStorage.getItem(browserKey);
  if (!text) return [];
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('任务数据格式异常，原数据已保留');
  for (const value of parsed) {
    if (!value || typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.note !== 'string' || !Array.isArray(value.tags) || !Array.isArray(value.subtasks) || !Number.isFinite(value.order) || typeof value.completed !== 'boolean' || typeof value.archived !== 'boolean') throw new Error('任务数据格式异常，原数据已保留');
    validateDraft(value);
  }
  return parsed as Task[];
}
export const taskRepository: TaskRepository = {
  async load() {
    await initializeDatabase();
    if (!isTauri()) return readBrowser();
    return (await (await getDatabase()).select<TaskRow[]>('SELECT * FROM tasks ORDER BY sort_order, created_at')).map(fromRow);
  },
  async save(tasks) {
    if (!tasks.length) return;
    if (!isTauri()) {
      const existing = readBrowser(), updated = new Map(tasks.map((task) => [task.id, task]));
      localStorage.setItem(browserKey, JSON.stringify([...existing.filter((task) => !updated.has(task.id)), ...tasks]));
      return;
    }
    const statement = upsertStatement(tasks);
    // A single statement keeps completion and its next occurrence atomic on the SQL pool.
    await (await getDatabase()).execute(statement.sql, statement.values);
  },
  async remove(id) {
    if (!isTauri()) { localStorage.setItem(browserKey, JSON.stringify(readBrowser().filter((task) => task.id !== id))); return; }
    await (await getDatabase()).execute('DELETE FROM tasks WHERE id = $1', [id]);
  },
};
