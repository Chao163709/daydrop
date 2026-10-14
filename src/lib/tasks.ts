import { addDays, addWeeks, addMonths, endOfDay, isSameDay, startOfDay } from 'date-fns';
import type { Task } from '../types';
export type TaskDraft = Pick<Task, 'title' | 'note' | 'dueAt' | 'remindAt' | 'priority' | 'tags' | 'subtasks' | 'repeat'>;
export type TaskFilter = 'active' | 'upcoming' | 'completed' | 'archived' | 'unscheduled' | 'overdue';
export type QuickSchedule = 'today' | 'tomorrow' | 'unscheduled';
export function quickDueAt(schedule: QuickSchedule, now = new Date()): string | null {
  return schedule === 'unscheduled' ? null : endOfDay(schedule === 'tomorrow' ? addDays(now, 1) : now).toISOString();
}
export type TaskSort = 'manual' | 'due' | 'priority' | 'created';
export function validateDraft(draft: TaskDraft) {
  if (!draft.title.trim()) throw new Error('请输入任务标题');
  if (draft.title.trim().length > 160) throw new Error('标题不能超过 160 个字符');
  for (const value of [draft.dueAt, draft.remindAt]) if (value !== null && !Number.isFinite(Date.parse(value))) throw new Error('时间格式不正确');
  if (!['low', 'medium', 'high'].includes(draft.priority)) throw new Error('优先级不正确');
  if (!['none', 'daily', 'weekly', 'monthly'].includes(draft.repeat)) throw new Error('重复规则不正确');
}
export function createTask(draft: TaskDraft, order: number, now = new Date()): Task {
  validateDraft(draft);
  const timestamp = now.toISOString();
  return { ...draft, title: draft.title.trim(), tags: [...new Set(draft.tags.map((tag) => tag.trim()).filter(Boolean))], id: crypto.randomUUID(), order, completed: false, archived: false, createdAt: timestamp, updatedAt: timestamp, completedAt: null, repeatSourceId: null };
}
export function todayTasks(tasks: Task[], now = new Date()) {
  const today = startOfDay(now);
  return tasks.filter((task) => !task.archived && (task.completed
    ? !!task.completedAt && isSameDay(new Date(task.completedAt), now)
    : !task.dueAt || isSameDay(new Date(task.dueAt), now) || new Date(task.dueAt) < today));
}
export function selectTasks(tasks: Task[], tab: 'today' | 'all', filter: TaskFilter, query: string, priority: string, sort: TaskSort, now = new Date()) {
  let rows = tab === 'today' ? todayTasks(tasks, now) : tasks;
  rows = rows.filter((task) => filter === 'archived' ? task.archived : !task.archived && (filter === 'completed' ? task.completed : !task.completed && (filter !== 'upcoming' || !!task.dueAt && new Date(task.dueAt) >= startOfDay(now) && new Date(task.dueAt) <= endOfDay(addDays(now, 7)))));
  if (filter === 'unscheduled') rows = rows.filter((task) => !task.dueAt);
  if (filter === 'overdue') rows = rows.filter((task) => !!task.dueAt && new Date(task.dueAt) < now);
  const needle = query.trim().toLocaleLowerCase();
  rows = rows.filter((task) => (!needle || [task.title, task.note, ...task.tags].join(' ').toLocaleLowerCase().includes(needle)) && (!priority || task.priority === priority));
  const ranks = { high: 0, medium: 1, low: 2 };
  return [...rows].sort((a, b) => (sort === 'due' ? (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity) : sort === 'priority' ? ranks[a.priority] - ranks[b.priority] : sort === 'created' ? Date.parse(b.createdAt) - Date.parse(a.createdAt) : a.order - b.order) || a.order - b.order || a.id.localeCompare(b.id));
}
export function nextOccurrence(task: Task, order: number, now = new Date()): Task | null {
  if (task.repeat === 'none') return null;
  const advance = task.repeat === 'daily' ? addDays : task.repeat === 'weekly' ? addWeeks : addMonths;
  let due = new Date(task.dueAt ?? endOfDay(now).toISOString());
  do { due = advance(due, 1); } while (due <= now);
  const remindAt = task.remindAt && task.dueAt ? new Date(due.getTime() - (Date.parse(task.dueAt) - Date.parse(task.remindAt))).toISOString() : null;
  return { ...createTask({ ...task, dueAt: due.toISOString(), remindAt, subtasks: task.subtasks.map((subtask) => ({ ...subtask, id: crypto.randomUUID(), completed: false })) }, order, now), repeatSourceId: task.id };
}
