import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { fetchAgentRun, streamAgentRun, type AgentRunEvent } from '../lib/api';
import { ThreadSidebar } from './ThreadSidebar';
import { uuid } from '../lib/uuid';
import { Markdown } from './Markdown';
import { WidgetRenderer } from './WidgetRenderer';

interface ConversationTurn {
  id: string;
  userMessage: string;
  events: AgentRunEvent[];
  isRunning: boolean;
  runId?: string;
  status?: string;
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
  const [pendingApprovalIds, setPendingApprovalIds] = useState<Record<string, string | undefined>>({});
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recoveringRunsRef = useRef<Set<string>>(new Set());
  const recoveredRunsRef = useRef<Set<string>>(new Set());

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

  useEffect(() => {
    for (const thread of threads) {
      for (const turn of thread.turns) {
        if (!turn.runId || !turn.isRunning || recoveringRunsRef.current.has(turn.runId) || recoveredRunsRef.current.has(turn.runId)) continue;
        recoveringRunsRef.current.add(turn.runId);
        void fetchAgentRun(turn.runId)
          .then((run) => {
            const recoveredApprovalId = run.state.status === 'paused_for_approval'
              ? [...run.events].reverse().find((event) => event.type === 'destructive_confirm' && typeof (event as Record<string, unknown>).approvalId === 'string')
              : undefined;
            if (recoveredApprovalId) {
              setPendingApprovalIds((prev) => ({
                ...prev,
                [thread.id]: (recoveredApprovalId as Record<string, unknown>).approvalId as string,
              }));
            }
            updateThread(thread.id, (currentThread) => ({
              ...currentThread,
              turns: currentThread.turns.map((currentTurn) => {
                if (currentTurn.id !== turn.id) return currentTurn;
                return {
                  ...currentTurn,
                  events: run.events.length > currentTurn.events.length ? run.events : currentTurn.events,
                  isRunning: run.state.status === 'in_progress' || run.state.status === 'paused_for_approval',
                  status: run.state.status,
                };
              }),
            }));
          })
          .catch(() => undefined)
          .finally(() => {
            recoveredRunsRef.current.add(turn.runId!);
            recoveringRunsRef.current.delete(turn.runId!);
          });
      }
    }
  }, [threads, updateThread]);

