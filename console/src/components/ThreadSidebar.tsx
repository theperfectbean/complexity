import { Plus, MessageSquare } from 'lucide-react';

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
}

export function ThreadSidebar({ threads, activeId, onSelect, onNew }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '180px', flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg-surface-alt)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0.75rem', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-secondary)' }}>Threads</span>
        <button
          onClick={onNew}
          title="New thread"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-light)', padding: '0.2rem', borderRadius: '0.25rem' }}
        >
          <Plus size={14} />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.25rem 0' }}>
        {threads.map(t => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{
              display: 'flex',
              width: '100%',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 0.75rem',
              textAlign: 'left',
              fontSize: '0.75rem',
              background: activeId === t.id ? 'var(--bg-selected)' : 'transparent',
              border: 'none',
              borderLeft: activeId === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer',
              color: activeId === t.id ? 'var(--accent-light)' : 'var(--text-muted)',
            }}
          >
            <MessageSquare size={12} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
