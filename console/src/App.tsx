import { useMachine } from '@xstate/react'
import { appMachine } from './machines/appMachine'
import { ContextIndicator } from './components/ContextIndicator'
import { TerminalBlock } from './components/TerminalBlock'
import { SudoApprovalWidget } from './components/SudoApprovalWidget'
import { TelemetryDashboard } from './components/TelemetryDashboard'
import { CommandInput } from './components/CommandInput'
import { TerminalSquare, ShieldAlert, Cpu } from 'lucide-react'

function App() {
  const [state, send] = useMachine(appMachine);

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh', 
      background: 'var(--bg-base)',
      fontFamily: 'var(--font-ui)',
      color: 'var(--text-primary)'
    }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        borderBottom: '1px solid var(--border-light)',
        background: 'var(--bg-surface)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <TerminalSquare size={18} color="var(--accent-primary)" />
          <h1 style={{ fontSize: '0.95rem', margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Complexity <span style={{ opacity: 0.5, fontWeight: 400 }}>Console</span>
          </h1>
        </div>
        
        <ContextIndicator />
      </header>

      {/* Main Workspace */}
      <main style={{ 
        flex: 1, 
        padding: '20px', 
        display: 'grid', 
        gridTemplateColumns: state.context.telemetryData ? '1fr 340px' : '1fr', 
        gap: '20px',
        overflow: 'hidden'
      }}>
        
        {/* Terminal Area */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '4px' }}>
            <Cpu size={14} color="var(--text-secondary)" />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase' }}>
              Execution
            </span>
          </div>
          
          <div style={{ flex: 1, minHeight: 0 }}>
            <TerminalBlock initialContent={state.context.terminalContent.join('')} />
          </div>
        </section>

        {/* Telemetry Area (Conditional) */}
        {state.context.telemetryData && (
          <aside style={{ height: '100%', overflow: 'hidden' }} className="animate-fade-in">
            <TelemetryDashboard data={state.context.telemetryData} />
          </aside>
        )}
      </main>

      {/* Input Footer */}
      <footer style={{
        padding: '16px 24px',
        borderTop: '1px solid var(--border-light)',
        background: 'var(--bg-surface)'
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <CommandInput 
            onExecute={(command) => send({ type: 'EXECUTE', command })} 
            disabled={state.matches('executingTool') || state.matches('awaitingSudo')}
          />
        </div>
      </footer>

      {/* Sudo Modal Overlay */}
      {state.matches('awaitingSudo') && state.context.pendingApproval && (
        <SudoApprovalWidget 
          message={state.context.pendingApproval.message}
          tool={state.context.pendingApproval.tool}
          params={state.context.pendingApproval.params}
          onApprove={() => send({ type: 'APPROVE' })}
          onCancel={() => send({ type: 'CANCEL' })}
        />
      )}

      {/* Global Error Banner */}
      {state.context.error && (
        <div className="animate-slide-up" style={{ 
          position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
          padding: '10px 16px', background: '#2d1a1e', border: '1px solid var(--accent-crimson)', 
          borderRadius: '6px', color: '#ffcbd1', display: 'flex', alignItems: 'center', gap: '10px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)', zIndex: 100, fontSize: '0.85rem'
        }}>
          <ShieldAlert size={14} color="var(--accent-crimson)" />
          <span>{state.context.error}</span>
        </div>
      )}
    </div>
  )
}

export default App
