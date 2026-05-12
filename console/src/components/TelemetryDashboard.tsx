import React from 'react';
import { Database, HardDrive } from 'lucide-react';

export interface StorageData {
  node: string;
  used: number;
  total: number;
}

interface TelemetryDashboardProps {
  data: StorageData[];
}

export const TelemetryDashboard: React.FC<TelemetryDashboardProps> = ({ data }) => {
  return (
    <div 
      data-testid="telemetry-dashboard"
      className="animate-fade-in"
      style={{
        padding: '20px',
        background: 'var(--bg-elevated)',
        borderRadius: '12px',
        border: '1px solid var(--border-light)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
        <Database size={18} color="var(--accent-cyan)" />
        <h3 style={{ margin: 0, fontSize: '1rem' }}>Storage Telemetry</h3>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1 }}>
        {data.map((item) => {
          const percentage = Math.round((item.used / item.total) * 100);
          const isWarning = percentage > 85;
          const color = isWarning ? 'var(--accent-crimson)' : 'var(--accent-emerald)';
          const glow = isWarning ? 'var(--accent-crimson-glow)' : 'var(--accent-emerald-glow)';

          return (
            <div 
              key={item.node} 
              data-testid={`storage-widget-${item.node}`}
              style={{ 
                padding: '16px', 
                background: 'var(--bg-surface)', 
                borderRadius: '8px', 
                border: '1px solid var(--border-light)',
                transition: 'transform 0.2s ease',
                cursor: 'default'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                  <HardDrive size={14} color="var(--text-secondary)" />
                  {item.node}
                </div>
                <div style={{ fontSize: '0.85rem', color: isWarning ? color : 'var(--text-secondary)', fontWeight: isWarning ? 600 : 400 }}>
                  {percentage}% Used
                </div>
              </div>

              <div style={{ width: '100%', height: '8px', background: 'var(--bg-base)', borderRadius: '4px', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    width: `${percentage}%`, 
                    height: '100%', 
                    background: color,
                    boxShadow: `0 0 10px ${glow}`,
                    transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)'
                  }} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '8px', color: 'var(--text-muted)' }}>
                <span>{item.used}GB</span>
                <span>{item.total}GB</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
