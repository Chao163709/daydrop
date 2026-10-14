import { defaultSettings, type Settings } from '../types';

export function normalizeHotkey(value: string): string {
  if (typeof value !== 'string' || value.length > 64) throw new Error('快捷键格式无效');
  const parts = value.trim().split('+').map((part) => part.trim());
  const key = parts.pop() ?? '';
  const modifiers = ['Control', 'Alt', 'Shift', 'Super', 'CommandOrControl'];
  const aliases: Record<string, string> = { ctrl: 'Control', control: 'Control', alt: 'Alt', option: 'Alt', shift: 'Shift', cmd: 'Super', command: 'Super', super: 'Super', meta: 'Super', commandorcontrol: 'CommandOrControl' };
  const mapped = parts.map((part) => aliases[part.toLowerCase()]);
  if (!mapped.length || mapped.some((part) => !part) || new Set(mapped).size !== mapped.length) throw new Error('快捷键需要修饰键，例如 Alt+Space 或 Control+Shift+D');
  if (mapped.includes('CommandOrControl') && (mapped.includes('Control') || mapped.includes('Super'))) throw new Error('请勿重复设置 Control / Command 修饰键');
  const normalizedKey = key.toLowerCase() === 'space' ? 'Space' : /^[a-z]$/i.test(key) ? key.toUpperCase() : /^[0-9]$/.test(key) ? key : /^f([1-9]|1[0-9]|2[0-4])$/i.test(key) ? key.toUpperCase() : '';
  if (!normalizedKey) throw new Error('主键支持字母、数字、Space 和 F1–F24');
  return [...modifiers.filter((part) => mapped.includes(part)), normalizedKey].join('+');
}

export function validateSettings(value: Settings): Settings {
  if (!['hover', 'click', 'pinned'].includes(value.expandMode) || !['light', 'dark', 'system'].includes(value.theme)) throw new Error('外观或展开方式无效');
  for (const key of ['launchAtStartup', 'alwaysOnTop', 'notificationsEnabled'] as const) if (typeof value[key] !== 'boolean') throw new Error('设置格式无效');
  for (const key of ['hoverDelay', 'collapseDelay'] as const) if (!Number.isFinite(value[key]) || value[key] < 100 || value[key] > 5000) throw new Error('延迟应在 100–5000 毫秒之间');
  if (!Number.isFinite(value.opacity) || value.opacity < .65 || value.opacity > .98) throw new Error('不透明度应在 65%–98% 之间');
  if (!Number.isFinite(value.width) || value.width < 360 || value.width > 420) throw new Error('宽度应在 360–420 像素之间');
  if (!/^#[0-9a-f]{6}$/i.test(value.accentColor)) throw new Error('强调色格式无效');
  return { ...value, hotkey: normalizeHotkey(value.hotkey) };
}

export function readSettings(raw: unknown, legacy?: unknown): Settings {
  if (raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) throw new Error('已保存的设置无法读取，原数据已保留');
  const saved = raw as Partial<Settings> & { schemaVersion?: number } | null;
  const result = { ...defaultSettings, ...saved };
  // Phase 1–4 window preferences lived in localStorage. Copy them only once.
  if (saved?.schemaVersion !== 2 && legacy && typeof legacy === 'object') {
    const prefs = legacy as Record<string, unknown>;
    for (const key of ['alwaysOnTop', 'hoverDelay', 'collapseDelay', 'theme', 'opacity'] as const) if (key in prefs) Object.assign(result, { [key]: prefs[key] });
    if ('mode' in prefs) result.expandMode = prefs.mode as Settings['expandMode'];
  }
  return validateSettings(result);
}

export function settingsStatement(settings: Settings) {
  return { sql: 'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value', values: ['preferences', JSON.stringify({ ...validateSettings(settings), schemaVersion: 2 })] };
}
