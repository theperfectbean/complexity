import { useMachine } from '@xstate/react';
import { appMachine } from '../machines/appMachine';

export const DebugStateOverlay = () => {
  const [state] = useMachine(appMachine);

  return (
    <div 
      data-testid="machine-state" 
      style={{ 
        position: 'fixed', 
        bottom: 10, 
        right: 10, 
        padding: '5px 10px', 
        background: '#333', 
        color: '#fff',
        borderRadius: '4px',
        fontSize: '12px'
      }}
    >
      {state.value.toString()}
    </div>
  );
};
