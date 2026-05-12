import { useMachine } from '@xstate/react';
import { appMachine } from '../machines/appMachine';
import { Server, Zap } from 'lucide-react';

export const ContextIndicator = () => {
  const [state] = useMachine(appMachine);
  const topology = state.context.topology;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '6px 14px',
      background: 'var(--bg-elevated)',
      borderRadius: '8px',
      border: '1px solid var(--border-light)',
      fontSize: '0.8rem',
      fontWeight: 500,
      color: 'var(--text-secondary)'
    }}>
      {topology ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Server size={12} color="var(--accent-primary)" />
            <span style={{ color: 'var(--text-primary)' }}>{topology.nodes.length} Nodes</span>
          </div>
          <div style={{ width: '1px', height: '10px', background: 'var(--border-focus)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={12} color="var(--accent-emerald)" />
            <span>Infrastructure Synchronized</span>
          </div>
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: 'var(--accent-emerald)',
            boxShadow: '0 0 10px var(--accent-emerald)'
          }} />
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: 'var(--accent-primary)',
            animation: 'pulseGlow 2s infinite'
          }} />
          <span style={{ fontSize: '0.75rem', letterSpacing: '0.02em' }}>Resolving Fleet Topology...</span>
        </div>
      )}
    </div>
  );
};
