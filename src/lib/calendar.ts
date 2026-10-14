import {
  addDays, addMonths, addWeeks, differenceInCalendarDays, differenceInCalendarMonths,
  eachDayOfInterval, endOfDay, endOfMonth, endOfWeek, format, isValid, parseISO, startOfDay, startOfMonth, startOfWeek,
} from 'date-fns';
import type { CalendarEvent, Task } from '../types';

export type CalendarView = 'month' | 'week' | 'day';
export type EventDraft = Omit<CalendarEvent, 'id'>;
export interface EventOccurrence { event: CalendarEvent; start: Date; end: Date; key: string }
export const eventColors = [
  { name: '工作', color: '#5279d8' }, { name: '生活', color: '#4d9689' },
  { name: '学习', color: '#c79047' }, { name: '重要', color: '#c66d7d' },
];
export const dayKey = (date: Date) => format(date, 'yyyy-MM-dd');
export function calendarDays(date: Date, view: CalendarView) {
  const first = view === 'month' ? startOfWeek(startOfMonth(date), { weekStartsOn: 1 })
    : view === 'week' ? startOfWeek(date, { weekStartsOn: 1 }) : startOfDay(date);
  const last = view === 'month' ? endOfWeek(endOfMonth(date), { weekStartsOn: 1 }) : addDays(first, view === 'week' ? 6 : 0);
  return eachDayOfInterval({ start: first, end: last });
}
export function readEventDate(value: string, allDay: boolean): Date {
  if (typeof value !== 'string') throw new Error('事件日期格式不正确');
  const date = allDay ? parseISO(value) : new Date(value);
  if (!isValid(date) || (allDay && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || dayKey(date) !== value))) throw new Error('事件日期格式不正确');
  return date;
}
export function validateEvent(draft: EventDraft) {
  if (typeof draft.title !== 'string' || !draft.title.trim()) throw new Error('请输入事件标题');
  if (draft.title.trim().length > 160) throw new Error('标题不能超过 160 个字符');
  if (typeof draft.allDay !== 'boolean') throw new Error('全天设置格式不正确');
  const start = readEventDate(draft.startAt, draft.allDay), end = readEventDate(draft.endAt, draft.allDay);
  if (end <= start) throw new Error('结束时间必须晚于开始时间');
  if (!/^#[0-9a-f]{6}$/i.test(draft.color)) throw new Error('请选择有效的事件颜色');
  if (typeof draft.note !== 'string' || typeof draft.location !== 'string') throw new Error('事件详情格式不正确');
  if (!['none', 'daily', 'weekly', 'monthly'].includes(draft.repeat)) throw new Error('重复规则不正确');
  if (draft.remindAt !== null && !isValid(new Date(draft.remindAt))) throw new Error('提醒时间格式不正确');
}
export function createEvent(draft: EventDraft): CalendarEvent {
  validateEvent(draft);
  return { ...draft, id: crypto.randomUUID(), title: draft.title.trim(), location: draft.location.trim() };
}
// All-day ranges use local date strings and an exclusive end date, never UTC midnight.
export function occurrencesInRange(event: CalendarEvent, rangeStart: Date, rangeEnd: Date): EventOccurrence[] {
  const baseStart = readEventDate(event.startAt, event.allDay), baseEnd = readEventDate(event.endAt, event.allDay);
  const overlaps = (start: Date, end: Date) => start < rangeEnd && end > rangeStart;
  const occurrence = (start: Date, end: Date) => ({ event, start, end, key: `${event.id}:${start.toISOString()}` });
  if (event.repeat === 'none') return overlaps(baseStart, baseEnd) ? [occurrence(baseStart, baseEnd)] : [];
  const advance = event.repeat === 'daily' ? addDays : event.repeat === 'weekly' ? addWeeks : addMonths;
  const earliest = addDays(rangeStart, -Math.max(1, differenceInCalendarDays(baseEnd, baseStart)) - 32);
  const distance = event.repeat === 'monthly' ? differenceInCalendarMonths(earliest, baseStart)
    : Math.floor(differenceInCalendarDays(earliest, baseStart) / (event.repeat === 'weekly' ? 7 : 1));
  let index = Math.max(0, distance - 1);
  const results: EventOccurrence[] = [];
  for (;;) {
    // Always advance from the original date: Jan 31 -> Feb 28 -> Mar 31.
    const start = advance(baseStart, index);
    let end = addDays(start, differenceInCalendarDays(baseEnd, baseStart));
    end.setHours(baseEnd.getHours(), baseEnd.getMinutes(), baseEnd.getSeconds(), baseEnd.getMilliseconds());
    if (end <= start) end = new Date(+start + (+baseEnd - +baseStart));
    if (start >= rangeEnd || !isValid(start)) break;
    if (overlaps(start, end)) results.push(occurrence(start, end));
    index++;
  }
  return results;
}
export function occurrencesOnDay(occurrences: EventOccurrence[], day: Date) {
  const start = startOfDay(day), end = addDays(start, 1);
  return occurrences.filter((item) => item.start < end && item.end > start)
    .sort((a, b) => Number(b.event.allDay) - Number(a.event.allDay) || +a.start - +b.start || a.event.title.localeCompare(b.event.title));
}
export function tasksOnDay(tasks: Task[], day: Date) {
  const key = dayKey(day);
  return tasks.filter((task) => !task.archived && task.dueAt && dayKey(new Date(task.dueAt)) === key)
    .sort((a, b) => Number(a.completed) - Number(b.completed) || a.order - b.order);
}
export function rescheduleTask(task: Task, day: Date, now = new Date()): Task {
  if (!isValid(day)) throw new Error('改期日期不正确');
  const previous = task.dueAt ? new Date(task.dueAt) : null;
  const due = previous ? new Date(day.getFullYear(), day.getMonth(), day.getDate(), previous.getHours(), previous.getMinutes(), previous.getSeconds(), previous.getMilliseconds()) : endOfDay(day);
  const remindAt = previous && task.remindAt ? new Date(+due - (+previous - Date.parse(task.remindAt))).toISOString() : task.remindAt;
  return { ...task, dueAt: due.toISOString(), remindAt, updatedAt: now.toISOString() };
}

export function rescheduleEvent(event: CalendarEvent, day: Date): CalendarEvent {
  if (!isValid(day)) throw new Error('改期日期不正确');
  if (event.repeat !== 'none') throw new Error('重复事件请在编辑窗口中修改整个系列');
  const previous = readEventDate(event.startAt, event.allDay);
  const previousEnd = readEventDate(event.endAt, event.allDay);
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), previous.getHours(), previous.getMinutes(), previous.getSeconds(), previous.getMilliseconds());
  const end = event.allDay ? addDays(start, differenceInCalendarDays(previousEnd, previous)) : new Date(+start + (+previousEnd - +previous));
  const moved = { ...event,
    startAt: event.allDay ? dayKey(start) : start.toISOString(),
    endAt: event.allDay ? dayKey(end) : end.toISOString(),
    remindAt: event.remindAt ? new Date(+start - (+previous - Date.parse(event.remindAt))).toISOString() : null,
  };
  validateEvent(moved);
  return moved;
}
