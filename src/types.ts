export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly';
export interface Task {
  id: string; title: string; note: string; dueAt: string | null; remindAt: string | null;
  priority: 'low' | 'medium' | 'high'; tags: string[];
  subtasks: { id: string; title: string; completed: boolean }[];
  repeat: RepeatRule; completed: boolean; archived: boolean;
  completedAt: string | null; repeatSourceId: string | null;
  createdAt: string; updatedAt: string; order: number;
}
export interface CalendarEvent {
  id: string; title: string; startAt: string; endAt: string; allDay: boolean;
  color: string; location: string; note: string; repeat: RepeatRule; remindAt: string | null;
}
export interface Settings {
  launchAtStartup: boolean; alwaysOnTop: boolean;
  expandMode: 'hover' | 'click' | 'pinned'; hoverDelay: number; collapseDelay: number;
  theme: 'light' | 'dark' | 'system'; accentColor: string; hotkey: string;
  opacity: number; width: number;
  notificationsEnabled: boolean;
}
export const defaultSettings: Settings = {
  launchAtStartup: false, alwaysOnTop: true, expandMode: 'hover', hoverDelay: 300,
  collapseDelay: 1000, theme: 'system', accentColor: '#5279d8', hotkey: 'Alt+Space', opacity: 0.82, width: 420, notificationsEnabled: true,
};
