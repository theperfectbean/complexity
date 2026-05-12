import { useMachine } from '@xstate/react';
import { appMachine } from '../machines/appMachine';

export const ContextIndicator = () => {
  const [state] = useMachine(appMachine);
  const topology = state.context.topology;

  if (!topology) {
    return <div data-testid="context-status">Loading Context...</div>;
  }

  return (
    <div data-testid="context-status" style={{ padding: '10px', background: '#e0e0e0', marginBottom: '20px' }}>
      Context Loaded: {topology.nodes.length} Nodes
    </div>
  );
};
