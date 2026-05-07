import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getTheme, applyTheme, cycleTheme, themeLabel, THEMES, type Theme } from '@/lib/theme';

// jsdom provides localStorage — reset between tests
beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getTheme()', () => {
  it('returns "dark" when nothing is stored', () => {
    expect(getTheme()).toBe('dark');
  });

  it('returns stored theme', () => {
    localStorage.setItem('fleet_console_theme', 'light');
    expect(getTheme()).toBe('light');
  });

  it('returns stored "dim" theme', () => {
    localStorage.setItem('fleet_console_theme', 'dim');
    expect(getTheme()).toBe('dim');
  });

  it('returns "dark" when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('quota'); });
    expect(getTheme()).toBe('dark');
  });
});

describe('applyTheme()', () => {
  it('sets data-theme attribute on documentElement', () => {
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('persists theme to localStorage', () => {
    applyTheme('dim');
    expect(localStorage.getItem('fleet_console_theme')).toBe('dim');
  });

  it('does not throw when localStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect(() => applyTheme('light')).not.toThrow();
  });
});

describe('cycleTheme()', () => {
  it('cycles dark → dim → light → dark', () => {
    applyTheme('dark');
    expect(cycleTheme()).toBe('dim');
    expect(cycleTheme()).toBe('light');
    expect(cycleTheme()).toBe('dark');
  });
});

describe('themeLabel()', () => {
  it('returns human-readable labels', () => {
    expect(themeLabel('dark')).toBe('Dark');
    expect(themeLabel('dim')).toBe('Dim');
    expect(themeLabel('light')).toBe('Light');
  });
});

describe('THEMES constant', () => {
  it('contains all three themes', () => {
    const t: Theme[] = ['dark', 'dim', 'light'];
    expect(THEMES).toEqual(t);
  });
});
