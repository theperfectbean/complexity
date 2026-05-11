import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, Activity } from 'lucide-react';
import { motion } from 'motion/react';
import { streamAgentRun, type AgentRunEvent } from '../lib/api';
import { uuid } from '../lib/uuid';
import { matchCommands, type SlashCommand } from '../lib/commands';
import { CommandMenu } from './CommandMenu';
import { Markdown } from './Markdown';
import { WidgetRenderer } from './WidgetRenderer';
import type { ToolResultEnvelope } from '../lib/protocol';
import { cn } from '../lib/utils';

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
  modelId?: string;
  threads?: Thread[];
  setThreads?: React.Dispatch<React.SetStateAction<Thread[]>>;
  activeId?: string;
  focusToken?: number;
  onModelSwitch?: (modelId: string) => void;
}

const STORAGE_KEY = 'fleet_console_threads_v1';

export function loadThreads(): Thread[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Thread[]) : [];
  } catch { return []; }
}

export function saveThreads(threads: Thread[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(threads)); } catch { /* ignore */ }
}

export function makeThread(): Thread {
  return { id: uuid(), title: 'New conversation', createdAt: new Date().toISOString(), turns: [] };
}

export function AgentChat({ 
  initialContext, 
  onContextUsed, 
  modelId = 'default',
  threads,
  setThreads,
  activeId,
  focusToken = 0,
  onModelSwitch,
}: Props) {
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{approvalId: string; threadId?: string} | null>(null);
  const [showCmdMenu, setShowCmdMenu] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [internalThreads, setInternalThreads] = useState<Thread[]>(() => {
    const saved = loadThreads();
    return saved.length > 0 ? saved : [makeThread()];
  });
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const effectiveThreads = threads ?? internalThreads;
  const effectiveSetThreads = setThreads ?? setInternalThreads;
  const effectiveActiveId = activeId ?? effectiveThreads[0]?.id ?? '';

  useEffect(() => {
    if (initialContext) { setInput(initialContext); onContextUsed?.(); }
  }, [initialContext, onContextUsed]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); });
  
  useEffect(() => { 
    if (effectiveThreads.length > 0) saveThreads(effectiveThreads); 
  }, [effectiveThreads]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) { el.style.height = 'auto'; el.style.height = (el.scrollHeight) + 'px'; }
  }, [input]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [focusToken, effectiveActiveId]);

  const updateThread = useCallback((threadId: string, updater: (t: Thread) => Thread) => {
    effectiveSetThreads(prev => prev.map(t => t.id === threadId ? updater(t) : t));
  }, [effectiveSetThreads]);

  const submitMessage = (userMessage: string, extraBodyOverride?: Record<string, unknown>) => {
    const thread = effectiveThreads.find(t => t.id === effectiveActiveId);
    if (thread === undefined || isRunning || userMessage.trim() === '') return;

    const isSlashInput = userMessage.trim().startsWith('/');
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

    const markTurnComplete = () => {
      setIsRunning(false);
      updateThread(thread.id, t => ({
        ...t, turns: t.turns.map(tr => tr.id === turnId ? { ...tr, isRunning: false } : tr),
      }));
    };

    streamAgentRun(
      userMessage,
      modelId,
      (event) => {
        updateThread(thread.id, t => ({
        ...t, turns: t.turns.map(tr => tr.id === turnId ? { ...tr, events: [...tr.events, event] } : tr),
        }));
        if (event.type === 'destructive_confirm') {
          const ev = event as Record<string, unknown>;
          setPendingApproval({ approvalId: String(ev.approvalId), threadId: ev.threadId as string | undefined });
        }
        if (event.type === 'model_switched') {
          const ev = event as Record<string, unknown>;
          if (typeof ev.to === 'string' && typeof ev.reason === 'string' && ev.reason.startsWith('User switched via /model')) {
            onModelSwitch?.(ev.to);
            if (isSlashInput) {
              markTurnComplete();
            }
          }
        }
        if (isSlashInput && event.type === 'tool_result') {
          const ev = event as Record<string, unknown>;
          if (ev.tool === 'help' || ev.tool === 'model_list' || ev.tool === 'run_status') {
            markTurnComplete();
          }
        }
      },
      markTurnComplete,
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

  const clearActiveThread = () => {
    updateThread(effectiveActiveId, t => ({ ...t, turns: [] }));
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

  const activeThread = effectiveThreads.find(t => t.id === effectiveActiveId);

  return (
    <div data-testid='agent-chat' className='flex h-full bg-background text-foreground font-inherit'>
      <main className='flex-1 flex flex-col max-w-[800px] mx-auto relative w-full'>
        <div data-testid='turn-list' className='flex-1 overflow-y-auto px-4 md:px-0 py-10 flex flex-col gap-0'>
          {activeThread?.turns.length === 0 && (
            <div className='flex-1 flex flex-col items-center justify-center text-center px-8 py-20 gap-4 min-h-[40vh]'>
              <div className='p-4 rounded-full bg-primary/10'>
                <Activity size={32} className='text-primary' />
              </div>
              <div>
                 <p className='m-0 mb-2 text-xl font-semibold tracking-tight'>Fleet Console</p>
                 <p className='m-0 text-sm text-muted-foreground max-w-[400px] leading-relaxed'>
                   Ask about your Proxmox cluster, services, and infrastructure operations.
                 </p>
              </div>
            </div>
          )}
          {activeThread?.turns.map((turn) => (
            <div key={turn.id} data-testid='conversation-turn' className='flex flex-col gap-0'>
              <div className='flex flex-col items-end py-4'>
                <div data-testid='user-message' className='max-w-[85%] md:max-w-[75%] px-5 py-3.5 bg-muted/60 text-foreground rounded-2xl font-medium leading-[1.6] shadow-2xs'>
                  {turn.userMessage}
                </div>
              </div>

              <div className='group relative flex flex-col gap-0 pt-4 pb-12'>
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
                    onCancelApproval={(approvalId, threadId) =>
                      submitMessage('CANCEL', {
                        approvalId,
                        threadId: threadId ?? activeThread?.id,
                      })
                    }
                  />
                ))}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className='px-4 md:px-0 pb-8 pt-4 sticky bottom-0 bg-gradient-to-t from-background via-background/90 to-transparent'>
          <form
            data-testid='message-form'
            onSubmit={(e) => { e.preventDefault(); submitMessage(input); setInput(''); }}
            className='relative flex items-end max-w-[800px] mx-auto'
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
              data-testid='message-input'
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder='Ask Cluster Console...'
              disabled={isRunning}
              rows={1}
              className='w-full pl-5 pr-14 py-4 bg-card border border-border shadow-sm rounded-2xl text-foreground text-[0.9375rem] font-medium outline-none resize-none overflow-hidden leading-[1.6] max-h-[200px] overflow-y-auto ring-1 ring-primary/20 focus:ring-primary/40 focus:border-primary/30 transition-all'
            />
            
            <button
              data-testid='send-btn'
              type='submit'
              disabled={input.trim() === '' || isRunning}
              className={cn(
                'absolute right-2.5 bottom-2.5 h-10 w-10 flex items-center justify-center rounded-xl transition-all',
                isRunning ? 'bg-transparent' : 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
                (input.trim() === '' && !isRunning) && 'opacity-30 pointer-events-none'
              )}
            >
              {isRunning
                ? <Loader2 size={18} className='animate-spin text-muted-foreground' />
                : <Send size={18} />}
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
    <div data-testid='tool-result' className='my-4 border border-border/60 rounded-2xl overflow-hidden bg-card/30 shadow-2xs'>
      <button
        onClick={() => setOpen(o => !o)}
        className='w-full flex items-center justify-between px-4 py-2.5 bg-muted/20 border-none cursor-pointer text-muted-foreground text-[0.75rem] font-semibold uppercase tracking-wider text-left hover:bg-muted/40 transition-colors'
      >
        <span>Tool Result: <span className='text-primary'>{toolName}</span></span>
        <span className={cn('transition-transform duration-200 opacity-60', open && 'rotate-180')}>▾</span>
      </button>
      <div className={cn('overflow-hidden transition-[max-height] duration-300 ease-in-out', open ? 'max-h-[800px]' : 'max-h-0')}>
        <div className='p-4'>
          <WidgetRenderer toolName={toolName} result={result as ToolResultEnvelope} />
        </div>
      </div>
    </div>
  );
}

function EventBlock({ event, onApprove, onCancelApproval }: {
  event: AgentRunEvent;
  onApprove?: (approvalId: string, threadId?: string) => void;
  onCancelApproval?: (approvalId: string, threadId?: string) => void;
}) {
  const e = event as Record<string, unknown>;
  const streamNoticeResult: ToolResultEnvelope = {
    ok: true,
    widgetHint: { type: 'key_value' },
    summary: '',
    data: {},
  };
  switch (event.type) {
    case 'text':
    case 'assistant_message': {
      const text = (e.content as string) || ((e.message as Record<string, string>)?.text ?? '');
      if (!text) return null;
      
      // If it looks like raw JSON, render it as a syntax-highlighted block
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
          return (
            <div data-testid='assistant-message-json' className='max-w-none break-words text-[0.8rem] font-mono opacity-60 px-4 py-2 bg-muted/10 rounded-xl border border-border/40 my-2'>
              <Markdown text={'```json\n' + text + '\n```'} />
            </div>
          );
      }
      
      return (
        <div data-testid='assistant-message' className='max-w-none break-words text-[0.9375rem] leading-[1.8] text-foreground'>
          <Markdown text={text} />
        </div>
      );
    }
    case 'tool_start':
      return (
        <motion.div 
          initial={{ opacity: 0, x: -5 }}
          animate={{ opacity: 1, x: 0 }}
          className='flex items-center gap-3 my-3 text-[13px] text-muted-foreground'
        >
          <div className='flex h-6 w-6 items-center justify-center rounded-full border border-primary/20 bg-primary/5 shadow-sm'>
            <div className='h-2 w-2 animate-pulse rounded-full bg-primary' />
          </div>
          <span className='font-medium'>Using {String(e.tool)}...</span>
        </motion.div>
      );
    case 'tool_result':
      return <ToolResult toolName={String(e.tool)} result={e.result} />;
    case 'model_switched':
      return (
        <div className='my-3'>
          <WidgetRenderer
            toolName='agent_event'
            result={streamNoticeResult}
            streamEvent={event as { type: 'model_switched'; from: string; to: string; reason: string }}
          />
        </div>
      );
    case 'context_summarized':
      return (
        <div className='my-3'>
          <WidgetRenderer
            toolName='agent_event'
            result={streamNoticeResult}
            streamEvent={event as { type: 'context_summarized'; originalTokens: number; summaryTokens: number }}
          />
        </div>
      );
    case 'error':
      return (
        <div data-testid='error-block' className='my-4 text-destructive text-sm px-4 py-3 bg-destructive/5 rounded-xl border border-destructive/20'>
          Error: {String(e.message ?? e.error)}
        </div>
      );
    case 'tool_error':
      return (
        <div data-testid='tool-error-block' className='my-4 text-destructive text-sm px-4 py-3 bg-destructive/5 rounded-xl border border-destructive/20'>
          ✗ Tool Error: {String(e.error ?? e.message)}
        </div>
      );
    case 'run_started':
    case 'run_status': {
      const status = e.status ? String(e.status) : undefined;
      if (!status || status === 'completed') return null;
      return (
        <div data-testid='run-meta' className='text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 mb-2'>
           {status}
        </div>
      );
    }
    case 'destructive_confirm': {
      const e_id = String(e.approvalId ?? '');
      const t_id = e.threadId as string | undefined;
      return (
        <div data-testid='destructive-confirm' className='my-4 p-5 border border-destructive/30 rounded-2xl bg-destructive/5 flex flex-col gap-4 shadow-2xs'>
          <p className='m-0 text-sm font-medium text-foreground leading-relaxed'>
            {String(e.message ?? 'This action requires explicit approval.')}
          </p>
          <div className='flex gap-2'>
            <button
              type='button'
              onClick={() => onApprove?.(e_id, t_id)}
              className='px-5 py-2 bg-destructive text-white border-none rounded-xl cursor-pointer text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity shadow-sm'
            >
               Approve
            </button>
            <button
              type='button'
              onClick={() => onCancelApproval?.(e_id, t_id)}
              className='px-5 py-2 bg-background text-muted-foreground border border-border rounded-xl cursor-pointer text-xs font-bold uppercase tracking-wider hover:bg-muted transition-colors'
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
