import { useEffect, useRef } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSettingsStore } from '../store/useSettingsStore';
import { useAppStore } from '../store/useAppStore';
import { useWidgetStore } from '../store/useWidgetStore';
import { useTaskStore } from '../store/useTaskStore';
import { useEventStore } from '../store/useEventStore';
import { buildReminderQueue } from '../lib/reminders';

export function useDesktopIntegration(interactionLocked: boolean) {
  const locked = useRef(interactionLocked);
  locked.current = interactionLocked;
  useEffect(() => {
    void useSettingsStore.getState().load();
    void useEventStore.getState().load();
    if (!isTauri()) return;
    let active = true;
    const unlisteners: (() => void)[] = [];
    const register = (remove: () => void) => { if (active) unlisteners.push(remove); else remove(); };
    let queued: Promise<unknown> = Promise.resolve();
    const report = (e: unknown) => { if (active) useSettingsStore.setState({ error: String(e) }); };
    const sync = () => {
      queued = queued.then(async () => {
        if (!active) return;
        const prefs = useSettingsStore.getState(), tasks = useTaskStore.getState(), events = useEventStore.getState();
        if (!prefs.loaded) return;
        if (!tasks.loaded || !events.loaded) {
          const issue = !tasks.loaded ? tasks.error : events.error;
          if (issue && prefs.settings.notificationsEnabled) throw new Error(`提醒暂未启动，任务或日程读取失败：${issue}`);
          return;
        }
        await invoke('sync_reminders', { enabled: prefs.settings.notificationsEnabled && prefs.desktop.permissionGranted,
          reminders: buildReminderQueue(tasks.tasks, events.events) });
      }).catch(report);
    };
    listen<{ tab?: string }>('daydrop-open', ({ payload }) => {
      if (payload.tab === 'today' && !locked.current) useAppStore.getState().setTab('today');
      useWidgetStore.getState().expand();
    }).then(register).catch(report);
    listen('daydrop-refresh-reminders', sync).then(register).catch(report);
    listen<string>('daydrop-reminder-error', ({ payload }) => report(payload)).then(register).catch(report);
    unlisteners.push(
      useSettingsStore.subscribe((state, previous) => { if (state.loaded !== previous.loaded || state.settings !== previous.settings || state.desktop.permissionGranted !== previous.desktop.permissionGranted) sync(); }),
      useTaskStore.subscribe((state, previous) => { if (state.loaded !== previous.loaded || state.tasks !== previous.tasks || (!state.loaded && state.error !== previous.error)) sync(); }),
      useEventStore.subscribe((state, previous) => { if (state.loaded !== previous.loaded || state.events !== previous.events || (!state.loaded && state.error !== previous.error)) sync(); }),
    );
    sync();
    const timer = setInterval(sync, 60_000);
    const refresh = () => sync();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(timer); unlisteners.forEach((remove) => remove()); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh); };
  }, []);
}
