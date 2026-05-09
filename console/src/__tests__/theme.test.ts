import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTheme, applyTheme, cycleTheme, themeLabel, THEMES, type Theme } from '@/lib/theme';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getTheme()', () => {
  it('returns "light" when nothing is stored', () => {
    expect(getTheme()).toBe('light');
  });

  it('returns stored dark theme', () => {
    localStorage.setItem('fleet_console_theme', 'dark');
    expect(getTheme()).toBe('dark');
  });

  it('returns stored light theme', () => {
    localStorage.setItem('fleet_console_theme', 'light');
    expect(getTheme()).toBe('light');
  });

  it('returns "light" when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('quota'); });
    expect(getTheme()).toBe('light');
  });
});

describe('applyTheme()', () => {
  it('sets data-theme="dark" for dark mode', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('clears data-theme for light mode', () => {
    document.documentElement.dataset.theme = 'dark';
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('');
  });

  it('persists theme to localStorage', () => {
    applyTheme('dark');
    expect(localStorage.getItem('fleet_console_theme')).toBe('dark');
  });

  it('does not throw when localStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => applyTheme('light')).not.toThrow();
  });
});

describe('cycleTheme()', () => {
  it('cycles light → dark → light', () => {
    applyTheme('light');
    expect(cycleTheme()).toBe('dark');
    expect(cycleTheme()).toBe('light');
  });
});

describe('themeLabel()', () => {
  it('returns human-readable labels', () => {
    expect(themeLabel('dark')).toBe('Dark');
    expect(themeLabel('light')).toBe('Light');
  });
});

describe('THEMES constant', () => {
  it('contains light and dark', () => {
    const t: Theme[] = ['light', 'dark'];
    expect(THEMES).toEqual(t);
  });
});
