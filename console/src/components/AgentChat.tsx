import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Terminal, Activity, Book } from 'lucide-react';
import { streamAgentRun, type AgentRunEvent } from '../lib/api';
import { uuid } from '../lib/uuid';
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(threads));
  } catch { /* ignore */ }
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

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  }, [input]);

  const updateThread = useCallback((threadId: string, updater: (t: Thread) => Thread) => {
    setThreads(prev => prev.map(t => t.id === threadId ? updater(t) : t));
  }, []);

  const submitMessage = (userMessage: string) => {
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

    streamAgentRun(
      userMessage,
      'default',
      (event) => updateThread(thread.id, t => ({
        ...t, turns: t.turns.map(tr => tr.id === turnId ? { ...tr, events: [...tr.events, event] } : tr),
      })),
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
    );
  };

  const handleNewThread = () => {
    const t = makeThread();
    setThreads(prev => [t, ...prev]);
    setActiveId(t.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitMessage(input);
      setInput('');
    }
  };

  const activeThread = threads.find(t => t.id === activeId);
  const sidebarThreads = threads.map(t => ({ id: t.id, title: t.turns[0]?.userMessage.slice(0, 40) || t.title, createdAt: t.createdAt }));

  return (
    <div data-testid="agent-chat" style={{ display: 'flex', height: '100%', background: 'var(--bg-page)', color: 'var(--text)', fontFamily: 'Inter, sans-serif' }}>
      <ThreadSidebar
        threads={sidebarThreads}
        activeId={activeId}
        onSelect={setActiveId}
        onNew={handleNewThread}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '900px', margin: '0 auto', position: 'relative' }}>
        <div data-testid="turn-list" style={{ flex: 1, overflowY: 'auto', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          {activeThread?.turns.map(turn => (
            <div key={turn.id} data-testid="conversation-turn" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div data-testid="user-message" style={{ maxWidth: '80%', padding: '0.8rem 1.25rem', background: 'var(--bg-surface)', borderRadius: '1.25rem', borderBottomRightRadius: '0.25rem', fontSize: '0.93rem', lineHeight: 1.5 }}>
                  {turn.userMessage}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {turn.events.map((ev, idx) => <EventBlock key={idx} event={ev} />)}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div style={{ padding: '1.5rem', background: `linear-gradient(to top, var(--bg-page) 80%, transparent)` }}>
          <form
            data-testid="message-form"
            onSubmit={(e) => { e.preventDefault(); submitMessage(input); setInput(''); }}
            style={{ position: 'relative', display: 'flex', alignItems: 'flex-end' }}
          >
            <textarea
              ref={textareaRef}
              data-testid="message-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Proxmox Agent…  (Enter to send, Shift+Enter for newline)"
              disabled={isRunning}
              rows={1}
              style={{ width: '100%', padding: '0.875rem 3.5rem 0.875rem 1.25rem', background: 'var(--bg-surface-alt)', border: '1px solid var(--border)', borderRadius: '1rem', color: 'var(--text)', fontSize: '0.95rem', outline: 'none', resize: 'none', overflow: 'hidden', lineHeight: 1.5, maxHeight: '200px', overflowY: 'auto' }}
            />
            <button
              data-testid="send-btn"
              type="submit"
              disabled={input.trim() === '' || isRunning}
              style={{ position: 'absolute', right: '0.75rem', bottom: '0.6rem', background: isRunning ? 'transparent' : 'var(--text)', border: 'none', borderRadius: '0.5rem', padding: '0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: input.trim() !== '' ? 1 : 0.3 }}
            >
              {isRunning
                ? <Loader2 size={18} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />
                : <Send size={18} style={{ color: 'var(--bg-page)' }} />}
            </button>
          </form>
          <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'center', gap: '1.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Terminal size={12} /> Proxmox Native</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Activity size={12} /> Cluster Aware</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Book size={12} /> Docs Integrated</span>
          </div>
        </div>
      </main>
    </div>
  );
}

function ToolResult({ toolName, result }: { toolName: string; result: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="tool-result" style={{ border: '1px solid var(--border)', borderRadius: '0.75rem', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'var(--bg-surface-alt)', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'left' }}
      >
        <span>Result: <span style={{ color: 'var(--accent-light)' }}>{toolName}</span></span>
        <span style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', fontSize: '0.65rem' }}>▾</span>
      </button>
      <div style={{ maxHeight: open ? '600px' : '0', overflow: 'hidden', transition: 'max-height 0.25s ease' }}>
        <div style={{ padding: '0.75rem' }}>
          <WidgetRenderer toolName={toolName} result={result as ToolResultEnvelope} />
        </div>
      </div>
    </div>
  );
}

function EventBlock({ event }: { event: AgentRunEvent }) {
  const e = event as Record<string, unknown>;
  switch (event.type) {
    case 'text':
    case 'assistant_message': {
      const text = (e.content as string) || ((e.message as Record<string, string>)?.text ?? '');
      return <div data-testid="assistant-message" style={{ fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--text)' }}><Markdown text={text} /></div>;
    }
    case 'tool_start':
      return (
        <div data-testid="tool-start" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <Loader2 size={12} className="animate-spin" />
          <span>Using <code style={{ color: 'var(--accent-light)' }}>{String(e.tool)}</code>…</span>
        </div>
      );
    case 'tool_result':
      return <ToolResult toolName={String(e.tool)} result={e.result} />;
    case 'error':
      return (
        <div data-testid="error-block" style={{ color: 'var(--error)', fontSize: '0.85rem', padding: '0.75rem', background: 'rgba(239,68,68,0.1)', borderRadius: '0.5rem' }}>
          Error: {String(e.message ?? e.error)}
        </div>
      );
    default: return null;
  }
}
