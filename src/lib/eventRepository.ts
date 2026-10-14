import { isTauri } from '@tauri-apps/api/core';
import type { CalendarEvent } from '../types';
import { getDatabase, initializeDatabase } from './database';
import { validateEvent } from './calendar';

export interface EventRepository {
  load: () => Promise<CalendarEvent[]>;
  save: (event: CalendarEvent) => Promise<void>;
  remove: (id: string) => Promise<void>;
}
export interface EventRow {
  id: string; title: string; start_at: string; end_at: string; all_day: number;
  color: string; location: string; note: string; repeat: CalendarEvent['repeat']; remind_at: string | null;
}
export const eventFromRow = (row: EventRow): CalendarEvent => ({
  id: row.id, title: row.title, startAt: row.start_at, endAt: row.end_at, allDay: !!row.all_day,
  color: row.color, location: row.location, note: row.note, repeat: row.repeat, remindAt: row.remind_at,
});
export function eventStatement(event: CalendarEvent) {
  return {
    sql: `INSERT INTO events (id,title,start_at,end_at,all_day,color,location,note,repeat,remind_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,start_at=excluded.start_at,end_at=excluded.end_at,
      all_day=excluded.all_day,color=excluded.color,location=excluded.location,note=excluded.note,
      repeat=excluded.repeat,remind_at=excluded.remind_at`,
    values: [event.id, event.title, event.startAt, event.endAt, Number(event.allDay), event.color, event.location, event.note, event.repeat, event.remindAt],
  };
}
const storageKey = 'daydrop-events-v1';
function readBrowser(): CalendarEvent[] {
  const text = localStorage.getItem(storageKey);
  if (!text) return [];
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('事件数据格式异常，原数据已保留');
  for (const event of parsed) {
    if (!event || typeof event.id !== 'string') throw new Error('事件数据格式异常，原数据已保留');
    validateEvent(event);
  }
  return parsed as CalendarEvent[];
}
export const eventRepository: EventRepository = {
  async load() {
    await initializeDatabase();
    if (!isTauri()) return readBrowser();
    return (await (await getDatabase()).select<EventRow[]>('SELECT * FROM events ORDER BY start_at')).map(eventFromRow);
  },
  async save(event) {
    validateEvent(event);
    if (!isTauri()) {
      localStorage.setItem(storageKey, JSON.stringify([...readBrowser().filter((row) => row.id !== event.id), event]));
      return;
    }
    const statement = eventStatement(event);
    await (await getDatabase()).execute(statement.sql, statement.values);
  },
  async remove(id) {
    if (!isTauri()) { localStorage.setItem(storageKey, JSON.stringify(readBrowser().filter((row) => row.id !== id))); return; }
    await (await getDatabase()).execute('DELETE FROM events WHERE id=$1', [id]);
  },
};
