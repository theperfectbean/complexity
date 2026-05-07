import { ArrowLeft, ExternalLink, RefreshCw, Activity } from 'lucide-react';
import { SERVICES } from '../lib/api';

interface Props {
  name: string;
}

const NODE_COLORS: Record<string, string> = {
  nas:   '#38a169',
  media: '#3182ce',
  ai:    '#7c3aed',
};

export default function ServicePage({ name }: Props) {
  const service = SERVICES.find(s => s.name === name);

  if (!service) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-page)', color: 'var(--text)' }}>
        <div style={{ textAlign: 'center' }}>
          <p>Service not found: {name}</p>
          <a href="#/" style={{ color: 'var(--accent-light)', fontSize: '0.85rem' }}>← Back</a>
        </div>
      </div>
    );
  }

  const nodeColor = NODE_COLORS[service.node] ?? '#718096';
  const primaryUrl = service.url;

  return (
    <div style={{ minHeight: '100vh', padding: '2rem', background: 'var(--bg-page)', color: 'var(--text)' }}>
      <div style={{ maxWidth: '42rem', margin: '0 auto' }}>
        <a href="#/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--accent-light)', textDecoration: 'none', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
          <ArrowLeft size={14} /> Back to Fleet
        </a>

        <div style={{ borderRadius: '0.75rem', border: '1px solid var(--border)', background: 'var(--bg-surface)', padding: '1.5rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                <span style={{ display: 'inline-block', height: '0.6rem', width: '0.6rem', borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{service.name}</h1>
                <span style={{ borderRadius: '0.25rem', padding: '0.125rem 0.5rem', fontSize: '0.7rem', fontWeight: 600, color: '#fff', background: nodeColor }}>
                  {service.node}
                </span>
              </div>
              <p style={{ margin: 0, color: 'var(--text-muted)' }}>{service.purpose}</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
              <button style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', borderRadius: '0.5rem', padding: '0.375rem 0.75rem', fontSize: '0.8rem', fontWeight: 500, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg-input)', color: 'var(--text)' }}>
                <RefreshCw size={13} /> Restart
              </button>
              {primaryUrl && (
                <a href={primaryUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', borderRadius: '0.5rem', padding: '0.375rem 0.75rem', fontSize: '0.8rem', fontWeight: 500, textDecoration: 'none', background: 'var(--accent)', color: '#fff' }}>
                  <ExternalLink size={13} /> Open
                </a>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
            <StatCard label="IP Address" value={service.ip} />
            <StatCard label="Node" value={service.node} />
            <StatCard label="Tags" value={service.tags.join(', ')} />
          </div>

          {service.links && service.links.length > 0 && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              <p style={{ margin: '0 0 0.625rem', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Web UIs</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {service.links.map(link => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', borderRadius: '0.375rem', padding: '0.3rem 0.625rem', fontSize: '0.78rem', textDecoration: 'none', border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text)' }}
                  >
                    <ExternalLink size={11} style={{ color: 'var(--accent-light)', flexShrink: 0 }} />
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ borderRadius: '0.75rem', border: '1px solid var(--border)', background: 'var(--bg-surface)', padding: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Activity size={14} style={{ color: 'var(--accent)' }} />
            <h2 style={{ margin: 0, fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Quick Actions</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {['Check status', 'View logs', 'Restart service', 'Check disk usage'].map(action => (
              <a key={action} href={`#/?q=${encodeURIComponent(`${service.name}: ${action}`)}`}
                style={{ display: 'block', borderRadius: '0.5rem', padding: '0.5rem 0.75rem', fontSize: '0.8rem', textDecoration: 'none', background: 'var(--bg-input)', color: 'var(--text)' }}>
                {action}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderRadius: '0.5rem', padding: '0.75rem', background: 'var(--bg-page)' }}>
      <p style={{ margin: '0 0 0.25rem', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>{label}</p>
      <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--text)' }}>{value}</p>
    </div>
  );
}
