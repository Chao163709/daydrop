import type { Task, CalendarEvent, Settings } from '../types';
import { validateDraft } from './tasks';
import { validateEvent } from './calendar';
import { validateSettings } from './settings';
import { format } from 'date-fns';

export function backupFileName(now = new Date()) { return `Daydrop-backup-${format(now, 'yyyy-MM-dd')}.json`; }

export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export interface BackupData { tasks: Task[]; events: CalendarEvent[]; settings: Settings }
export interface Backup extends BackupData { format: 'daydrop-backup'; version: 1; exportedAt: string }
const keys = ['daydrop-tasks-v1', 'daydrop-events-v1'] as const;
const journalKey = 'daydrop-import-journal-v1';
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('备份字段格式不正确');
  return value as Record<string, unknown>;
};
const string = (value: unknown, max = 100000) => {
  if (typeof value !== 'string' || value.length > max) throw new Error('备份文本字段格式不正确');
  return value;
};
const id = (value: unknown) => { const text = string(value, 200); if (!text.trim()) throw new Error('备份 ID 不能为空'); return text; };
const date = (value: unknown, nullable = true) => {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error('备份日期格式不正确');
};
function uniqueRows(value: unknown, validate: (row: Record<string, unknown>) => void) {
  if (!Array.isArray(value) || value.length > 10000) throw new Error('备份列表格式不正确或超过 10000 条');
  const seen = new Set<string>();
  for (const raw of value) { const row = object(raw), key = id(row.id); if (seen.has(key)) throw new Error('备份存在重复 ID'); seen.add(key); validate(row); }
  return value;
}
export function parseBackup(text: string): Backup {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error('备份文件不能超过 20 MB');
  let parsed: unknown;
  try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new Error('无法解析 JSON 备份'); }
  const row = object(parsed);
  if (row.format !== 'daydrop-backup' || row.version !== 1) throw new Error('不支持此备份格式或版本');
  date(row.exportedAt, false);
  const tasks = uniqueRows(row.tasks, (task) => {
    string(task.title, 160); string(task.note);
    for (const key of ['dueAt', 'remindAt', 'completedAt']) date(task[key]);
    for (const key of ['createdAt', 'updatedAt']) date(task[key], false);
    if (typeof task.completed !== 'boolean' || typeof task.archived !== 'boolean' || typeof task.order !== 'number' || !Number.isFinite(task.order)) throw new Error('任务状态或排序格式不正确');
    if (task.repeatSourceId !== null) id(task.repeatSourceId);
    if (!Array.isArray(task.tags) || task.tags.length > 100) throw new Error('标签格式不正确');
    task.tags.forEach((tag) => string(tag, 100));
    uniqueRows(task.subtasks, (subtask) => { string(subtask.title, 160); if (typeof subtask.completed !== 'boolean') throw new Error('子任务状态格式不正确'); });
    validateDraft(task as unknown as Task);
  }) as Task[];
  const events = uniqueRows(row.events, (event) => {
    string(event.title, 160); string(event.note); string(event.location, 1000); string(event.color, 7);
    date(event.remindAt); validateEvent(event as unknown as CalendarEvent);
  }) as CalendarEvent[];
  const settings = validateSettings(object(row.settings) as unknown as Settings);
  return { format: 'daydrop-backup', version: 1, exportedAt: row.exportedAt as string, tasks, events, settings };
}
export function serializeBackup(data: BackupData) {
  const text = JSON.stringify({ format: 'daydrop-backup', version: 1, exportedAt: new Date().toISOString(), ...data }, null, 2);
  parseBackup(text); return text;
}
// Existing records win. Importing the same file twice cannot duplicate or overwrite them.
export function mergeBackup(current: BackupData, incoming: BackupData): BackupData {
  const merge = <T extends { id: string }>(existing: T[], added: T[]) => {
    const ids = new Set(existing.map((row) => row.id)); return [...existing, ...added.filter((row) => !ids.has(row.id))];
  };
  return { tasks: merge(current.tasks, incoming.tasks), events: merge(current.events, incoming.events), settings: current.settings };
}
export function recoverBrowserBackup(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage) {
  const text = storage.getItem(journalKey); if (!text) return;
  const previous = JSON.parse(text) as (string | null)[];
  if (!Array.isArray(previous) || previous.length !== 2 || previous.some((v) => v !== null && typeof v !== 'string')) throw new Error('导入恢复记录损坏，原数据已保留');
  keys.forEach((key, i) => { if (previous[i] === null) storage.removeItem(key); else storage.setItem(key, previous[i]!); });
  storage.removeItem(journalKey);
}
export function saveBrowserBackup(data: Pick<BackupData, 'tasks' | 'events'>, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage) {
  recoverBrowserBackup(storage);
  storage.setItem(journalKey, JSON.stringify(keys.map((key) => storage.getItem(key))));
  try { storage.setItem(keys[0], JSON.stringify(data.tasks)); storage.setItem(keys[1], JSON.stringify(data.events)); storage.removeItem(journalKey); }
  catch (error) { recoverBrowserBackup(storage); throw error; }
}
