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
      fontFamily: 'var(--font-ui)'
    }}>
      {/* Header */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 24px',
        borderBottom: '1px solid var(--border-light)',
        background: 'var(--bg-surface)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ 
            background: 'var(--accent-cyan-glow)', 
            padding: '8px', 
            borderRadius: '8px',
            border: '1px solid rgba(6, 182, 212, 0.3)'
          }}>
            <TerminalSquare size={20} color="var(--accent-cyan)" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.1rem', margin: 0, fontWeight: 600, letterSpacing: '-0.02em' }}>
              Complexity <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Console</span>
            </h1>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>AI-Driven Terminal Multiplexer</div>
          </div>
        </div>
        
        <ContextIndicator />
      </header>

      {/* Main Workspace */}
      <main style={{ 
        flex: 1, 
        padding: '24px', 
        display: 'grid', 
        gridTemplateColumns: state.context.telemetryData ? '1fr 380px' : '1fr', 
        gap: '24px',
        overflow: 'hidden'
      }}>
        
        {/* Terminal Area */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', paddingLeft: '4px' }}>
              <Cpu size={16} color="var(--text-secondary)" />
              <h2 style={{ fontSize: '0.9rem', margin: 0, color: 'var(--text-secondary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Execution Stream
              </h2>
            </div>
            
            <div style={{ flex: 1, minHeight: 0 }}>
              <TerminalBlock initialContent={state.context.terminalContent.join('')} />
            </div>
          </div>
        </section>

        {/* Telemetry Area (Conditional) */}
        {state.context.telemetryData && (
          <aside style={{ height: '100%', overflow: 'hidden' }}>
            <TelemetryDashboard data={state.context.telemetryData} />
          </aside>
        )}
      </main>

      {/* Fixed Command Input Footer */}
      <footer style={{
        padding: '24px',
        borderTop: '1px solid var(--border-light)',
        background: 'var(--bg-surface)'
      }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
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
          position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)',
          padding: '12px 20px', background: 'var(--bg-surface)', border: '1px solid var(--accent-crimson)', 
          borderRadius: '8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '12px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)', zIndex: 100
        }}>
          <ShieldAlert size={18} color="var(--accent-crimson)" />
          <span style={{ fontSize: '0.9rem' }}>{state.context.error}</span>
        </div>
      )}
    </div>
  )
}

export default App
