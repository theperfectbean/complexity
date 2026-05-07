import type { ToolResultEnvelope } from '../lib/protocol';
import { CommandResult } from './widgets/CommandResult';
import { HostList } from './widgets/HostList';
import { DataTable } from './widgets/DataTable';
import { KeyValue } from './widgets/KeyValue';
import { TaskStatus } from './widgets/TaskStatus';

interface Props {
  toolName: string;
  result: ToolResultEnvelope;
}

export function WidgetRenderer({ toolName, result }: Props) {
  const hintType = result.widgetHint?.type;

  const inner = (() => {
    if (hintType === 'host_list' || hintType === 'vm_list') {
      return <HostList data={result.data} />;
    }
    if (hintType === 'table') {
      return <DataTable data={result.data} />;
    }
    if (hintType === 'key_value') {
      return <KeyValue data={result.data} />;
    }
    if (hintType === 'task_status') {
      return <TaskStatus data={result.data} />;
    }
    return <CommandResult data={result.data} />;
  })();

  return (
    <div style={{ borderRadius: '0.75rem', border: '1px solid #2d3748', background: '#1e2030', padding: '0.75rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid #2d3748' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#a78bfa' }}>{toolName}</span>
          <span style={{ fontSize: '0.65rem', fontWeight: 600, color: result.ok ? '#22c55e' : '#ef4444' }}>
            {result.ok ? '✓ OK' : '✗ FAILED'}
          </span>
        </div>
        {result.diagnostics?.durationMs != null && (
          <span style={{ fontSize: '0.65rem', color: '#718096' }}>{result.diagnostics.durationMs}ms</span>
        )}
      </div>
      {/* Summary */}
      {result.summary && (
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#718096' }}>{result.summary}</p>
      )}
      {/* Widget content */}
      {inner}
    </div>
  );
}
