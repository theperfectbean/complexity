import React from 'react';

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
      style={{
        padding: '20px',
        background: '#f5f5f5',
        borderRadius: '8px',
        border: '1px solid #ccc',
        marginTop: '20px'
      }}
    >
      <h3 style={{ marginTop: 0 }}>Storage Telemetry</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
        {data.map((item) => {
          const percentage = Math.round((item.used / item.total) * 100);
          return (
            <div 
              key={item.node} 
              data-testid={`storage-widget-${item.node}`}
              style={{ padding: '10px', background: '#fff', borderRadius: '4px', border: '1px solid #ddd' }}
            >
              <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>{item.node}</div>
              <div style={{ width: '100%', height: '20px', background: '#eee', borderRadius: '10px', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    width: `${percentage}%`, 
                    height: '100%', 
                    background: percentage > 90 ? '#ff4444' : '#44bb44',
                    transition: 'width 0.5s ease'
                  }} 
                />
              </div>
              <div style={{ fontSize: '0.8em', marginTop: '5px', textAlign: 'right' }}>
                {percentage}% ({item.used}G / {item.total}G)
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
