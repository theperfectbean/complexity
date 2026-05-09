import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Activity } from 'lucide-react';
import { streamAgentRun, type AgentRunEvent } from '../lib/api';
import { uuid } from '../lib/uuid';
import { matchCommands, type SlashCommand } from '../lib/commands';
import { CommandMenu } from './CommandMenu';
import { Markdown } from './Markdown';
import { ThreadSidebar } from './ThreadSidebar';
import { WidgetRenderer } from './WidgetRenderer';
import type { ToolResultEnvelope } from '../lib/protocol';

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

interface Props {
  initialContext?: string;
  onContextUsed?: () => void;
}

const STORAGE_KEY = 'fleet_console_threads_v1';

function loadThreads(): Thread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Thread[]) : [];
  } catch { return []; }
}

function saveThreads(threads: Thread[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(threads)); } catch { /* ignore */ }
}

function makeThread(): Thread {
  return { id: uuid(), title: 'New conversation', createdAt: new Date().toISOString(), turns: [] };
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
  const [pendingApproval, setPendingApproval] = useState<{approvalId: string; threadId?: string} | null>(null);
  const [showCmdMenu, setShowCmdMenu] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (activeId === '' && threads.length > 0) setActiveId(threads[0].id);
  }, [activeId, threads]);

  useEffect(() => {
    if (initialContext) { setInput(initialContext); onContextUsed?.(); }
  }, [initialContext, onContextUsed]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); });
  useEffect(() => { saveThreads(threads); }, [threads]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  }, [input]);

  const updateThread = useCallback((threadId: string, updater: (t: Thread) => Thread) => {
    setThreads(prev => prev.map(t => t.id === threadId ? updater(t) : t));
  }, []);

  const submitMessage = (userMessage: string, extraBodyOverride?: Record<string, unknown>) => {
    const thread = threads.find(t => t.id === activeId);
    if (thread === undefined || isRunning || userMessage.trim() === '') return;

    const turnId = uuid();
    const ab = new AbortController();
    abortRef.current = ab;
    setIsRunning(true);

    updateThread(thread.id, t => ({
      ...t,
      title: t.turns.length === 0 ? userMessage.slice(0, 40) : t.title,
      turns: [...t.turns, { id: turnId, userMessage, events: [], isRunning: true }],
    }));

    let extraBody: Record<string, unknown> = { threadId: thread.id };
    if (extraBodyOverride) {
      extraBody = extraBodyOverride;
    } else if (pendingApproval) {
      extraBody = { approvalId: pendingApproval.approvalId, threadId: pendingApproval.threadId ?? thread.id };
      setPendingApproval(null);
    }

    streamAgentRun(
      userMessage,
      'default',
      (event) => {
        updateThread(thread.id, t => ({
        ...t, turns: t.turns.map(tr => tr.id === turnId ? { ...tr, events: [...tr.events, event] } : tr),
        }));
        if (event.type === 'destructive_confirm') {
          const ev = event as Record<string, unknown>;
          setPendingApproval({ approvalId: String(ev.approvalId), threadId: ev.threadId as string | undefined });
        }
      },
      () => {
        setIsRunning(false);
        updateThread(thread.id, t => ({
          ...t, turns: t.turns.map(tr => tr.id === turnId ? { ...tr, isRunning: false } : tr),
        }));
      },
      (err) => {
        setIsRunning(false);
        const errEvent: AgentRunEvent = { type: 'error', message: err };
        updateThread(thread.id, t => ({
          ...t, turns: t.turns.map(tr => tr.id === turnId ? { ...tr, isRunning: false, events: [...tr.events, errEvent] } : tr),
        }));
      },
      ab.signal,
      extraBody,
    );
  };

  const handleNewThread = () => {
    const t = makeThread();
    setThreads(prev => [t, ...prev]);
    setActiveId(t.id);
  };

  const handleDeleteThread = (id: string) => {
    setThreads(prev => {
      const next = prev.filter(t => t.id !== id);
      if (id === activeId) {
        const remaining = next.length > 0 ? next : [makeThread()];
        const newThreads = next.length > 0 ? next : remaining;
        setActiveId(remaining[0].id);
        return newThreads;
      }
      return next.length > 0 ? next : [makeThread()];
    });
  };

  const clearActiveThread = () => {
    setThreads(prev => prev.map(t => t.id === activeId ? { ...t, turns: [] } : t));
    setShowCmdMenu(false);
    setCmdQuery('');
    setInput('');
  };

  const handleCommandSelect = (cmd: SlashCommand) => {
    const result = cmd.action({ clearThread: clearActiveThread });
    if (result !== null) {
      setInput(result);
    }
    setShowCmdMenu(false);
    setCmdQuery('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    if (val.startsWith('/')) {
      const afterSlash = val.substring(1);
      if (!afterSlash.includes(' ')) {
        setShowCmdMenu(true);
        setCmdQuery(afterSlash);
        return;
      }
    }
    setShowCmdMenu(false);
    setCmdQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCmdMenu && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Tab')) {
      e.preventDefault();
      return;
    }
    if (showCmdMenu && e.key === 'Enter') {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape' && showCmdMenu) {
      e.preventDefault();
      setShowCmdMenu(false);
      setCmdQuery('');
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage(input);
      setInput('');
    }
  };

  const activeThread = threads.find(t => t.id === activeId);
  const sidebarThreads = threads.map(t => ({
    id: t.id,
    title: t.turns[0]?.userMessage.slice(0, 40) || t.title,
    createdAt: t.createdAt,
  }));

  return (
    <div data-testid="agent-chat" style={{ display: 'flex', height: '100%', background: 'var(--bg-page)', color: 'var(--text)', fontFamily: 'inherit' }}>
      <ThreadSidebar
        threads={sidebarThreads}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={handleNewThread}
        onDelete={handleDeleteThread}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '860px', margin: '0 auto', position: 'relative', width: '100%' }}>
        <div data-testid="turn-list" style={{ flex: 1, overflowY: 'auto', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          {activeThread?.turns.length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-empty)', textAlign: 'center', padding: '3rem 2rem', gap: '1rem', minHeight: '40vh' }}>
              <div style={{ padding: '1rem', borderRadius: '50%', background: 'var(--accent-subtle)' }}>
                <Activity size={28} style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <p style={{ margin: '0 0 0.5rem', fontSize: '1.05rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Fleet Console</p>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-empty)', maxWidth: '360px' }}>
                  Ask about your Proxmox cluster — container status, resource usage, service health, and more.
                </p>
              </div>
            </div>
          )}
          {activeThread?.turns.map(turn => (
            <div key={turn.id} data-testid="conversation-turn" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div data-testid="user-message" style={{ maxWidth: '80%', padding: '0.75rem 1.125rem', background: 'var(--accent)', color: 'var(--primary-foreground)', borderRadius: '1.25rem', borderBottomRightRadius: '0.25rem', fontSize: '0.93rem', lineHeight: 1.5 }}>
                  {turn.userMessage}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {turn.events.map((ev, idx) => (
                  <EventBlock
                    key={idx}
                    event={ev}
                    onApprove={(approvalId, threadId) =>
                      submitMessage('CONFIRM', {
                        approvalId,
                        threadId: threadId ?? activeThread?.id,
                      })
                    }
                    onCancelApproval={() => setPendingApproval(null)}
                  />
                ))}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div style={{ padding: '1.25rem 1.5rem 1.5rem', background: `linear-gradient(to top, var(--bg-page) 80%, transparent)` }}>
          <form
            data-testid="message-form"
            onSubmit={(e) => { e.preventDefault(); submitMessage(input); setInput(''); }}
            style={{ position: 'relative', display: 'flex', alignItems: 'flex-end' }}
          >
            {showCmdMenu && (
              <CommandMenu
                commands={matchCommands(cmdQuery)}
                onSelect={handleCommandSelect}
                onClose={() => { setShowCmdMenu(false); setCmdQuery(''); }}
              />
            )}
            <textarea
              ref={textareaRef}
              data-testid="message-input"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your cluster…  (Enter to send, Shift+Enter for newline)"
              disabled={isRunning}
              rows={1}
              style={{
                width: '100%', padding: '0.875rem 3.5rem 0.875rem 1.125rem',
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: '0.875rem', color: 'var(--text)', fontSize: '0.9375rem',
                outline: 'none', resize: 'none', overflow: 'hidden', lineHeight: 1.5,
                maxHeight: '200px', overflowY: 'auto', boxShadow: 'var(--shadow-sm)',
              }}
            />
            {isRunning && (
              <button
                data-testid="cancel-btn"
                type="button"
                onClick={() => { abortRef.current?.abort(); }}
                style={{
                  position: 'absolute', right: '3.5rem', bottom: '0.5rem',
                  background: 'none', border: 'none', borderRadius: '0.5rem',
                  padding: '0.4rem 0.5rem', cursor: 'pointer',
                  color: 'var(--text-secondary)', fontSize: '0.75rem',
                }}
              >
                Stop
              </button>
            )}
            <button
              data-testid="send-btn"
              type="submit"
              disabled={input.trim() === '' || isRunning}
              style={{
                position: 'absolute', right: '0.625rem', bottom: '0.5rem',
                background: isRunning ? 'transparent' : 'var(--accent)',
                border: 'none', borderRadius: '0.5rem', padding: '0.4rem 0.45rem',
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                opacity: input.trim() !== '' || isRunning ? 1 : 0.35,
                transition: 'opacity 0.15s',
              }}
            >
              {isRunning
                ? <Loader2 size={17} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
                : <Send size={17} style={{ color: 'var(--primary-foreground)' }} />}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

function ToolResult({ toolName, result }: { toolName: string; result: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="tool-result" style={{ border: '1px solid var(--border)', borderRadius: '0.75rem', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.5rem 0.875rem', background: 'var(--bg-surface-alt)', border: 'none',
          cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.775rem', textAlign: 'left',
        }}
      >
        <span>Result: <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{toolName}</span></span>
        <span style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', fontSize: '0.65rem', opacity: 0.6 }}>▾</span>
      </button>
      <div style={{ maxHeight: open ? '600px' : '0', overflow: 'hidden', transition: 'max-height 0.25s ease' }}>
        <div style={{ padding: '0.875rem' }}>
          <WidgetRenderer toolName={toolName} result={result as ToolResultEnvelope} />
        </div>
      </div>
    </div>
  );
}

function EventBlock({ event, onApprove, onCancelApproval }: {
  event: AgentRunEvent;
  onApprove?: (approvalId: string, threadId?: string) => void;
  onCancelApproval?: () => void;
}) {
  const e = event as Record<string, unknown>;
  switch (event.type) {
    case 'text':
    case 'assistant_message': {
      const text = (e.content as string) || ((e.message as Record<string, string>)?.text ?? '');
      return (
        <div data-testid="assistant-message" style={{ fontSize: '0.9375rem', lineHeight: 1.65, color: 'var(--text)' }}>
          <Markdown text={text} />
        </div>
      );
    }
    case 'tool_start':
      return (
        <div data-testid="tool-start" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <Loader2 size={12} className="animate-spin" />
          <span>Using <code style={{ color: 'var(--accent)', fontWeight: 500 }}>{String(e.tool)}</code>…</span>
        </div>
      );
    case 'tool_result':
      return <ToolResult toolName={String(e.tool)} result={e.result} />;
    case 'error':
      return (
        <div data-testid="error-block" style={{ color: 'var(--error)', fontSize: '0.85rem', padding: '0.75rem 1rem', background: 'color-mix(in srgb, var(--error) 10%, transparent)', borderRadius: '0.625rem', border: '1px solid color-mix(in srgb, var(--error) 25%, transparent)' }}>
          Error: {String(e.message ?? e.error)}
        </div>
      );
    case 'tool_error':
      return (
        <div data-testid="tool-error-block" style={{ color: 'var(--error)', fontSize: '0.85rem', padding: '0.75rem 1rem', background: 'color-mix(in srgb, var(--error) 10%, transparent)', borderRadius: '0.625rem', border: '1px solid color-mix(in srgb, var(--error) 25%, transparent)' }}>
          ✗ {String(e.error ?? e.message)}
        </div>
      );
    case 'run_started':
    case 'run_status': {
      const runId = String(e.runId ?? '');
      const status = e.status ? String(e.status) : undefined;
      return (
        <div data-testid="run-meta" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', opacity: 0.7 }}>
          <span>{runId}</span>
          {status && <> &middot; <span>{status}</span></>}
        </div>
      );
    }
    case 'destructive_confirm': {
      const approvalId = String(e.approvalId ?? '');
      const approvalThreadId = e.threadId as string | undefined;
      return (
        <div data-testid="destructive-confirm" style={{ padding: '1rem', border: '1px solid color-mix(in srgb, var(--error) 40%, transparent)', borderRadius: '0.75rem', background: 'color-mix(in srgb, var(--error) 8%, transparent)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text)' }}>
            {String(e.message ?? 'Destructive action requires approval.')}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => onApprove?.(approvalId, approvalThreadId)}
              style={{ padding: '0.375rem 1rem', background: 'var(--accent)', color: 'var(--primary-foreground)', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => onCancelApproval?.()}
              style={{ padding: '0.375rem 1rem', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }
    default: return null;
  }
}
