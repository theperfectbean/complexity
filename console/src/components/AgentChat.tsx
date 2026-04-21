import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { streamAgentRun, type AgentRunEvent } from '../lib/api';
import { ThreadSidebar } from './ThreadSidebar';
import { uuid } from '../lib/uuid';
import { Markdown } from './Markdown';

interface ConversationTurn {
  id: string;
  userMessage: string;
  events: AgentRunEvent[];
  isRunning: boolean;
}

interface Thread {
  id: string;
  title: string;
  createdAt: string;
  turns: ConversationTurn[];
}

const STORAGE_KEY = 'fleet_console_threads_v1';

function loadThreads(): Thread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Thread[]) : [];
  } catch {
    return [];
  }
}

function saveThreads(threads: Thread[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  } catch { /* quota exceeded — ignore */ }
}

function makeThread(): Thread {
  return {
    id: uuid(),
    title: 'New conversation',
    createdAt: new Date().toISOString(),
    turns: [],
  };
}

interface Props {
  initialContext: string;
  onContextUsed: () => void;
}

export function AgentChat({ initialContext, onContextUsed }: Props) {
  const [threads, setThreads] = useState<Thread[]>(() => {
    const ts = loadThreads();
    return ts.length > 0 ? ts : [makeThread()];
  });
  const [activeId, setActiveId] = useState<string>(() => {
    const ts = loadThreads();
    return ts.length > 0 ? (ts[0]?.id ?? '') : '';
  });
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Sync activeId when threads initialise
  useEffect(() => {
    if (!activeId && threads.length > 0 && threads[0]) {
      setActiveId(threads[0].id);
    }
  }, [activeId, threads]);

  // Consume initialContext from service selection
  useEffect(() => {
    if (initialContext) {
      setInput(initialContext);
      onContextUsed();
    }
  }, [initialContext, onContextUsed]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  });

  // Persist
  useEffect(() => {
    saveThreads(threads);
  }, [threads]);

  const updateThread = useCallback((threadId: string, updater: (t: Thread) => Thread) => {
    setThreads(prev => prev.map(t => t.id === threadId ? updater(t) : t));
  }, []);

  const handleNewThread = useCallback(() => {
    const t = makeThread();
    setThreads(prev => [t, ...prev]);
    setActiveId(t.id);
  }, []);

  const activeThread = threads.find(t => t.id === activeId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isRunning || !activeThread) return;

    const turnId = uuid();
    const userMessage = input.trim();
    setInput('');
    setIsRunning(true);

    const turn: ConversationTurn = {
      id: turnId,
      userMessage,
      events: [],
      isRunning: true,
    };

    // Update thread title from first message
    updateThread(activeThread.id, t => ({
      ...t,
      title: t.turns.length === 0 ? userMessage.slice(0, 48) : t.title,
      turns: [...t.turns, turn],
    }));

    const ab = new AbortController();
    abortRef.current = ab;

    streamAgentRun(
      userMessage,
      'default',
      (event) => {
        updateThread(activeThread.id, t => ({
          ...t,
          turns: t.turns.map(tr =>
            tr.id === turnId ? { ...tr, events: [...tr.events, event] } : tr,
          ),
        }));
      },
      () => {
        setIsRunning(false);
        updateThread(activeThread.id, t => ({
          ...t,
          turns: t.turns.map(tr =>
            tr.id === turnId ? { ...tr, isRunning: false } : tr,
          ),
        }));
      },
      (err) => {
        setIsRunning(false);
        const errEvent: AgentRunEvent = {
          type: 'error',
          error: { code: 'stream_error', message: err },
        };
        updateThread(activeThread.id, t => ({
          ...t,
          turns: t.turns.map(tr =>
            tr.id === turnId
              ? { ...tr, isRunning: false, events: [...tr.events, errEvent] }
              : tr,
          ),
        }));
      },
      ab.signal,
    );
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setIsRunning(false);
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-page)' }}>
      <ThreadSidebar
        threads={threads.map(t => ({ id: t.id, title: t.title, createdAt: t.createdAt }))}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={handleNewThread}
      />

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {(!activeThread || activeThread.turns.length === 0) && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div style={{ textAlign: 'center', color: 'var(--text-empty)' }}>
                <p style={{ margin: '0 0 0.375rem', fontSize: '1rem', fontWeight: 500 }}>Fleet Agent</p>
                <p style={{ margin: 0, fontSize: '0.8rem' }}>Ask anything about your homelab infrastructure</p>
              </div>
            </div>
          )}

          {activeThread?.turns.map(turn => (
            <TurnBlock key={turn.id} turn={turn} />
          ))}

          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <form
          onSubmit={handleSubmit}
          style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}
        >
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask the fleet agent..."
            disabled={isRunning}
            style={{
              flex: 1,
              borderRadius: '0.75rem',
              border: '1px solid var(--border)',
              background: 'var(--bg-surface)',
              color: 'var(--text)',
              padding: '0.625rem 1rem',
              fontSize: '0.85rem',
              outline: 'none',
            }}
          />
          {isRunning ? (
            <button
              type="button"
              onClick={handleCancel}
              style={{ borderRadius: '0.75rem', padding: '0 0.875rem', border: 'none', cursor: 'pointer', background: '#ef4444', color: '#fff', display: 'flex', alignItems: 'center' }}
            >
              <Loader2 size={16} className="animate-spin" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              style={{ borderRadius: '0.75rem', padding: '0 0.875rem', border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', opacity: input.trim() ? 1 : 0.4 }}
            >
              <Send size={16} />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

function TurnBlock({ turn }: { turn: ConversationTurn }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
      {/* User bubble */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ maxWidth: '70%', borderRadius: '1rem', borderTopRightRadius: '0.25rem', padding: '0.625rem 1rem', fontSize: '0.85rem', background: 'var(--accent)', color: '#fff' }}>
          {turn.userMessage}
        </div>
      </div>

      {/* Events */}
      {turn.events.map((ev, idx) => (
        <EventBlock key={idx} event={ev} />
      ))}

      {turn.isRunning && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          <Loader2 size={12} className="animate-spin" />
          <span>Agent is working…</span>
        </div>
      )}
    </div>
  );
}

function EventBlock({ event }: { event: AgentRunEvent }) {
  const e = event as Record<string, unknown>;

  switch (event.type) {
    // Backend primary event types
    case 'text':
    case 'assistant_message': {
      // 'text' events carry {content: string}, 'assistant_message' carries {message:{text:string}}
      const text = (e.content as string | undefined)
        ?? ((e.message as Record<string, unknown> | undefined)?.text as string | undefined)
        ?? '';
      if (!text) return null;
      return (
        <div style={{ maxWidth: '82%' }}>
          <div style={{ borderRadius: '1rem', borderTopLeftRadius: '0.25rem', padding: '0.75rem 1rem', background: 'var(--bg-surface)', color: 'var(--text)' }}>
            <Markdown text={text} />
          </div>
        </div>
      );
    }

    case 'tool_start':
    case 'tool_executing': {
      // 'tool_start' carries {tool: string}, 'tool_executing' carried {tool:{name:string}}
      const name = (e.tool as string | undefined)
        ?? ((e.tool as Record<string, unknown> | undefined)?.name as string | undefined)
        ?? 'unknown';
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--accent-light)' }}>
          <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙</span>
          <span>Running <code style={{ fontFamily: 'monospace', fontWeight: 600 }}>{name}</code>…</span>
        </div>
      );
    }

    case 'tool_result': {
      // Backend sends {tool: string, result: raw tool output}
      const name = (e.tool as string | undefined) ?? 'tool';
      const rawResult = e.result;
      // Build a compact one-line summary
      let summary = '';
      if (rawResult && typeof rawResult === 'object') {
        const keys = Object.keys(rawResult as object);
        summary = keys.slice(0, 4).join(', ');
      } else if (rawResult != null) {
        summary = String(rawResult).slice(0, 80);
      }
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.73rem', color: 'var(--text-secondary)', padding: '0.1rem 0' }}>
          <span style={{ color: '#22c55e', fontWeight: 600 }}>✓</span>
          <code style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--accent-light)' }}>{name}</code>
          {summary && <span style={{ color: 'var(--text-secondary)' }}>→ {summary}</span>}
        </div>
      );
    }

    case 'tool_error': {
      const name = (e.tool as string | undefined) ?? 'tool';
      const errMsg = (e.error as string | undefined) ?? 'Unknown tool error';
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--error)' }}>
          <span>✗</span>
          <span><code style={{ fontFamily: 'monospace', fontWeight: 600 }}>{name}</code> failed: {errMsg}</span>
        </div>
      );
    }

    case 'destructive_confirm':
    case 'approval_required': {
      const msg = (e.message as string | undefined) ?? 'The agent wants to execute a destructive action.';
      return (
        <div style={{ borderRadius: '0.75rem', border: '1px solid var(--warning)', background: 'var(--bg-surface)', padding: '0.875rem' }}>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--warning)' }}>⚠ Confirmation Required</p>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{msg}</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button style={{ borderRadius: '0.5rem', padding: '0.375rem 1rem', fontSize: '0.8rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: '#22c55e', color: '#fff' }}>
              Approve
            </button>
            <button style={{ borderRadius: '0.5rem', padding: '0.375rem 1rem', fontSize: '0.8rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: '#ef4444', color: '#fff' }}>
              Cancel
            </button>
          </div>
        </div>
      );
    }

    case 'notification': {
      const msg = (e.message as string | undefined);
      if (!msg) return null;
      return (
        <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', padding: '0.1rem 0.25rem' }}>
          ℹ {msg}
        </div>
      );
    }

    case 'reasoning': {
      const r = (e.reasoning as Record<string, unknown> | undefined);
      if ((r?.phase as string | undefined) !== 'final') return null;
      const text = (r?.text as string | undefined) ?? '';
      return (
        <details style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          <summary style={{ cursor: 'pointer' }}>Reasoning</summary>
          <pre style={{ margin: '0.375rem 0 0', borderRadius: '0.5rem', padding: '0.625rem', fontFamily: 'monospace', fontSize: '0.7rem', background: 'var(--bg-surface)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {text}
          </pre>
        </details>
      );
    }

    case 'error': {
      // Backend sends {type:'error', message:'...'} — no nested error object
      const err = (e.error as Record<string, unknown> | undefined);
      const msg = (err?.message as string | undefined)
        ?? (e.message as string | undefined)
        ?? String(e.error ?? 'Unknown error');
      return (
        <div style={{ borderRadius: '0.5rem', border: '1px solid var(--error)', padding: '0.625rem 0.875rem', fontSize: '0.8rem', color: 'var(--error)', background: 'var(--bg-surface)' }}>
          ✗ {msg}
        </div>
      );
    }

    case 'context':
    case 'done':
    case 'run_started':
    case 'run_status':
      return null;

    default:
      return null;
  }
}
