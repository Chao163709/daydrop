import { invoke, isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';
import type { Settings } from '../types';

export interface DesktopStatus { startupEnabled: boolean; permissionGranted: boolean; shortcutError: string; startupError: string; notificationError: string }
export const emptyDesktopStatus: DesktopStatus = { startupEnabled: false, permissionGranted: false, shortcutError: '', startupError: '', notificationError: '' };
export interface DesktopAdapter {
  available: boolean;
  initialize: (settings: Settings) => Promise<DesktopStatus>;
  apply: (next: Settings, previous: Settings, retryHotkey?: boolean) => Promise<void>;
}
export const desktopAdapter: DesktopAdapter = {
  available: isTauri(),
  async initialize(settings) {
    const status = { ...emptyDesktopStatus };
    try { status.startupEnabled = await isEnabled(); } catch (e) { status.startupError = `无法读取开机启动状态：${String(e)}`; }
    try { status.permissionGranted = await isPermissionGranted(); } catch (e) { status.notificationError = `无法读取通知权限：${String(e)}`; }
    try { await invoke('configure_hotkey', { hotkey: settings.hotkey }); } catch (e) { status.shortcutError = String(e); }
    return status;
  },
  async apply(next, previous, retryHotkey = false) {
    if (next.notificationsEnabled && !previous.notificationsEnabled && !await isPermissionGranted() && await requestPermission() !== 'granted') throw new Error('通知权限未获允许，请在系统设置中启用日点通知');
    if (next.hotkey !== previous.hotkey || retryHotkey) await invoke('configure_hotkey', { hotkey: next.hotkey });
    if (next.alwaysOnTop !== previous.alwaysOnTop) await getCurrentWindow().setAlwaysOnTop(next.alwaysOnTop);
    if (next.launchAtStartup !== previous.launchAtStartup) {
      if (next.launchAtStartup) await enable(); else await disable();
      if (await isEnabled() !== next.launchAtStartup) throw new Error('系统未应用开机启动设置，请重试');
    }
  },
};
export const hideToTray = () => invoke<void>('hide_to_tray');
export const quitApplication = () => invoke<void>('quit_application');
export async function testNotification() {
  if (!await isPermissionGranted() && await requestPermission() !== 'granted') throw new Error('请在系统设置中允许日点发送通知');
  await invoke('test_notification');
}