  const submitMessage = useCallback((userMessage: string, extraBody: Record<string, unknown> = {}) => {
    const explicitThreadId = typeof extraBody.threadId === 'string' ? extraBody.threadId : undefined;
    const thread = threads.find(t => t.id === (explicitThreadId ?? activeId));
    if (isRunning || !thread) return;

    const normalized = userMessage.trim().toUpperCase();
    const threadApprovalId = pendingApprovalIds[thread.id];
    const effectiveExtraBody = (
      (normalized === 'CONFIRM' || normalized === 'CANCEL') &&
      threadApprovalId &&
      extraBody.approvalId === undefined
    )
      ? { ...extraBody, approvalId: threadApprovalId, threadId: thread.id }
      : { ...extraBody, threadId: thread.id };

    if ('approvalId' in effectiveExtraBody && effectiveExtraBody.approvalId) {
      setPendingApprovalIds(prev => ({ ...prev, [thread.id]: undefined }));
    }

    const turnId = uuid();
    setIsRunning(true);

    const turn: ConversationTurn = {
      id: turnId,
      userMessage,
      events: [],
      isRunning: true,
    };

    updateThread(thread.id, t => ({
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
          if (event.type === 'destructive_confirm') {
            const approvalId = (event as Record<string, unknown>).approvalId;
            if (typeof approvalId === 'string') {
              setPendingApprovalIds(prev => ({ ...prev, [thread.id]: approvalId }));
            }
          }
          const runId = typeof (event as Record<string, unknown>).runId === 'string'
            ? (event as Record<string, unknown>).runId as string
            : undefined;
          const status = typeof (event as Record<string, unknown>).status === 'string'
            ? (event as Record<string, unknown>).status as string
            : undefined;
          updateThread(thread.id, t => ({
            ...t,
            turns: t.turns.map(tr =>
              tr.id === turnId ? {
                ...tr,
                events: [...tr.events, event],
                runId: runId ?? tr.runId,
                status: status ?? tr.status,
              } : tr,
            ),
          }));
        },
        () => {
          setIsRunning(false);
          updateThread(thread.id, t => ({
            ...t,
            turns: t.turns.map(tr =>
              tr.id === turnId ? {
                ...tr,
                isRunning: false,
                status: tr.status === 'running' ? 'completed' : tr.status,
              } : tr,
            ),
          }));
        },
      (err) => {
        setIsRunning(false);
        const errEvent: AgentRunEvent = {
          type: 'error',
          error: { code: 'stream_error', message: err },
        };
        updateThread(thread.id, t => ({
          ...t,
            turns: t.turns.map(tr =>
              tr.id === turnId
                ? { ...tr, isRunning: false, status: 'error', events: [...tr.events, errEvent] }
                : tr,
            ),
          }));
      },
      ab.signal,
      effectiveExtraBody,
    );
  }, [activeId, isRunning, pendingApprovalIds, threads, updateThread]);

  const handleNewThread = useCallback(() => {
    const t = makeThread();
    setThreads(prev => [t, ...prev]);
    setActiveId(t.id);
  }, []);

  const activeThread = threads.find(t => t.id === activeId);
  const activeTurn = activeThread?.turns.at(-1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const userMessage = input.trim();
    setInput('');
    submitMessage(userMessage);
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setIsRunning(false);
  };

  const handleApproval = useCallback((event: AgentRunEvent, approved: boolean) => {
    const e = event as Record<string, unknown>;
    if (typeof e.approvalId !== 'string') {
      return;
    }
    submitMessage(approved ? 'CONFIRM' : 'CANCEL', {
      approvalId: e.approvalId,
      ...(typeof e.threadId === 'string' ? { threadId: e.threadId } : {}),
    });
  }, [submitMessage]);

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
            <TurnBlock key={turn.id} turn={turn} onApproval={handleApproval} />
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

      <InspectorPanel thread={activeThread} turn={activeTurn} />
    </div>
  );
}

