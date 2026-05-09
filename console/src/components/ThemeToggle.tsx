import { useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { cycleTheme, getTheme, themeLabel, type Theme } from '../lib/theme';

const ICONS: Record<Theme, React.ReactNode> = {
  light: <Sun  size={15} />,
  dark:  <Moon size={15} />,
};

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getTheme);

  const handleClick = () => {
    const next = cycleTheme();
    setTheme(next);
  };

  return (
    <button
      onClick={handleClick}
      title={`Theme: ${themeLabel(theme)} — click to toggle`}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.375rem',
        padding: '0.375rem 0.625rem', borderRadius: '0.5rem',
        border: '1px solid var(--border)', background: 'var(--bg-surface-alt)',
        color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.75rem',
      }}
    >
      {ICONS[theme]}
      <span>{themeLabel(theme)}</span>
    </button>
  );
}
