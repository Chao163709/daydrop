import { create } from 'zustand';
import { defaultSettings, type Settings } from '../types';
import { validateSettings } from '../lib/settings';
import { settingsRepository, type SettingsRepository } from '../lib/settingsRepository';
import { desktopAdapter, emptyDesktopStatus, type DesktopAdapter, type DesktopStatus } from '../lib/desktop';
import { useWidgetStore } from './useWidgetStore';

interface SettingsState {
  settings: Settings; loaded: boolean; busy: boolean; error: string; desktop: DesktopStatus;
  load: () => Promise<void>; update: (patch: Partial<Settings>) => Promise<boolean>; clearError: () => void;
}
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
export function createSettingsStore(repository: SettingsRepository, adapter: DesktopAdapter, onApply: (settings: Settings) => void = () => {}) {
  let loading: Promise<void> | undefined, queue: Promise<unknown> = Promise.resolve();
  return create<SettingsState>((set, get) => ({
    settings: { ...defaultSettings }, loaded: false, busy: false, error: '', desktop: { ...emptyDesktopStatus },
    clearError: () => set({ error: '' }),
    load: () => get().loaded ? Promise.resolve() : loading ??= (async () => {
      set({ busy: true, error: '' });
      try {
        let settings = await repository.load();
        const desktop = adapter.available ? await adapter.initialize(settings) : { ...emptyDesktopStatus };
        // Respect changes made in OS login settings rather than silently re-enabling startup.
        if (adapter.available && !desktop.startupError && settings.launchAtStartup !== desktop.startupEnabled) {
          settings = { ...settings, launchAtStartup: desktop.startupEnabled }; await repository.save(settings);
        }
        onApply(settings); set({ settings, desktop, loaded: true });
      } catch (e) { set({ error: message(e) }); }
      finally { set({ busy: false }); loading = undefined; }
    })(),
    update: (patch) => {
      const result = queue.then(async () => {
        if (!get().loaded) throw new Error('设置尚未加载，请重试');
        set({ busy: true, error: '' });
        const previous = get().settings;
        let next: Settings | undefined;
        try {
          next = validateSettings({ ...previous, ...patch });
          if (!adapter.available && ['launchAtStartup', 'hotkey', 'notificationsEnabled'].some((key) => key in patch)) throw new Error('此设置需要在桌面版中使用');
          if (adapter.available) await adapter.apply(next, previous, 'hotkey' in patch && !!get().desktop.shortcutError);
          await repository.save(next);
          onApply(next);
          set({ settings: next, desktop: { ...get().desktop,
            ...('hotkey' in patch ? { shortcutError: '' } : {}),
            ...('launchAtStartup' in patch ? { startupError: '', startupEnabled: next.launchAtStartup } : {}),
            ...('notificationsEnabled' in patch ? { notificationError: '', permissionGranted: next.notificationsEnabled || get().desktop.permissionGranted } : {}),
          } });
          return true;
        } catch (e) {
          // Roll back native effects as well when persistence fails or a partial apply fails.
          if (adapter.available && next) {
            try { await adapter.apply(previous, next); }
            catch (rollback) { throw new Error(`${message(e)}；系统设置恢复失败：${message(rollback)}。请重新打开应用检查设置。`); }
          }
          throw e;
        } finally { set({ busy: false }); }
      }).catch((e) => { set({ error: message(e) }); return false; });
      queue = result; return result;
    },
  }));
}
export const useSettingsStore = createSettingsStore(settingsRepository, desktopAdapter, (settings) => {
  useWidgetStore.setState((state) => ({ mode: settings.expandMode, alwaysOnTop: settings.alwaysOnTop,
    hoverDelay: settings.hoverDelay, collapseDelay: settings.collapseDelay, theme: settings.theme, opacity: settings.opacity,
    expanded: settings.expandMode === 'pinned' || state.expanded,
  }));
});
