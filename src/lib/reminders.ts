import { addDays, format } from 'date-fns';
import type { CalendarEvent, Task } from '../types';
import { occurrencesInRange, readEventDate } from './calendar';

export const REMINDER_LOOKBACK_MS = 24 * 60 * 60 * 1000;
export interface Reminder { key: string; at: number; title: string; body: string }
// The native timer holds a rolling 32-day queue; React refreshes it every minute
// and whenever tasks/events change. Native delivery does not depend on UI timers.
export function buildReminderQueue(tasks: Task[], events: CalendarEvent[], now = new Date()): Reminder[] {
  const first = +now - REMINDER_LOOKBACK_MS, last = +addDays(now, 32);
  const result: Reminder[] = [];
  const include = (reminder: Reminder) => { if (Number.isFinite(reminder.at) && reminder.at >= first && reminder.at < last) result.push(reminder); };
  for (const task of tasks) {
    if (task.completed || task.archived || !task.remindAt) continue;
    const at = Date.parse(task.remindAt);
    include({ key: `task:${task.id}:${at}`, at, title: `任务提醒 · ${task.title}`, body: task.dueAt ? `截止 ${format(new Date(task.dueAt), 'M月d日 HH:mm')}` : '有一项待办需要你留意' });
  }
  for (const event of events) {
    if (!event.remindAt) continue;
    const offset = Date.parse(event.remindAt) - +readEventDate(event.startAt, event.allDay);
    if (!Number.isFinite(offset)) continue;
    const occurrences = occurrencesInRange(event, new Date(first - offset), new Date(last - offset));
    for (const occurrence of occurrences) {
      const at = +occurrence.start + offset;
      include({ key: `event:${occurrence.key}:${at}`, at, title: `日程提醒 · ${event.title}`,
        body: `${format(occurrence.start, event.allDay ? 'M月d日 · 全天' : 'M月d日 HH:mm')}${event.location ? ` · ${event.location}` : ''}` });
    }
  }
  return result.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
}
export function dueReminders(queue: Reminder[], delivered: Record<string, number>, now: number): Reminder[] {
  return queue.filter((item) => item.at <= now && item.at >= now - REMINDER_LOOKBACK_MS && !(item.key in delivered));
}
