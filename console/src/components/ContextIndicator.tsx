import { useMachine } from '@xstate/react';
import { appMachine } from '../machines/appMachine';
import { Server, Activity } from 'lucide-react';

export const ContextIndicator = () => {
  const [state] = useMachine(appMachine);
  const topology = state.context.topology;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '8px 16px',
      background: 'var(--bg-elevated)',
      borderRadius: '20px',
      border: '1px solid var(--border-light)',
      fontSize: '0.85rem',
      fontWeight: 500,
      color: 'var(--text-secondary)'
    }}>
      {topology ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server size={14} color="var(--accent-cyan)" />
            <span style={{ color: 'var(--text-primary)' }}>{topology.nodes.length} Nodes</span>
          </div>
          <div style={{ width: '1px', height: '12px', background: 'var(--border-focus)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={14} color="var(--accent-emerald)" />
            <span>Context Active</span>
          </div>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--accent-emerald)',
            boxShadow: '0 0 8px var(--accent-emerald-glow)'
          }} />
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: 'var(--accent-cyan)',
            animation: 'pulseGlow 2s infinite'
          }} />
          <span>Synchronizing Fleet Topology...</span>
        </div>
      )}
    </div>
  );
};
