import { useMachine } from '@xstate/react'
import { appMachine } from './machines/appMachine'
import { DebugStateOverlay } from './components/DebugStateOverlay'
import { ContextIndicator } from './components/ContextIndicator'
import { TerminalBlock } from './components/TerminalBlock'
import { SudoApprovalWidget } from './components/SudoApprovalWidget'
import { TelemetryDashboard } from './components/TelemetryDashboard'
import { CommandInput } from './components/CommandInput'

function App() {
  const [state, send] = useMachine(appMachine);

  return (
    <div className="App" style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1 style={{ borderBottom: '2px solid #333', paddingBottom: '10px' }}>Complexity Terminal Multiplexer</h1>
      
      <ContextIndicator />
      
      <CommandInput 
        onExecute={(command) => send({ type: 'EXECUTE', command })} 
        disabled={state.matches('executingTool') || state.matches('awaitingSudo')}
      />

      <div style={{ display: 'grid', gridTemplateColumns: state.context.telemetryData ? '1fr 400px' : '1fr', gap: '20px' }}>
        <div className="terminal-area">
          {(state.context.executingTool || state.context.terminalContent.length > 0) && (
            <TerminalBlock initialContent={state.context.terminalContent.join('')} />
          )}
        </div>

        {state.context.telemetryData && (
          <div className="telemetry-area">
            <TelemetryDashboard data={state.context.telemetryData} />
          </div>
        )}
      </div>

      {state.matches('awaitingSudo') && state.context.pendingApproval && (
        <SudoApprovalWidget 
          message={state.context.pendingApproval.message}
          tool={state.context.pendingApproval.tool}
          params={state.context.pendingApproval.params}
          onApprove={() => send({ type: 'APPROVE' })}
          onCancel={() => send({ type: 'CANCEL' })}
        />
      )}

      {state.context.error && (
        <div style={{ padding: '15px', background: '#fff5f5', border: '1px solid #ff4444', borderRadius: '4px', color: '#cc0000', marginTop: '20px' }}>
          <strong>Error:</strong> {state.context.error}
        </div>
      )}

      <DebugStateOverlay />
    </div>
  )
}

export default App
