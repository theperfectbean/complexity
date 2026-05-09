export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'fleet_console_theme';
const THEMES: Theme[] = ['light', 'dark'];
const LABELS: Record<Theme, string> = { light: 'Light', dark: 'Dark' };

export function getTheme(): Theme {
  try { return (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'light'; } catch { return 'light'; }
}

export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t === 'dark' ? 'dark' : '';
  try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
}

export function cycleTheme(): Theme {
  const cur = getTheme();
  const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length] ?? 'light';
  applyTheme(next);
  return next;
}

export function themeLabel(t: Theme): string { return LABELS[t]; }
export { THEMES };
