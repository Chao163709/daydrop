import { create } from 'zustand';
import type { Task } from '../types';
import { createTask, nextOccurrence, validateDraft, type TaskDraft } from '../lib/tasks';
import { taskRepository, type TaskRepository } from '../lib/taskRepository';
import { rescheduleTask } from '../lib/calendar';
interface TaskState {
  tasks: Task[]; loaded: boolean; busy: boolean; error: string;
  load: () => Promise<void>; add: (draft: TaskDraft) => Promise<boolean>; update: (id: string, draft: TaskDraft) => Promise<boolean>;
  toggle: (id: string) => Promise<boolean>; archive: (id: string) => Promise<boolean>; remove: (id: string) => Promise<boolean>;
  move: (id: string, target: string) => Promise<boolean>; clearError: () => void;
  reschedule: (id: string, day: Date) => Promise<boolean>;
}
export function createTaskStore(repository: TaskRepository) {
  let loading: Promise<void> | undefined, queue: Promise<unknown> = Promise.resolve();
  return create<TaskState>((set, get) => {
    const mutate = (action: () => Promise<void>) => {
      const result = queue.then(async () => {
        if (!get().loaded) throw new Error('任务尚未加载，请重试加载后再操作');
        set({ busy: true, error: '' });
        try { await action(); return true; } finally { set({ busy: false }); }
      }).catch((error: unknown) => { set({ error: error instanceof Error ? error.message : String(error) }); return false; });
      queue = result; return result;
    };
    const commit = async (rows: Task[]) => {
      await repository.save(rows);
      const changed = new Map(rows.map((task) => [task.id, task]));
      set({ tasks: [...get().tasks.filter((task) => !changed.has(task.id)), ...rows] });
    };
    const order = () => Math.max(0, ...get().tasks.map((task) => task.order)) + 1;
    const find = (id: string) => { const task = get().tasks.find((task) => task.id === id); if (!task) throw new Error('任务已不存在'); return task; };
    return {
      tasks: [], loaded: false, busy: false, error: '', clearError: () => set({ error: '' }),
      load: () => get().loaded ? Promise.resolve() : loading ??= (async () => {
        try { set({ busy: true, error: '' }); const tasks = await repository.load(); set({ tasks, loaded: true }); }
        catch (error: unknown) { set({ error: error instanceof Error ? error.message : String(error) }); }
        finally { set({ busy: false }); loading = undefined; }
      })(),
      add: (draft) => mutate(async () => { await commit([createTask(draft, order())]); }),
      update: (id, draft) => mutate(async () => { validateDraft(draft); const task = find(id); await commit([{ ...task, ...draft, title: draft.title.trim(), tags: [...new Set(draft.tags.map((tag) => tag.trim()).filter(Boolean))], updatedAt: new Date().toISOString() }]); }),
      toggle: (id) => mutate(async () => {
        const task = find(id), now = new Date(), completed = !task.completed;
        const updated = { ...task, completed, completedAt: completed ? now.toISOString() : null, updatedAt: now.toISOString() };
        const next = completed && !task.archived && !get().tasks.some((row) => row.repeatSourceId === task.id) ? nextOccurrence(task, order(), now) : null;
        await commit(next ? [updated, next] : [updated]);
      }),
      archive: (id) => mutate(async () => { const task = find(id); await commit([{ ...task, archived: !task.archived, updatedAt: new Date().toISOString() }]); }),
      reschedule: (id, day) => mutate(async () => { await commit([rescheduleTask(find(id), day)]); }),
      remove: (id) => mutate(async () => { await repository.remove(id); set({ tasks: get().tasks.filter((task) => task.id !== id) }); }),
      move: (id, target) => mutate(async () => {
        if (id === target) return;
        const rows = [...get().tasks].sort((a, b) => a.order - b.order), from = rows.findIndex((task) => task.id === id), to = rows.findIndex((task) => task.id === target);
        if (from < 0 || to < 0) throw new Error('排序任务已不存在');
        const [task] = rows.splice(from, 1); rows.splice(to, 0, task);
        const index = rows.findIndex((row) => row.id === id), before = rows[index - 1]?.order, after = rows[index + 1]?.order;
        const value = before === undefined ? after! - 1 : after === undefined ? before + 1 : (before + after) / 2;
        if (!Number.isFinite(value) || value === before || value === after) throw new Error('排序间距已耗尽，请切换其他排序方式');
        await commit([{ ...task, order: value, updatedAt: new Date().toISOString() }]);
      }),
    };
  });
}
export const useTaskStore = createTaskStore(taskRepository);
