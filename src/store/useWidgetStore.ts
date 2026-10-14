import { create } from 'zustand';
import { isTauri } from '@tauri-apps/api/core';
export type ExpandMode = 'hover' | 'click' | 'pinned';
interface WidgetState {
  expanded: boolean; mode: ExpandMode; alwaysOnTop: boolean; hoverDelay: number; collapseDelay: number;
  theme: 'light' | 'dark' | 'system'; opacity: number;
  expand: () => void; collapse: (force?: boolean) => void;
}
// This store holds window state only. Persistent preferences belong to SettingsStore.
export const useWidgetStore = create<WidgetState>()((set) => ({
  expanded: !isTauri(), mode: 'hover', alwaysOnTop: true, hoverDelay: 300, collapseDelay: 1000,
  theme: 'system', opacity: 0.82,
  expand: () => set({ expanded: true }),
  collapse: (force = false) => set((state) => state.mode !== 'pinned' || force ? { expanded: false } : {}),
}));
