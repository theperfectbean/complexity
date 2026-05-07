interface Host {
  name?: string;
  ip?: string;
  status?: string;
  node?: string;
  [key: string]: unknown;
}

interface Props {
  data: unknown;
}

function parseHosts(data: unknown): Host[] {
  if (Array.isArray(data)) return data as Host[];
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (Array.isArray(d.hosts)) return d.hosts as Host[];
    if (Array.isArray(d.nodes)) return d.nodes as Host[];
    if (Array.isArray(d.items)) return d.items as Host[];
  }
  return [];
}

export function HostList({ data }: Props) {
  const hosts = parseHosts(data);
  if (hosts.length === 0) {
    return <p style={{ margin: 0, fontSize: '0.75rem', color: '#718096' }}>No hosts found</p>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
      {hosts.map((h, i) => (
        <div key={i} style={{ borderRadius: '0.5rem', padding: '0.625rem', background: '#0d1117' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
            <span style={{ display: 'inline-block', height: '0.5rem', width: '0.5rem', borderRadius: '50%', flexShrink: 0, background: h.status === 'stopped' ? '#ef4444' : '#22c55e' }} />
            <span style={{ fontSize: '0.825rem', fontWeight: 500 }}>{h.name ?? '—'}</span>
          </div>
          {h.ip && <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.7rem', color: '#718096' }}>{h.ip}</p>}
          {h.node && <p style={{ margin: '0.125rem 0 0', fontSize: '0.65rem', color: '#a78bfa' }}>{h.node}</p>}
        </div>
      ))}
    </div>
  );
}
