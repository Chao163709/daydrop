import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
    const url = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(fileURLToPath(url))) return next(url.href, context);
  }
  return next(specifier, context);
} });
const { parseBackup, serializeBackup, mergeBackup, saveBrowserBackup, recoverBrowserBackup, backupFileName } = await import('../src/lib/backup.ts');
const { defaultSettings } = await import('../src/types.ts');
assert.equal(backupFileName(new Date(2026, 9, 11, 0, 1)), 'Daydrop-backup-2026-10-11.json');
const { createTask } = await import('../src/lib/tasks.ts');
const task = createTask({ title: '备份测试', note: '', dueAt: null, remindAt: null, priority: 'medium', tags: ['工作'], subtasks: [], repeat: 'none' }, 1);
const original = { tasks: [task], events: [], settings: defaultSettings };
const backup = parseBackup(serializeBackup(original));
assert.deepEqual(backup.tasks, original.tasks);
assert.deepEqual(backup.settings, defaultSettings);
assert.throws(() => parseBackup('{'), /JSON/);
for (const patch of [{ format: 'other' }, { version: 99 }, { tasks: [task, task] }, { tasks: [{ ...task, tags: [5] }] }, { tasks: [{ ...task, completed: 'false' }] }, { tasks: [{ ...task, createdAt: 'bad' }] }, { events: [{ id: 'bad' }] }, { settings: { ...defaultSettings, opacity: 9 } }]) {
  assert.throws(() => parseBackup(JSON.stringify({ ...backup, ...patch })));
}
const changed = { ...task, title: '来自备份' };
const merged = mergeBackup(original, { ...backup, tasks: [changed, { ...task, id: 'new-task' }] });
assert.equal(merged.tasks.length, 2);
assert.equal(merged.tasks[0].title, task.title);
const data = new Map([['daydrop-tasks-v1', '["old"]'], ['daydrop-events-v1', '[]']]);
const storage = { getItem: (k) => data.get(k) ?? null, removeItem: (k) => data.delete(k), setItem: (k, v) => { if (k === 'daydrop-events-v1' && v !== '[]') throw new Error('quota'); data.set(k, v); } };
assert.throws(() => saveBrowserBackup({ ...merged, events: [{ id: 'test' }] }, storage), /quota/);
assert.equal(data.get('daydrop-tasks-v1'), '["old"]');
data.set('daydrop-import-journal-v1', JSON.stringify(['["before-crash"]', null]));
data.set('daydrop-tasks-v1', '["partially-written"]');
recoverBrowserBackup(storage);
assert.equal(data.get('daydrop-tasks-v1'), '["before-crash"]');
assert.equal(data.has('daydrop-events-v1'), false);
assert.equal(data.has('daydrop-import-journal-v1'), false);
const event = { id: 'event', title: '全天安排', startAt: '2026-10-10', endAt: '2026-10-11', allDay: true, color: '#5279d8', location: '', note: '', repeat: 'none', remindAt: null };
assert.deepEqual(parseBackup(serializeBackup({ ...original, events: [event] })).events, [event]);
assert.throws(() => parseBackup(serializeBackup({ ...original, events: [{ ...event, startAt: '2026-02-30' }] })));
console.log('Backup validation, merge preservation and storage rollback passed.');
