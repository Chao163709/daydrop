import type { Task } from '../types';
export interface TaskRow {
  id: string; title: string; note: string; due_at: string | null; remind_at: string | null; priority: Task['priority']; tags: string; subtasks: string;
  repeat: Task['repeat']; completed: number; archived: number; created_at: string; updated_at: string; sort_order: number;
  completed_at: string | null; repeat_source_id: string | null;
}
export function fromRow(row: TaskRow): Task {
  return { id: row.id, title: row.title, note: row.note, dueAt: row.due_at, remindAt: row.remind_at, priority: row.priority, tags: JSON.parse(row.tags), subtasks: JSON.parse(row.subtasks), repeat: row.repeat, completed: !!row.completed, archived: !!row.archived, createdAt: row.created_at, updatedAt: row.updated_at, order: row.sort_order, completedAt: row.completed_at, repeatSourceId: row.repeat_source_id };
}
export function upsertStatement(tasks: Task[]) {
  const columns = 'id,title,note,due_at,remind_at,priority,tags,subtasks,repeat,completed,archived,created_at,updated_at,sort_order,completed_at,repeat_source_id';
  const values: (string | number | null)[] = [];
  const groups = tasks.map((task) => {
    const data = [task.id, task.title, task.note, task.dueAt, task.remindAt, task.priority, JSON.stringify(task.tags), JSON.stringify(task.subtasks), task.repeat, Number(task.completed), Number(task.archived), task.createdAt, task.updatedAt, task.order, task.completedAt, task.repeatSourceId];
    return '(' + data.map((value) => { values.push(value); return '$' + values.length; }).join(',') + ')';
  });
  return { sql: `INSERT INTO tasks (${columns}) VALUES ${groups.join(',')} ON CONFLICT(id) DO UPDATE SET ${columns.split(',').filter((key) => key !== 'id').map((key) => `${key}=excluded.${key}`).join(',')}`, values };
}
