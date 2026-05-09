import { useEffect, useRef, useState } from 'react';
import type { SlashCommand } from '../lib/commands';

interface Props {
  commands: SlashCommand[];
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
}

export function CommandMenu({ commands, onSelect, onClose }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const onCloseRef = useRef(onClose);
  const onSelectRef = useRef(onSelect);
  useEffect(() => { onCloseRef.current = onClose; onSelectRef.current = onSelect; });

  useEffect(() => { setActiveIndex(0); }, [commands.length]);

  useEffect(() => {
    if (commands.length === 0) { onCloseRef.current(); return; }
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => (i + 1) % commands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i => (i - 1 + commands.length) % commands.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const cmd = commands[activeIndex];
        if (cmd) onSelectRef.current(cmd);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [commands, activeIndex]);

  if (commands.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: '0.75rem',
        boxShadow: 'var(--shadow)',
        overflow: 'hidden',
        padding: '0.3rem',
      }}
    >
      {commands.map((cmd, i) => (
        <div
          key={cmd.id}
          onClick={() => onSelect(cmd)}
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '0.75rem',
            padding: '0.5rem 0.75rem',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            background: i === activeIndex ? 'var(--accent)' : 'transparent',
            color: i === activeIndex ? 'var(--primary-foreground)' : 'var(--text)',
            transition: 'background 0.1s',
          }}
          onMouseEnter={() => setActiveIndex(i)}
        >
          <span style={{ fontWeight: 600, fontSize: '0.875rem', fontFamily: 'monospace', minWidth: '6rem' }}>
            /{cmd.trigger}
          </span>
          <span style={{
            fontSize: '0.775rem',
            opacity: i === activeIndex ? 0.85 : 0.6,
          }}>
            {cmd.description}
          </span>
        </div>
      ))}
    </div>
  );
}
