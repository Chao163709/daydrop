import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
    const url = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(fileURLToPath(url))) return next(url.href, context);
  }
  return next(specifier, context);
} });
// Exercise native failure recovery with adapters, without changing the host OS.
const storage = new Map();
globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) };
const { defaultSettings } = await import('../src/types.ts');
const { normalizeHotkey, readSettings, settingsStatement } = await import('../src/lib/settings.ts');
const { settingsRepository } = await import('../src/lib/settingsRepository.ts');
const { createSettingsStore } = await import('../src/store/useSettingsStore.ts');
const { emptyDesktopStatus } = await import('../src/lib/desktop.ts');
const { buildReminderQueue, dueReminders, REMINDER_LOOKBACK_MS } = await import('../src/lib/reminders.ts');
const { createEvent, rescheduleTask } = await import('../src/lib/calendar.ts');
const { createTask } = await import('../src/lib/tasks.ts');

assert.equal(normalizeHotkey(' ctrl + shift + d '), 'Control+Shift+D');
assert.equal(normalizeHotkey('Cmd+space'), 'Super+Space');
assert.equal(normalizeHotkey('CommandOrControl+F12'), 'CommandOrControl+F12');
for (const key of ['D', 'Ctrl+Alt', 'Alt+Alt+D', 'Alt++Space', 'Ctrl+Escape', 'CommandOrControl+Control+D']) assert.throws(() => normalizeHotkey(key));
const legacy = { mode: 'click', theme: 'dark', opacity: .91, hoverDelay: 500 };
assert.equal(readSettings(null, legacy).expandMode, 'click');
assert.equal(readSettings(null, legacy).theme, 'dark');
assert.equal(readSettings({ ...defaultSettings, schemaVersion: 2 }, legacy).theme, 'system');
assert.throws(() => readSettings({ opacity: 5 }), /不透明度/);
assert.throws(() => readSettings('bad'), /保留/);
storage.set('daydrop-window-preferences-v1', JSON.stringify({ state: legacy }));
const migrated = await settingsRepository.load();
assert.equal(migrated.opacity, .91);
assert.equal(JSON.parse(storage.get('daydrop-settings-v2')).schemaVersion, 2);
storage.set('daydrop-window-preferences-v1', JSON.stringify({ state: { theme: 'light' } }));
assert.equal((await settingsRepository.load()).theme, 'dark');
storage.set('daydrop-window-preferences-v1', 'corrupt legacy after migration');
assert.equal((await settingsRepository.load()).theme, 'dark');
await settingsRepository.save({ ...migrated, theme: 'light' });
assert.equal((await settingsRepository.load()).theme, 'light');
storage.set('daydrop-settings-v2', 'corrupt');
await assert.rejects(() => settingsRepository.load(), /保留/);
assert.equal(storage.get('daydrop-settings-v2'), 'corrupt');

const sql = new DatabaseSync(':memory:');
sql.exec(readFileSync(new URL('../src-tauri/migrations/001_initial.sql', import.meta.url), 'utf8'));
for (const theme of ['dark', 'light']) {
  const stmt = settingsStatement({ ...defaultSettings, theme });
  sql.prepare(stmt.sql.replace(/\$\d+/g, '?')).run(...stmt.values);
}
assert.equal(JSON.parse(sql.prepare('SELECT value FROM settings WHERE key = ?').get('preferences').value).theme, 'light');
assert.equal(sql.prepare('SELECT count(*) AS n FROM settings').get().n, 1);
sql.close();

let persisted = { ...defaultSettings }, saveFails = false, reads = 0, applied = [];
const repo = { load: async () => { reads++; return structuredClone(persisted); }, save: async (next) => { if (saveFails) throw Error('disk full'); persisted = structuredClone(next); } };
const preview = { available: false, initialize: async () => { throw Error('must not touch OS'); }, apply: async () => { throw Error('must not touch OS'); } };
const prefs = createSettingsStore(repo, preview, (next) => applied.push(next));
await Promise.all([prefs.getState().load(), prefs.getState().load()]);
assert.equal(reads, 1);
assert.equal(await prefs.getState().update({ theme: 'dark' }), true);
assert.equal(persisted.theme, 'dark');
assert.equal(await prefs.getState().update({ launchAtStartup: true }), false);
assert.match(prefs.getState().error, /桌面版/);
saveFails = true;
assert.equal(await prefs.getState().update({ theme: 'light' }), false);
assert.equal(prefs.getState().settings.theme, 'dark');
assert.equal(applied.at(-1).theme, 'dark');
saveFails = false;
await Promise.all([prefs.getState().update({ hoverDelay: 500 }), prefs.getState().update({ collapseDelay: 2000 })]);
assert.equal(persisted.hoverDelay, 500); assert.equal(persisted.collapseDelay, 2000);

