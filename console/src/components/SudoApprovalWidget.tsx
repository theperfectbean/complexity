import React from 'react';
import { AlertTriangle, ShieldCheck, X } from 'lucide-react';

interface SudoApprovalWidgetProps {
  message: string;
  tool?: string;
  params?: any;
  onApprove: () => void;
  onCancel: () => void;
}

export const SudoApprovalWidget: React.FC<SudoApprovalWidgetProps> = ({ message, tool, params, onApprove, onCancel }) => {
  return (
    <>
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        zIndex: 999,
        animation: 'fadeIn 0.2s ease-out'
      }} />
      <div 
        data-testid="sudo-approval-widget"
        className="glass-panel animate-slide-up"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '450px',
          padding: '24px',
          border: '1px solid var(--accent-crimson)',
          boxShadow: '0 0 40px rgba(239, 68, 68, 0.15)',
          zIndex: 1000,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '50%' }}>
            <AlertTriangle size={24} color="var(--accent-crimson)" />
          </div>
          <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: '1.25rem' }}>Sudo Approval Required</h2>
        </div>
        
        <div style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.05)', borderRadius: '8px', marginBottom: '20px', color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: 1.6, borderLeft: '3px solid var(--accent-crimson)' }}>
          {message}
        </div>
        
        {tool && (
          <div style={{ 
            background: 'var(--bg-base)', 
            padding: '12px', 
            borderRadius: '8px', 
            marginBottom: '24px',
            border: '1px solid var(--border-light)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <ShieldCheck size={14} />
              <span>Target Execution</span>
            </div>
            <div style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', marginBottom: '4px' }}>
              {tool}
            </div>
            {params && (
              <pre style={{ margin: 0, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(params, null, 2)}
              </pre>
            )}
          </div>
        )}
        
        <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
          <button 
            onClick={onCancel}
            style={{ 
              flex: 1, 
              padding: '12px', 
              background: 'transparent', 
              color: 'var(--text-primary)', 
              border: '1px solid var(--border-focus)', 
              borderRadius: '8px', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontWeight: 500,
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--border-light)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <X size={16} /> Cancel
          </button>
          <button 
            onClick={onApprove}
            style={{ 
              flex: 1, 
              padding: '12px', 
              background: 'var(--accent-crimson)', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '8px', 
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontWeight: 600,
              boxShadow: '0 4px 12px var(--accent-crimson-glow)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
          >
            <ShieldCheck size={16} /> Confirm Action
          </button>
        </div>
      </div>
    </>
  );
};