function TurnBlock({ turn, onApproval }: { turn: ConversationTurn; onApproval: (event: AgentRunEvent, approved: boolean) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
      {/* User bubble */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ maxWidth: '70%', borderRadius: '1rem', borderTopRightRadius: '0.25rem', padding: '0.625rem 1rem', fontSize: '0.85rem', background: 'var(--accent)', color: '#fff' }}>
          <div>{turn.userMessage}</div>
          {(turn.runId || turn.status) && (
            <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {turn.status && (
                <span style={{ borderRadius: '999px', background: 'rgba(255,255,255,0.18)', padding: '0.08rem 0.45rem', fontSize: '0.65rem' }}>
                  {turn.status.replace(/_/g, ' ')}
                </span>
              )}
              {turn.runId && (
                <code style={{ fontSize: '0.65rem', background: 'rgba(15,23,42,0.22)', padding: '0.08rem 0.45rem', borderRadius: '999px' }}>
                  {turn.runId}
                </code>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Events */}
      {turn.events.map((ev, idx) => (
        <EventBlock key={idx} event={ev} onApproval={onApproval} />
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

function EventBlock({ event, onApproval }: { event: AgentRunEvent; onApproval: (event: AgentRunEvent, approved: boolean) => void }) {
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
            <button onClick={() => onApproval(event, true)} style={{ borderRadius: '0.5rem', padding: '0.375rem 1rem', fontSize: '0.8rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: '#22c55e', color: '#fff' }}>
              Approve
            </button>
            <button onClick={() => onApproval(event, false)} style={{ borderRadius: '0.5rem', padding: '0.375rem 1rem', fontSize: '0.8rem', fontWeight: 500, border: 'none', cursor: 'pointer', background: '#ef4444', color: '#fff' }}>
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

function InspectorPanel({ thread, turn }: { thread?: Thread; turn?: ConversationTurn }) {
  const timeline = turn ? buildTimeline(turn.events) : [];
  const toolResults = turn ? turn.events.filter((event) => event.type === 'tool_result' || event.type === 'tool_error') : [];
  const verification = summarizeVerification(turn);

  return (
    <aside style={{ width: '320px', borderLeft: '1px solid var(--border)', background: 'var(--bg-surface)', overflowY: 'auto', flexShrink: 0 }}>
      <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <section>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
            Operator workspace
          </p>
          {thread ? (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <MetricRow label="Thread" value={thread.title} />
              <MetricRow label="Turns" value={String(thread.turns.length)} />
              <MetricRow label="Run" value={turn?.runId ?? 'Pending'} monospace />
              <MetricRow label="Status" value={turn?.status ?? 'idle'} />
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Select or start a thread to inspect the live run timeline.</p>
          )}
        </section>

        <section>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
            Verification state
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem' }}>
            <StatusTile label="Completed tools" value={String(verification.completed)} tone="success" />
            <StatusTile label="Failures" value={String(verification.failed)} tone={verification.failed > 0 ? 'error' : 'neutral'} />
            <StatusTile label="Awaiting approval" value={verification.awaitingApproval ? 'Yes' : 'No'} tone={verification.awaitingApproval ? 'warning' : 'neutral'} />
            <StatusTile label="Assistant replies" value={String(verification.messages)} tone="neutral" />
          </div>
        </section>

        <section>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
            Tool pane
          </p>
          {toolResults.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {toolResults.map((event, index) => (
                <ToolPane key={`${event.type}-${index}`} event={event} />
              ))}
            </div>
          ) : (
            <EmptyCard text="Tool executions will appear here with structured output as the run progresses." />
          )}
        </section>

        <section>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
            Timeline
          </p>
          {timeline.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {timeline.map((item, index) => (
                <div key={`${item.label}-${index}`} style={{ borderRadius: '0.75rem', border: '1px solid var(--border)', background: 'var(--bg-page)', padding: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)' }}>{item.label}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{item.kind}</span>
                  </div>
                  {item.detail && (
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.74rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {item.detail}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyCard text="The latest run timeline will be summarized here." />
          )}
        </section>
      </div>
    </aside>
  );
}

function MetricRow({ label, value, monospace = false }: { label: string; value: string; monospace?: boolean }) {
  return (
    <div style={{ borderRadius: '0.75rem', border: '1px solid var(--border)', background: 'var(--bg-page)', padding: '0.75rem' }}>
      <p style={{ margin: '0 0 0.25rem', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>{label}</p>
      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text)', fontFamily: monospace ? 'monospace' : undefined, wordBreak: 'break-word' }}>{value}</p>
    </div>
  );
}

function StatusTile({ label, value, tone }: { label: string; value: string; tone: 'success' | 'error' | 'warning' | 'neutral' }) {
  const colors: Record<typeof tone, string> = {
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
    neutral: 'var(--text-secondary)',
  };
  return (
    <div style={{ borderRadius: '0.75rem', border: '1px solid var(--border)', background: 'var(--bg-page)', padding: '0.75rem' }}>
      <p style={{ margin: '0 0 0.2rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{label}</p>
      <p style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: colors[tone] }}>{value}</p>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div style={{ borderRadius: '0.75rem', border: '1px dashed var(--border)', background: 'var(--bg-page)', padding: '0.9rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
      {text}
    </div>
  );
}

function ToolPane({ event }: { event: AgentRunEvent }) {
  const payload = event as Record<string, unknown>;
  if (event.type === 'tool_error') {
    return (
      <div style={{ borderRadius: '0.75rem', border: '1px solid var(--error)', background: 'var(--bg-page)', padding: '0.85rem' }}>
        <p style={{ margin: '0 0 0.35rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--error)' }}>
          {(payload.tool as string | undefined) ?? 'tool'} failed
        </p>
        <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {(payload.error as string | undefined) ?? 'Unknown error'}
        </p>
      </div>
    );
  }

  const toolName = (payload.tool as string | undefined) ?? 'tool';
  const result = payload.result;
  const structured = isEnvelope(result) ? result : inferStructuredResult(result);
  if (structured) {
    return <WidgetRenderer toolName={toolName} result={structured} />;
  }

  return (
    <details style={{ borderRadius: '0.75rem', border: '1px solid var(--border)', background: 'var(--bg-page)', padding: '0.85rem' }} open>
      <summary style={{ cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)' }}>{toolName}</summary>
      <pre style={{ margin: '0.6rem 0 0', fontSize: '0.72rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-secondary)' }}>
        {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
      </pre>
    </details>
  );
}

function summarizeVerification(turn?: ConversationTurn) {
  if (!turn) {
    return { completed: 0, failed: 0, awaitingApproval: false, messages: 0 };
  }

  let completed = 0;
  let failed = 0;
  let messages = 0;
  let awaitingApproval = turn.status === 'waiting_for_approval';
  for (const event of turn.events) {
    if (event.type === 'tool_result') completed += 1;
    if (event.type === 'tool_error' || event.type === 'error') failed += 1;
    if (event.type === 'text' || event.type === 'assistant_message') messages += 1;
    if (event.type === 'destructive_confirm') awaitingApproval = true;
    if (event.type === 'approval_decision') awaitingApproval = false;
  }

  return { completed, failed, awaitingApproval, messages };
}

function buildTimeline(events: AgentRunEvent[]) {
  return events.flatMap((event) => {
    const payload = event as Record<string, unknown>;
    switch (event.type) {
      case 'run_started':
        return [{ kind: 'run', label: 'Run started', detail: payload.userMessage as string | undefined }];
      case 'run_status':
        return [{ kind: 'status', label: `Status: ${String(payload.status ?? 'unknown').replace(/_/g, ' ')}`, detail: '' }];
      case 'command_parsed':
        return [{ kind: 'command', label: 'Command parsed', detail: JSON.stringify(payload.command, null, 2) }];
      case 'tool_start':
        return [{ kind: 'tool', label: `Started ${String(payload.tool ?? 'tool')}`, detail: JSON.stringify(payload.params ?? {}, null, 2) }];
      case 'tool_result':
        return [{ kind: 'tool', label: `Completed ${String(payload.tool ?? 'tool')}`, detail: summarizeResult(payload.result) }];
      case 'tool_error':
        return [{ kind: 'error', label: `Failed ${String(payload.tool ?? 'tool')}`, detail: String(payload.error ?? '') }];
      case 'destructive_confirm':
        return [{ kind: 'approval', label: 'Approval requested', detail: String(payload.message ?? '') }];
      case 'approval_decision':
        return [{ kind: 'approval', label: `Approval ${payload.approved ? 'granted' : 'rejected'}`, detail: '' }];
      case 'error':
        return [{ kind: 'error', label: 'Run error', detail: String(payload.message ?? payload.error ?? '') }];
      default:
        return [];
    }
  });
}

function summarizeResult(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result == null) return '';
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function isEnvelope(value: unknown): value is Parameters<typeof WidgetRenderer>[0]['result'] {
  return typeof value === 'object'
    && value !== null
    && 'ok' in value
    && 'widgetHint' in value
    && 'data' in value;
}

function inferStructuredResult(value: unknown): Parameters<typeof WidgetRenderer>[0]['result'] | null {
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
    return {
      ok: true,
      summary: `${value.length} row${value.length === 1 ? '' : 's'}`,
      data: value,
      widgetHint: { type: 'table' },
    };
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.hosts) || Array.isArray(record.nodes) || Array.isArray(record.items)) {
      return {
        ok: true,
        summary: 'Structured host view',
        data: value,
        widgetHint: { type: 'host_list' },
      };
    }
    return {
      ok: true,
      summary: 'Structured key/value view',
      data: value,
      widgetHint: { type: 'key_value' },
    };
  }

  if (typeof value === 'string') {
    return {
      ok: true,
      summary: 'Command output',
      data: { output: value },
      widgetHint: { type: 'command_result' },
    };
  }

  return null;
}
