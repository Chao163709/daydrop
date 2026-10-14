import { isTauri } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';
import { defaultSettings } from '../types';
import { recoverBrowserBackup } from './backup';
export type StorageStatus = { mode: 'sqlite' | 'preview'; message: string };
let connection: Promise<Database> | undefined;
export function getDatabase(): Promise<Database> {
  return connection ??= Database.load('sqlite:daydrop.db').catch((error: unknown) => { connection = undefined; throw error; });
}
let initialization: Promise<StorageStatus> | undefined;
export function initializeDatabase(): Promise<StorageStatus> {
  return initialization ??= initialize().catch((error: unknown) => { initialization = undefined; throw error; });
}
async function initialize(): Promise<StorageStatus> {
  if (!isTauri()) { recoverBrowserBackup(); return { mode: 'preview', message: '浏览器本地存储' }; }
  const db = await getDatabase();
  await db.execute('INSERT OR IGNORE INTO settings (key, value) VALUES ($1, $2)', ['preferences', JSON.stringify(defaultSettings)]);
  await db.select('SELECT key FROM settings LIMIT 1');
  return { mode: 'sqlite', message: '本地数据库已就绪' };
}
