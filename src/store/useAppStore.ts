import { create } from 'zustand';
export type Tab = 'today' | 'all' | 'calendar' | 'settings';
export const useAppStore = create<{ tab: Tab; setTab: (tab: Tab) => void }>((set) => ({ tab: 'today', setTab: (tab) => set({ tab }) }));
