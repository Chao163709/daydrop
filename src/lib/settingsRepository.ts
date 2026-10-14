import { isTauri } from '@tauri-apps/api/core';
import { getDatabase } from './database';
import { readSettings, settingsStatement } from './settings';
import type { Settings } from '../types';

export interface SettingsRepository { load: () => Promise<Settings>; save: (settings: Settings) => Promise<void> }
const storageKey = 'daydrop-settings-v2';
export const settingsRepository: SettingsRepository = {
  async load() {
    const raw = isTauri()
      ? (await (await getDatabase()).select<{ value: string }[]>('SELECT value FROM settings WHERE key = $1', ['preferences']))[0]?.value
      : localStorage.getItem(storageKey);
    let parsed: unknown;
    try { parsed = raw ? JSON.parse(raw) : null; }
    catch { throw new Error('设置文件无法读取，原数据已保留'); }
    const migrated = !!(parsed && typeof parsed === 'object' && 'schemaVersion' in parsed && parsed.schemaVersion === 2);
    let legacy: unknown;
    if (!migrated) {
      const legacyText = localStorage.getItem('daydrop-window-preferences-v1');
      try { legacy = legacyText ? JSON.parse(legacyText).state : undefined; }
      catch { throw new Error('原浮窗偏好无法读取，原数据已保留'); }
    }
    const settings = readSettings(parsed, legacy);
    if (!migrated) await this.save(settings);
    return settings;
  },
  async save(settings) {
    const statement = settingsStatement(settings);
    if (isTauri()) await (await getDatabase()).execute(statement.sql, statement.values);
    else localStorage.setItem(storageKey, statement.values[1]);
  },
};
