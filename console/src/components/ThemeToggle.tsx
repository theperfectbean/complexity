import { useState } from 'react';
import { Sun, Moon, Sunset } from 'lucide-react';
import { cycleTheme, getTheme, themeLabel, type Theme } from '../lib/theme';

const ICONS: Record<Theme, React.ReactNode> = {
  dark:  <Moon  size={15} />,
  dim:   <Sunset size={15} />,
  light: <Sun   size={15} />,
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
      title={`Theme: ${themeLabel(theme)} — click to cycle`}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.375rem',
        padding: '0.375rem 0.625rem', borderRadius: '0.5rem',
        border: '1px solid var(--border)', background: 'var(--bg-input)',
        color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem',
      }}
    >
      {ICONS[theme]}
      <span>{themeLabel(theme)}</span>
    </button>
  );
}
