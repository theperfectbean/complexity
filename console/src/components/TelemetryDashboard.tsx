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
        padding: '16px',
        background: 'var(--bg-surface)',
        borderRadius: '8px',
        border: '1px solid var(--border-light)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px' }}>
        <Database size={14} color="var(--accent-primary)" />
        <h3 style={{ margin: 0, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
          Telemetry
        </h3>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', flex: 1 }}>
        {data.map((item) => {
          const percentage = Math.round((item.used / item.total) * 100);
          const isWarning = percentage > 85;
          const color = isWarning ? 'var(--accent-crimson)' : 'var(--accent-primary)';

          return (
            <div 
              key={item.node} 
              data-testid={`storage-widget-${item.node}`}
              style={{ 
                padding: '12px', 
                background: 'var(--bg-base)', 
                borderRadius: '6px', 
                border: '1px solid var(--border-light)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500, fontSize: '0.85rem' }}>
                  <HardDrive size={12} color="var(--text-muted)" />
                  {item.node}
                </div>
                <div style={{ fontSize: '0.75rem', color: isWarning ? 'var(--accent-crimson)' : 'var(--text-secondary)' }}>
                  {percentage}%
                </div>
              </div>

              <div style={{ width: '100%', height: '4px', background: 'var(--bg-elevated)', borderRadius: '2px', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    width: `${percentage}%`, 
                    height: '100%', 
                    background: color,
                    transition: 'width 1s ease-out'
                  }} 
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginTop: '6px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                <span>{item.used}G</span>
                <span>{item.total}G</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
