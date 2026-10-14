import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

// Node 24 strips TypeScript; resolve the extensionless imports used by Vite.
registerHooks({ resolve(specifier, context, next) {
  if (specifier.startsWith('.') && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
    const url = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(fileURLToPath(url))) return next(url.href, context);
  }
  return next(specifier, context);
} });
const { createTask, todayTasks, selectTasks, nextOccurrence, quickDueAt } = await import('../src/lib/tasks.ts');
const { upsertStatement, fromRow } = await import('../src/lib/taskSql.ts');
const { createTaskStore } = await import('../src/store/useTaskStore.ts');
const now = new Date(2026, 9, 10, 12);
assert.equal(quickDueAt('unscheduled', now), null);
assert.equal(new Date(quickDueAt('today', now)).getDate(), 10);
assert.equal(new Date(quickDueAt('tomorrow', new Date(2026, 0, 31, 23, 59))).getMonth(), 1);
assert.equal(new Date(quickDueAt('today', now)).getHours(), 23);
const draft = { title: '  买咖啡  ', note: '无糖', dueAt: null, remindAt: null, priority: 'high', tags: ['生活', '生活'], subtasks: [], repeat: 'none' };
const task = createTask(draft, 1, now);
assert.equal(task.title, '买咖啡');
assert.deepEqual(task.tags, ['生活']);
assert.throws(() => createTask({ ...draft, title: '  ' }, 1), /标题/);
const tomorrow = createTask({ ...draft, title: '明天', dueAt: new Date(2026, 9, 11, 12).toISOString() }, 2, now);
const overdue = createTask({ ...draft, title: '逾期', dueAt: new Date(2026, 9, 9, 12).toISOString() }, 3, now);
assert.deepEqual(selectTasks([task, tomorrow, overdue], 'all', 'unscheduled', '', '', 'manual', now).map(t => t.id), [task.id]);
assert.deepEqual(selectTasks([task, tomorrow, overdue, { ...overdue, id: 'archived', archived: true }, { ...overdue, id: 'done', completed: true }], 'all', 'overdue', '', '', 'manual', now).map(t => t.id), [overdue.id]);
assert.equal(todayTasks([task, tomorrow, overdue], now).length, 2);
assert.equal(selectTasks([task, tomorrow, overdue], 'all', 'upcoming', '', '', 'due', now)[0].id, tomorrow.id);
assert.equal(selectTasks([task], 'all', 'active', '无糖', '', 'manual', now).length, 1);
const recurring = createTask({ ...draft, repeat: 'daily', dueAt: new Date(2026, 9, 1, 15).toISOString(), subtasks: [{ id: 'step', title: '步骤', completed: true }] }, 1, now);
const next = nextOccurrence(recurring, 2, now);
assert.ok(new Date(next.dueAt) > now);
assert.equal(next.subtasks[0].completed, false);
assert.notEqual(next.subtasks[0].id, 'step');

const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../src-tauri/migrations/001_initial.sql', import.meta.url), 'utf8'));
db.exec(readFileSync(new URL('../src-tauri/migrations/002_task_history.sql', import.meta.url), 'utf8'));
function saveSql(rows) { const statement = upsertStatement(rows); db.prepare(statement.sql).run(Object.fromEntries(statement.values.map((value, i) => ['$' + (i + 1), value]))); }
saveSql([task, next]);
assert.deepEqual(fromRow(db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id)), task);
const updated = { ...task, completed: true, completedAt: now.toISOString() };
const duplicate = { ...next, id: 'duplicate', title: '不应插入' };
assert.throws(() => saveSql([updated, duplicate]), /UNIQUE/);
assert.equal(db.prepare('SELECT completed FROM tasks WHERE id = ?').get(task.id).completed, 0, 'Failed recurrence insert must roll back completion too');
saveSql([updated]);
assert.equal(db.prepare('SELECT completed FROM tasks WHERE id = ?').get(task.id).completed, 1);
db.close();

let persisted = [], fail = false;
const repository = {
  async load() { return structuredClone(persisted); },
  async save(rows) { if (fail) throw new Error('磁盘写入失败'); const ids = new Set(rows.map(row => row.id)); persisted = structuredClone([...persisted.filter(row => !ids.has(row.id)), ...rows]); },
  async remove(id) { persisted = persisted.filter(row => row.id !== id); },
};
const store = createTaskStore(repository);
await store.getState().load();
assert.equal(await store.getState().add(draft), true);
const id = store.getState().tasks[0].id;
fail = true;
assert.equal(await store.getState().toggle(id), false);
assert.equal(store.getState().tasks[0].completed, false, 'A failed save must not appear successful');
fail = false;
await store.getState().toggle(id);
await store.getState().archive(id);
const restored = createTaskStore(repository);
await restored.getState().load();
assert.equal(restored.getState().tasks[0].completed, true);
assert.equal(restored.getState().tasks[0].archived, true);
await restored.getState().archive(id);
await restored.getState().add({ ...draft, title: '第二件' });
const second = restored.getState().tasks.find(row => row.title === '第二件');
await restored.getState().move(second.id, id);
assert.ok(restored.getState().tasks.find(row => row.id === second.id).order < restored.getState().tasks.find(row => row.id === id).order);
await restored.getState().remove(id);
assert.equal(persisted.some(row => row.id === id), false);
await restored.getState().add({ ...draft, repeat: 'weekly' });
const repeat = restored.getState().tasks.find(row => row.repeat === 'weekly');
await restored.getState().toggle(repeat.id);
await restored.getState().toggle(repeat.id);
await restored.getState().toggle(repeat.id);
assert.equal(restored.getState().tasks.filter(row => row.repeatSourceId === repeat.id).length, 1);

const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
const { taskRepository } = await import('../src/lib/taskRepository.ts');
await taskRepository.save([task]);
assert.deepEqual(await taskRepository.load(), [task]);
await taskRepository.remove(task.id);
assert.equal((await taskRepository.load()).length, 0);
console.log('PASS: validation, local dates, filtering, recurrence, SQLite round trip and atomicity, write failure recovery, restart persistence, sorting, archive, delete, browser storage');
