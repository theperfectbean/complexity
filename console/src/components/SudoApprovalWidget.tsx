import React from 'react';

interface SudoApprovalWidgetProps {
  message: string;
  tool?: string;
  params?: any;
  onApprove: () => void;
  onCancel: () => void;
}

export const SudoApprovalWidget: React.FC<SudoApprovalWidgetProps> = ({ message, tool, params, onApprove, onCancel }) => {
  return (
    <div 
      data-testid="sudo-approval-widget"
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '500px',
        padding: '20px',
        background: '#fff',
        border: '2px solid #ff4444',
        borderRadius: '8px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        zIndex: 1000,
        textAlign: 'center'
      }}
    >
      <h2 style={{ color: '#ff4444', margin: '0 0 10px 0' }}>Sudo Approval Required</h2>
      <div style={{ padding: '15px', background: '#fff5f5', borderRadius: '4px', marginBottom: '15px', textAlign: 'left', fontSize: '0.95em' }}>
        {message}
      </div>
      
      {tool && (
        <div style={{ textAlign: 'left', fontSize: '0.85em', color: '#666' }}>
          <strong>Tool:</strong> {tool}<br/>
          <strong>Params:</strong> <code style={{ background: '#eee', padding: '2px 4px' }}>{JSON.stringify(params)}</code>
        </div>
      )}
      
      <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', gap: '10px' }}>
        <button 
          onClick={onApprove}
          style={{ padding: '8px 20px', background: '#ff4444', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          CONFIRM
        </button>
        <button 
          onClick={onCancel}
          style={{ padding: '8px 20px', background: '#ccc', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
        >
          CANCEL
        </button>
      </div>
    </div>
  );
};