let actualStartup = true, actualHotkey = defaultSettings.hotkey, forceRetry = false;
const desktop = { available: true, initialize: async () => ({ ...emptyDesktopStatus, startupEnabled: true, permissionGranted: true, shortcutError: 'occupied' }),
  apply: async (next, previous, retry) => {
    if (retry) forceRetry = true;
    if (next.hotkey === 'Alt+D') throw Error('occupied');
    actualHotkey = next.hotkey; actualStartup = next.launchAtStartup;
  } };
const nativePrefs = createSettingsStore(repo, desktop);
await nativePrefs.getState().load();
assert.equal(nativePrefs.getState().settings.launchAtStartup, true);
assert.equal(persisted.launchAtStartup, true);
assert.equal(await nativePrefs.getState().update({ hotkey: defaultSettings.hotkey }), true);
assert.equal(forceRetry, true); assert.equal(nativePrefs.getState().desktop.shortcutError, '');
assert.equal(await nativePrefs.getState().update({ hotkey: 'Alt+D' }), false);
assert.equal(actualHotkey, defaultSettings.hotkey);
assert.equal(nativePrefs.getState().settings.hotkey, defaultSettings.hotkey);
saveFails = true;
assert.equal(await nativePrefs.getState().update({ hotkey: 'Control+Shift+D', launchAtStartup: false }), false);
assert.equal(actualHotkey, defaultSettings.hotkey); assert.equal(actualStartup, true);
saveFails = false;
assert.equal(await nativePrefs.getState().update({ hotkey: 'ctrl+shift+d' }), true);
assert.equal(actualHotkey, 'Control+Shift+D');

const now = new Date(2026, 9, 10, 10), before = new Date(+now - 60_000).toISOString();
const task = createTask({ title: 'Reminder', note: '', priority: 'medium', tags: [], subtasks: [], repeat: 'none', dueAt: new Date(2026, 9, 10, 12).toISOString(), remindAt: before }, 1, now);
const excluded = [{ ...task, id: 'done', completed: true }, { ...task, id: 'archive', archived: true }, { ...task, id: 'old', remindAt: new Date(+now - REMINDER_LOOKBACK_MS - 1).toISOString() }];
const event = createEvent({ title: 'Meeting', startAt: new Date(2026, 9, 10, 10).toISOString(), endAt: new Date(2026, 9, 10, 11).toISOString(), allDay: false, color: '#5279d8', location: 'Office', note: '', repeat: 'weekly', remindAt: new Date(2026, 9, 10, 9, 30).toISOString() });
const queue = buildReminderQueue([task, ...excluded], [event], now);
assert.equal(queue.filter((item) => item.key.startsWith('task:')).length, 1);
assert.equal(queue.filter((item) => item.key.startsWith('event:')).length, 5);
assert.equal(dueReminders(queue, {}, +now).length, 2);
const ledger = Object.fromEntries(dueReminders(queue, {}, +now).map((item) => [item.key, +now]));
assert.equal(dueReminders(buildReminderQueue([task], [event], now), ledger, +now).length, 0);
assert.equal(dueReminders(queue, ledger, +now + 7 * REMINDER_LOOKBACK_MS).length, 1);
assert.equal(dueReminders([{ key: 'boundary', at: +now - REMINDER_LOOKBACK_MS, title: '', body: '' }], {}, +now).length, 1);
assert.equal(dueReminders([{ key: 'expired', at: +now - REMINDER_LOOKBACK_MS - 1, title: '', body: '' }], {}, +now).length, 0);
const moved = rescheduleTask(task, new Date(2026, 9, 12), now);
assert.notEqual(buildReminderQueue([moved], [], now)[0].key, queue.find((item) => item.key.startsWith('task:')).key);
assert.equal(dueReminders(buildReminderQueue([moved], [], now), ledger, +now).length, 0);
const lateReminder = { ...event, id: 'late', repeat: 'none', remindAt: new Date(2026, 9, 11, 9).toISOString() };
assert.equal(buildReminderQueue([], [lateReminder], now).length, 1);
const allDay = { ...event, id: 'all-day', allDay: true, startAt: '2026-10-10', endAt: '2026-10-11', repeat: 'daily', remindAt: new Date(2026, 9, 10, 8).toISOString() };
assert.equal(dueReminders(buildReminderQueue([], [allDay], now), {}, +now).length, 1);
const monthEnd = { ...event, id: 'month-end', startAt: new Date(2026, 0, 31, 10).toISOString(), endAt: new Date(2026, 0, 31, 11).toISOString(), remindAt: new Date(2026, 0, 31, 9, 30).toISOString(), repeat: 'monthly' };
assert.equal(new Date(buildReminderQueue([], [monthEnd], new Date(2026, 1, 27))[0].at).getDate(), 28);
console.log('PASS desktop settings: migration, SQLite upsert, persistence, serialized edits, OS reconciliation, rollback and shortcut retry');
console.log('PASS reminder queue: completion/archive, repeat occurrences, month-end, all-day, changed times, catch-up boundaries and restart deduplication');
