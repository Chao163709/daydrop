import { useEffect } from 'react';
import { useWidgetStore } from '../store/useWidgetStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { defaultSettings } from '../types';
export function useAppearance() {
  const { theme, opacity } = useWidgetStore();
  const accent = useSettingsStore((state) => state.settings.accentColor);
  useEffect(() => {
    const style = document.documentElement.style;
    if (accent.toLowerCase() === defaultSettings.accentColor) {
      ['--accent', '--accent-rgb', '--button-fill'].forEach((key) => style.removeProperty(key)); return;
    }
    style.setProperty('--accent', accent); style.setProperty('--button-fill', accent);
    style.setProperty('--accent-rgb', [1, 3, 5].map((offset) => parseInt(accent.slice(offset, offset + 2), 16)).join(' '));
  }, [accent]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? media.matches ? 'dark' : 'light' : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    apply(); media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => { document.documentElement.style.setProperty('--glass-opacity', String(opacity)); }, [opacity]);
}
