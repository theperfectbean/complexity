import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface ThreadItem {
  id: string;
  title: string;
  createdAt: string;
}

interface Props {
  threads: ThreadItem[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete?: (id: string) => void;
}

export function ThreadSidebar({ threads, activeId, onSelect, onNew, onDelete }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '240px',
      flexShrink: 0,
      borderRight: '1px solid var(--border)',
      background: 'var(--bg-surface-alt)',
    }}>
      {/* New conversation button — matches Complexity's "New chat" style */}
      <div style={{ padding: '0.75rem 0.75rem 0.5rem' }}>
        <button
          type="button"
          onClick={onNew}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            width: '100%',
            padding: '0.6rem 1rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: 'var(--text)',
            background: 'var(--bg-page)',
            border: '1px solid var(--border)',
            borderRadius: '0.75rem',
            cursor: 'pointer',
            transition: 'background 0.15s',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--foreground) 6%, transparent)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-page)'; }}
        >
          <Plus size={14} />
          New conversation
        </button>
      </div>

      {/* Section label */}
      <div style={{ padding: '0.5rem 1rem 0.25rem' }}>
        <span style={{
          fontSize: '0.65rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: 'var(--text-muted)',
        }}>
          Recent
        </span>
      </div>

      {/* Thread list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {threads.length === 0 && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0.75rem 1rem', margin: 0 }}>
            No recent threads
          </p>
        )}
        {threads.map(t => (
          <div
            key={t.id}
            onMouseEnter={() => setHoveredId(t.id)}
            onMouseLeave={() => setHoveredId(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0',
              borderRadius: '0.5rem',
              margin: '0.125rem 0.5rem',
              background: activeId === t.id
                ? 'var(--bg-selected)'
                : hoveredId === t.id
                  ? 'color-mix(in srgb, var(--foreground) 5%, transparent)'
                  : 'transparent',
              borderLeft: activeId === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              transition: 'background 0.1s',
              cursor: 'pointer',
            }}
          >
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              style={{
                flex: 1,
                padding: '0.5rem 0.625rem',
                textAlign: 'left',
                fontSize: '0.8rem',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: activeId === t.id ? 'var(--accent)' : 'var(--text-secondary)',
                fontFamily: 'inherit',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                minWidth: 0,
              }}
            >
              {t.title}
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onDelete(t.id); }}
                title="Delete thread"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0.375rem',
                  marginRight: '0.375rem',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '0.35rem',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  opacity: hoveredId === t.id ? 1 : 0,
                  transition: 'opacity 0.15s, color 0.1s',
                  flexShrink: 0,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--error)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
