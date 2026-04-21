import { ExternalLink } from 'lucide-react';
import type { ServiceInfo } from '../lib/api';
import { SERVICES } from '../lib/api';

interface Props {
  selectedService: string | null;
  onSelectService: (name: string) => void;
}

const NODE_COLORS: Record<string, string> = {
  nas:   '#38a169',
  media: '#3182ce',
  ai:    '#7c3aed',
};

const NODES = ['nas', 'media', 'ai'];

export function ServiceList({ selectedService, onSelectService }: Props) {
  const grouped = NODES.map(node => ({
    node,
    services: SERVICES.filter(s => s.node === node),
    color: NODE_COLORS[node] ?? '#718096',
  }));

  return (
    <div style={{ padding: '1rem' }}>
      <h2 style={{ margin: '0 0 1rem', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-secondary)' }}>
        Services
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {grouped.map(({ node, services, color }) => (
          <div key={node}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ display: 'inline-block', height: '0.5rem', width: '0.5rem', borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color }}>{node}</span>
            </div>
            <div style={{ paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
              {services.map(svc => (
                <ServiceRow
                  key={svc.name}
                  service={svc}
                  nodeColor={color}
                  selected={selectedService === svc.name}
                  onClick={() => onSelectService(svc.name)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServiceRow({ service, nodeColor, selected, onClick }: {
  service: ServiceInfo;
  nodeColor: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
        borderRadius: '0.5rem',
        padding: '0.5rem 0.625rem',
        cursor: 'pointer',
        background: selected ? 'var(--bg-selected)' : 'transparent',
        borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background 0.1s',
      }}
    >
      <span style={{ display: 'inline-block', height: '0.5rem', width: '0.5rem', borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.825rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text)' }}>
          {service.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.125rem' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{service.ip}</span>
          <span style={{ borderRadius: '0.2rem', padding: '0.0625rem 0.3rem', fontSize: '0.6rem', fontWeight: 600, color: '#fff', background: nodeColor }}>
            {service.node}
          </span>
        </div>
      </div>
      {service.url ? (
        <a
          href={service.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title={`Open ${service.name}`}
          style={{ color: 'var(--accent-light)', display: 'flex', alignItems: 'center', flexShrink: 0, padding: '0.25rem', borderRadius: '0.25rem' }}
        >
          <ExternalLink size={13} />
        </a>
      ) : (
        <a
          href={`#/services/${service.name}`}
          onClick={e => e.stopPropagation()}
          style={{ color: 'var(--accent-light)', fontSize: '0.75rem', textDecoration: 'none', flexShrink: 0 }}
        >
          →
        </a>
      )}
    </div>
  );
}
