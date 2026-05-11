import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from '../components/Sidebar';
import { AgentChat, loadThreads, makeThread } from '../components/AgentChat';
import { ModelSelector } from '../components/ModelSelector';

interface ThreadItem {
  id: string;
  title: string;
  createdAt: string;
}

function isThreadEmpty(thread: any): boolean {
  return !Array.isArray(thread?.turns) || thread.turns.length === 0;
}

function keepSingleEmptyThread(threads: any[], keepId: string): any[] {
  let keptEmpty = false;
  const next: any[] = [];
  for (const thread of threads) {
    if (!isThreadEmpty(thread)) {
      next.push(thread);
      continue;
    }

    if (thread.id === keepId && !keptEmpty) {
      next.push(thread);
      keptEmpty = true;
      continue;
    }

    if (!keptEmpty) {
      next.push(thread);
      keptEmpty = true;
    }
  }
  return next;
}

export default function MainPage() {
  const [modelId, setModelId] = useState('perplexity/sonar');
  const [focusToken, setFocusToken] = useState(0);
  
  // Lift thread state to MainPage for Sidebar sync
  const [threads, setThreads] = useState<any[]>(() => {
    const ts = loadThreads();
    return ts.length > 0 ? ts : [makeThread()];
  });
  const [activeId, setActiveId] = useState<string>(() => {
    return threads[0]?.id ?? '';
  });

  const sidebarThreads: ThreadItem[] = threads.map(t => ({
    id: t.id,
    title: t.turns[0]?.userMessage.slice(0, 40) || t.title,
    createdAt: t.createdAt,
  }));

  const handleNewChat = () => {
    const activeThread = threads.find(t => t.id === activeId);

    if (activeThread && isThreadEmpty(activeThread)) {
      setThreads(prev => keepSingleEmptyThread(prev, activeThread.id));
      setFocusToken(v => v + 1);
      return;
    }

    const existingEmpty = threads.find(isThreadEmpty);
    if (existingEmpty) {
      setThreads(prev => keepSingleEmptyThread(prev, existingEmpty.id));
      setActiveId(existingEmpty.id);
      setFocusToken(v => v + 1);
      return;
    }

    const t = makeThread();
    setThreads(prev => [t, ...prev]);
    setActiveId(t.id);
    setFocusToken(v => v + 1);
  };

  const handleDeleteThread = (id: string) => {
    setThreads(prev => {
      const next = prev.filter(t => t.id !== id);
      if (id === activeId) {
        if (next.length > 0) {
          setActiveId(next[0].id);
          return next;
        }
        const t = makeThread();
        setActiveId(t.id);
        return [t];
      }
      return next.length > 0 ? next : [makeThread()];
    });
  };

  return (
    <div className='relative flex min-h-[100dvh] bg-background text-foreground'>
      <div className='sticky top-0 z-50 hidden h-[100dvh] w-[278px] shrink-0 border-r border-sidebar-border bg-sidebar md:block'>
        <Sidebar 
          threads={sidebarThreads} 
          activeId={activeId}
          onSelect={setActiveId}
          onNew={handleNewChat}
          onDelete={handleDeleteThread}
          collapsed={false}
        />
      </div>

      <div className='flex min-w-0 flex-1 flex-col overflow-x-hidden'>
        <header className='sticky top-0 z-40 border-b bg-background/80 px-4 py-3 backdrop-blur md:hidden'>
          <div className='flex items-center justify-between gap-3'>
            <button
              type='button'
              className='inline-flex items-center justify-center rounded-full border bg-card p-2 text-foreground shadow-2xs'
            >
              <Menu className='h-4 w-4' />
            </button>
            <p className='font-semibold tracking-tight'>Cluster Console</p>
            <a href='#/health' className='text-[0.75rem] text-muted-foreground hover:text-primary transition-colors'>Health</a>
          </div>
          <div className='mt-2 flex justify-center'>
            <ModelSelector value={modelId} onChange={setModelId} />
          </div>
        </header>

        <header className='hidden md:flex sticky top-0 z-40 items-center justify-between bg-background/80 px-6 py-3 backdrop-blur border-b border-border/40'>
          <div className='flex items-center gap-4'>
             <ModelSelector value={modelId} onChange={setModelId} />
          </div>
          <div className='flex items-center gap-4'>
            <a href='#/health' className='text-[0.85rem] text-muted-foreground hover:text-primary transition-colors'>System Health</a>
          </div>
        </header>

        <div className='min-w-0 flex-1 bg-background'>
          <AgentChat
            modelId={modelId}
            threads={threads}
            setThreads={setThreads}
            activeId={activeId}
            focusToken={focusToken}
            onModelSwitch={setModelId}
          />
        </div>
      </div>
    </div>
  );
}
