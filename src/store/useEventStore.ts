import { create } from 'zustand';
import type { CalendarEvent } from '../types';
import { createEvent, validateEvent, rescheduleEvent, type EventDraft } from '../lib/calendar';
import { eventRepository, type EventRepository } from '../lib/eventRepository';

interface EventState {
  events: CalendarEvent[]; loaded: boolean; busy: boolean; error: string;
  load: () => Promise<void>; add: (draft: EventDraft) => Promise<boolean>;
  update: (id: string, draft: EventDraft) => Promise<boolean>; remove: (id: string) => Promise<boolean>;
  clearError: () => void;
  reschedule: (id: string, day: Date) => Promise<boolean>;
}
export function createEventStore(repository: EventRepository) {
  let loading: Promise<void> | undefined, queue: Promise<unknown> = Promise.resolve();
  return create<EventState>((set, get) => {
    const mutate = (action: () => Promise<void>) => {
      const result = queue.then(async () => {
        if (!get().loaded) throw new Error('事件尚未加载，请重试加载后再操作');
        set({ busy: true, error: '' });
        try { await action(); return true; } finally { set({ busy: false }); }
      }).catch((error: unknown) => { set({ error: error instanceof Error ? error.message : String(error) }); return false; });
      queue = result;
      return result;
    };
    const commit = async (event: CalendarEvent) => {
      await repository.save(event);
      set({ events: [...get().events.filter((row) => row.id !== event.id), event] });
    };
    return {
      events: [], loaded: false, busy: false, error: '', clearError: () => set({ error: '' }),
      load: () => get().loaded ? Promise.resolve() : loading ??= (async () => {
        set({ busy: true, error: '' });
        try { set({ events: await repository.load(), loaded: true }); }
        catch (error: unknown) { set({ error: error instanceof Error ? error.message : String(error) }); }
        finally { set({ busy: false }); loading = undefined; }
      })(),
      add: (draft) => mutate(async () => { await commit(createEvent(draft)); }),
      reschedule: (id, day) => mutate(async () => {
        const event = get().events.find((row) => row.id === id);
        if (!event) throw new Error('事件已不存在');
        await commit(rescheduleEvent(event, day));
      }),
      update: (id, draft) => mutate(async () => {
        validateEvent(draft);
        if (!get().events.some((event) => event.id === id)) throw new Error('事件已不存在');
        await commit({ ...draft, id, title: draft.title.trim(), location: draft.location.trim() });
      }),
      remove: (id) => mutate(async () => {
        await repository.remove(id);
        set({ events: get().events.filter((event) => event.id !== id) });
      }),
    };
  });
}
export const useEventStore = createEventStore(eventRepository);
