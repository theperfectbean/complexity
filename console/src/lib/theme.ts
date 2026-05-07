export type Theme = 'dark' | 'dim' | 'light';

const STORAGE_KEY = 'fleet_console_theme';

const THEMES: Theme[] = ['dark', 'dim', 'light'];
const LABELS: Record<Theme, string> = { dark: 'Dark', dim: 'Dim', light: 'Light' };

export function getTheme(): Theme {
  try { return (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'dark'; } catch { return 'dark'; }
}

export function applyTheme(t: Theme): void {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(STORAGE_KEY, t); } catch { /* ignore */ }
}

export function cycleTheme(): Theme {
  const cur = getTheme();
  const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length] ?? 'dark';
  applyTheme(next);
  return next;
}

export function themeLabel(t: Theme): string { return LABELS[t]; }

export { THEMES };
