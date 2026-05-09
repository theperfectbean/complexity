import { ExternalLink } from 'lucide-react';
import type { ServiceInfo } from '../lib/api';
import { SERVICES } from '../lib/api';

interface Props {
  selectedService: string | null;
  onSelectService: (name: string) => void;
}

export function ServiceList({ selectedService, onSelectService }: Props) {
  const nodes = Array.from(new Set(SERVICES.map(svc => svc.node)));
  const grouped = nodes.map(node => ({
    node,
    services: SERVICES.filter(s => s.node === node),
  }));

  return (
    <div style={{ padding: '0.75rem 0.5rem 1rem' }}>
      <h2 style={{
        margin: '0 0.5rem 0.75rem',
        fontSize: '0.65rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--text-muted)',
      }}>
        Services
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {grouped.map(({ node, services }) => (
          <div key={node}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0 0.5rem',
              marginBottom: '0.25rem',
            }}>
              <span style={{
                display: 'inline-block',
                height: '0.375rem',
                width: '0.375rem',
                borderRadius: '50%',
                background: 'var(--text-muted)',
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: '0.675rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
              }}>
                {node}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
              {services.map(svc => (
                <ServiceRow
                  key={svc.name}
                  service={svc}
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

function ServiceRow({ service, selected, onClick }: {
  service: ServiceInfo;
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
        padding: '0.45rem 0.75rem',
        cursor: 'pointer',
        background: selected ? 'var(--bg-selected)' : 'transparent',
        borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--foreground) 5%, transparent)';
      }}
      onMouseLeave={e => {
        if (!selected) (e.currentTarget as HTMLElement).style.background = 'transparent';
      }}
    >
      <span style={{
        display: 'inline-block',
        height: '0.5rem',
        width: '0.5rem',
        borderRadius: '50%',
        background: 'var(--success)',
        flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.825rem',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          color: 'var(--text)',
        }}>
          {service.name}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: '0.1rem' }}>
          {service.ip}
        </div>
      </div>
      {service.url ? (
        <a
          href={service.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          title={`Open ${service.name}`}
          style={{
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
            padding: '0.25rem',
            borderRadius: '0.25rem',
            opacity: 0.6,
          }}
        >
          <ExternalLink size={12} />
        </a>
      ) : (
        <span style={{
          color: 'var(--text-muted)',
          fontSize: '0.75rem',
          flexShrink: 0,
          opacity: 0.5,
        }}>
          →
        </span>
      )}
    </div>
  );
}
