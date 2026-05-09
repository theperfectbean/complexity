import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Plus, Terminal, Activity, Book } from 'lucide-react';
import { streamAgentRun, type AgentRunEvent } from '../lib/api';
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
  return {
    id: uuid(),
    title: 'New conversation',
    createdAt: new Date().toISOString(),
    turns: [],
  };
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

  useEffect(() => {
    if (!activeId && threads.length > 0) setActiveId(threads[0].id);
  }, [activeId, threads]);

  useEffect(() => {
    if (initialContext) {
      setInput(initialContext);
      onContextUsed?.();
    }
  }, [initialContext, onContextUsed]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); });
  useEffect(() => { saveThreads(threads); }, [threads]);

  const updateThread = useCallback((threadId: string, updater: (t: Thread) => Thread) => {
    setThreads(prev => prev.map(t => t.id === threadId ? updater(t) : t));
  }, []);

  const submitMessage = (userMessage: string) => {
    const thread = threads.find(t => t.id === activeId);
    if (!thread || isRunning) return;

    const turnId = uuid();
    const ab = new AbortController();
    abortRef.current = ab;
    setIsRunning(true);

    updateThread(thread.id, t => ({
      ...t,
      turns: [...t.turns, { id: turnId, userMessage, events: [], isRunning: true }],
    }));

    streamAgentRun(
      userMessage,
      'default',
      (event) => {
        updateThread(thread.id, t => ({
          ...t,
          turns: t.turns.map(tr => tr.id === turnId ? { ...tr, events: [...tr.events, event] } : tr),
        }));
      },
      () => {
        setIsRunning(false);
        updateThread(thread.id, t => ({
          ...t,
          turns: t.turns.map(tr => tr.id === turnId ? { ...tr, isRunning: false } : tr),
        }));
      },
      (err) => {
        setIsRunning(false);
        const errEvent: AgentRunEvent = { type: 'error', message: err };
        updateThread(thread.id, t => ({
          ...t,
          turns: t.turns.map(tr => tr.id === turnId ? { ...tr, isRunning: false, events: [...tr.events, errEvent] } : tr),
        }));
      },
      ab.signal
    );
  };

  const handleNewThread = () => {
    const t = makeThread();
    setThreads(prev => [t, ...prev]);
    setActiveId(t.id);
  };

  const activeThread = threads.find(t => t.id === activeId);

  return (
    <div style={{ display: 'flex', height: '100%', background: '#09090b', color: '#fafafa', fontFamily: 'Inter, sans-serif' }}>
      <aside style={{ width: '260px', borderRight: '1px solid #18181b', display: 'flex', flexDirection: 'column', padding: '1.25rem' }}>
        <button 
          onClick={handleNewThread}
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: '#27272a', border: 'none', borderRadius: '0.75rem', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, marginBottom: '2rem' }}
        >
          <Plus size={16} /> New Chat
        </button>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {threads.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              style={{ padding: '0.6rem 0.75rem', background: activeId === t.id ? '#18181b' : 'transparent', border: 'none', borderRadius: '0.5rem', color: activeId === t.id ? '#fff' : '#a1a1aa', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {t.turns[0]?.userMessage || t.title}
            </button>
          ))}
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '900px', margin: '0 auto', position: 'relative' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          {activeThread?.turns.map(turn => (
            <div key={turn.id} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ maxWidth: '80%', padding: '0.8rem 1.25rem', background: '#27272a', borderRadius: '1.25rem', borderBottomRightRadius: '0.25rem', fontSize: '0.93rem', lineHeight: 1.5 }}>
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

        <div style={{ padding: '1.5rem', background: 'linear-gradient(to top, #09090b 80%, transparent)' }}>
          <form 
            onSubmit={(e) => { e.preventDefault(); submitMessage(input); setInput(''); }}
            style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
          >
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Message Proxmox Agent..."
              disabled={isRunning}
              style={{ width: '100%', padding: '1rem 3.5rem 1rem 1.25rem', background: '#18181b', border: '1px solid #27272a', borderRadius: '1rem', color: '#fff', fontSize: '0.95rem', outline: 'none' }}
            />
            <button
              type="submit"
              disabled={!input.trim() || isRunning}
              style={{ position: 'absolute', right: '0.75rem', background: isRunning ? 'transparent' : '#fff', border: 'none', borderRadius: '0.5rem', padding: '0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', opacity: input.trim() ? 1 : 0.3 }}
            >
              {isRunning ? <Loader2 size={18} className="animate-spin" color="#71717a" /> : <Send size={18} color="#000" />}
            </button>
          </form>
          <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'center', gap: '1.5rem', fontSize: '0.7rem', color: '#52525b' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Terminal size={12} /> Proxmox Native</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Activity size={12} /> Cluster Aware</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Book size={12} /> Docs Integrated</span>
          </div>
        </div>
      </main>
    </div>
  );
}

function EventBlock({ event }: { event: AgentRunEvent }) {
  const e = event as Record<string, any>;
  switch (event.type) {
    case 'text':
    case 'assistant_message': {
      const text = (e.content as string) || (e.message as any)?.text || '';
      return <div style={{ fontSize: '0.95rem', lineHeight: 1.6, color: '#e4e4e7' }}><Markdown text={text} /></div>;
    }
    case 'tool_start': {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#71717a' }}>
          <Loader2 size={12} className="animate-spin" />
          <span>Using <code style={{ color: '#a78bfa' }}>{String(e.tool)}</code>...</span>
        </div>
      );
    }
    case 'tool_result': {
      const toolName = String(e.tool);
      return (
        <details style={{ border: '1px solid #18181b', borderRadius: '0.75rem', overflow: 'hidden' }}>
          <summary style={{ padding: '0.5rem 0.75rem', background: '#18181b', fontSize: '0.75rem', cursor: 'pointer', color: '#a1a1aa' }}>
            Result: {toolName}
          </summary>
          <div style={{ padding: '0.75rem' }}>
            <WidgetRenderer toolName={toolName} result={e.result as any} />
          </div>
        </details>
      );
    }
    case 'error':
      return <div style={{ color: '#f43f5e', fontSize: '0.85rem', padding: '0.75rem', background: '#450a0a', borderRadius: '0.5rem' }}>Error: {String(e.message || e.error)}</div>;
    default: return null;
  }
}
