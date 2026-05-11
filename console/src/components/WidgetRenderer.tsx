import type { ToolResultEnvelope } from '../lib/protocol';
import { CommandResult } from './widgets/CommandResult';
import { HostList } from './widgets/HostList';
import { DataTable } from './widgets/DataTable';
import { KeyValue } from './widgets/KeyValue';
import { TaskStatus } from './widgets/TaskStatus';

interface ModelSwitchedEvent {
  type: 'model_switched';
  from: string;
  to: string;
  reason: string;
}

interface ContextSummarizedEvent {
  type: 'context_summarized';
  originalTokens: number;
  summaryTokens: number;
}

interface DiagnosticEvent {
  type: 'diagnostic';
  category: 'routing' | 'context' | 'approval' | 'tool';
  message: string;
  data?: Record<string, string | number | boolean | null>;
}

type StreamEventNotification = ModelSwitchedEvent | ContextSummarizedEvent | DiagnosticEvent;

interface Props {
  toolName: string;
  result: ToolResultEnvelope;
  streamEvent?: StreamEventNotification;
}

const noticeStyle: React.CSSProperties = {
  borderRadius: '0.75rem',
  border: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  padding: '0.75rem',
  fontSize: '0.75rem',
  color: 'var(--text-muted)',
};

export function WidgetRenderer({ toolName, result, streamEvent }: Props) {
  // Handle special stream events passed directly (no LLM round-trip)
  if (streamEvent?.type === 'model_switched') {
    const { from, to, reason } = streamEvent;
    return (
      <div style={noticeStyle}>
        <KeyValue data={{ 'switched from': from, 'switched to': to, reason }} />
      </div>
    );
  }

  if (streamEvent?.type === 'context_summarized') {
    const { originalTokens, summaryTokens } = streamEvent;
    return (
      <div style={noticeStyle}>
        <span>Context compressed: {originalTokens}&rarr;{summaryTokens} tokens</span>
      </div>
    );
  }

  if (streamEvent?.type === 'diagnostic') {
    return (
      <div style={noticeStyle}>
        <KeyValue
          data={{
            category: streamEvent.category,
            message: streamEvent.message,
            ...(streamEvent.data ?? {}),
          }}
        />
      </div>
    );
  }

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
    <div style={{ borderRadius: '0.75rem', border: '1px solid var(--border)', background: 'var(--bg-surface)', padding: '0.75rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent)' }}>{toolName}</span>
          <span style={{ fontSize: '0.65rem', fontWeight: 600, color: result.ok ? 'var(--success, #22c55e)' : 'var(--error, #ef4444)' }}>
            {result.ok ? '\u2713 OK' : '\u2717 FAILED'}
          </span>
        </div>
        {result.diagnostics?.durationMs != null && (
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{result.diagnostics.durationMs}ms</span>
        )}
      </div>
      {/* Summary */}
      {result.summary && (
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{result.summary}</p>
      )}
      {/* Widget content */}
      {inner}
    </div>
  );
}
