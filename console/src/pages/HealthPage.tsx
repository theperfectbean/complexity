import { ArrowLeft, Server, HardDrive, Cpu, Database } from 'lucide-react';
import type { ReactNode } from 'react';
import { FLEET_CONTAINERS, FLEET_NODES } from '../../../app/src/lib/topology';

const NODES = FLEET_NODES.map(node => ({
  name: node.name,
  ip: node.ip,
  tailscale: node.tailscaleIp,
  containers: FLEET_CONTAINERS.filter(container => container.node === node.name).length,
}));

const DISKS = [
  { node: 'nas',   device: 'nvme0n1p2', size: '238G', mount: '/',              pct: 2  },
  { node: 'nas',   device: 'sda1',      size: '954G', mount: '/data',          pct: 3  },
  { node: 'nas',   device: 'sdb1',      size: '1.8T', mount: '/mnt/disk3',     pct: 71 },
  { node: 'nas',   device: 'sdc1',      size: '1.8T', mount: '/mnt/usb-parity',pct: 12 },
  { node: 'media', device: 'nvme0n1p2', size: '238G', mount: '/',              pct: 65 },
  { node: 'media', device: 'sda1',      size: '220G', mount: '(unmounted)',     pct: 100},
  { node: 'ai',    device: 'nvme1n1p2', size: '476G', mount: '/',              pct: 2  },
  { node: 'ai',    device: 'nvme0n1p1', size: '954G', mount: '/data',          pct: 3  },
];

export default function HealthPage() {
  return (
    <div style={{ minHeight: '100vh', padding: '2rem', background: '#0f1117', color: '#e2e8f0' }}>
      <div style={{ maxWidth: '56rem', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
          <a href="#/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#a78bfa', textDecoration: 'none', fontSize: '0.85rem' }}>
            <ArrowLeft size={14} /> Back
          </a>
          <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Node Health</h1>
        </div>

        {/* Node cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
          {NODES.map(node => (
            <div key={node.name} style={{ borderRadius: '0.75rem', border: '1px solid #2d3748', background: '#1e2030', padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <Server size={14} style={{ color: '#7c3aed' }} />
                <span style={{ fontWeight: 600 }}>{node.name}</span>
                <span style={{ marginLeft: 'auto', display: 'inline-block', height: '0.5rem', width: '0.5rem', borderRadius: '50%', background: '#22c55e' }} />
              </div>
              <div style={{ fontSize: '0.75rem', color: '#a0aec0', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                <Row label="LAN" value={node.ip} />
                <Row label="Tailscale" value={node.tailscale} />
                <Row label="Containers" value={String(node.containers)} />
              </div>
            </div>
          ))}
        </div>

        {/* Disk usage */}
        <div style={{ borderRadius: '0.75rem', border: '1px solid #2d3748', background: '#1e2030', padding: '1.25rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <HardDrive size={14} style={{ color: '#7c3aed' }} />
            <h2 style={{ margin: 0, fontWeight: 600 }}>Disk Usage</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {DISKS.map((d, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 140px 1fr 48px', alignItems: 'center', gap: '1rem', fontSize: '0.8rem' }}>
                <span style={{ fontWeight: 600, color: '#a78bfa' }}>{d.node}</span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#a0aec0' }}>{d.mount}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: '#2d3748', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${d.pct}%`, borderRadius: '3px', background: d.pct >= 90 ? '#ef4444' : d.pct >= 70 ? '#f59e0b' : '#22c55e' }} />
                  </div>
                  <span style={{ fontSize: '0.7rem', width: '2.5rem', textAlign: 'right', color: d.pct >= 90 ? '#ef4444' : '#a0aec0' }}>{d.pct}%</span>
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', textAlign: 'right', color: '#718096' }}>{d.size}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CPU/Mem placeholders */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem' }}>
          {NODES.map(node => (
            <div key={node.name} style={{ borderRadius: '0.75rem', border: '1px solid #2d3748', background: '#1e2030', padding: '1rem' }}>
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#718096' }}>{node.name}</p>
              <MetricRow icon={<Cpu size={12} />} label="CPU" value="—" />
              <MetricRow icon={<Database size={12} />} label="Memory" value="—" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      <span style={{ fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}

function MetricRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: '#a0aec0', marginBottom: '0.375rem' }}>
      <span style={{ color: '#718096' }}>{icon}</span>
      <span>{label}</span>
      <span style={{ marginLeft: 'auto', fontFamily: 'monospace' }}>{value}</span>
    </div>
  );
}
