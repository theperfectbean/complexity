import { useState } from 'react';
import { Terminal, Shield, Activity, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { MissionPlanner } from '@/components/agent/MissionPlanner';
import { ThoughtSidebar } from '@/components/agent/ThoughtSidebar';
import { type AgentStreamEvent } from '@/lib/agent/protocol';
import { cn } from '@/lib/utils';

export default function ConsolePage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<AgentStreamEvent[]>([]);
  const [runId, setRunId] = useState<string | null>(null);

  const startAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    setLoading(true);
    setEvents([]);
    setRunId(null);

    try {
      const response = await fetch('/api/agent/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          userMessage: query, messages: [{ role: "user", content: query }],
          modelId: "anthropic/claude-4-6-sonnet-latest",
          actorId: 'anonymous',
          system: 'You are the Complexity Cluster Agent. You have access to the Proxmox cluster tools.',
        }),
      });

      if (!response.ok) throw new Error('Failed to start agent run');
      
      const data = await response.json();
      setRunId(data.runId);
      setEvents(data.events || []);
      
      // If the agent didn't finish immediately (e.g. waiting for approval)
      // we might need to poll or handle subsequent events.
      // In this simple implementation, we just show what we got.
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (input: { runId: string; approved: boolean; comment?: string }) => {
    try {
      const response = await fetch('/api/agent/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          runId: input.runId,
          approved: input.approved,
          reviewerId: 'anonymous',
          comment: input.comment,
        }),
      });

      if (!response.ok) throw new Error('Failed to submit approval');
      
      const data = await response.json();
      // Append new events from the resumed run
      setEvents(prev => [...prev, ...(data.events || [])]);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="flex items-center justify-between border-b border-border/40 bg-card/30 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Terminal className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Mission Control</h1>
            <p className="text-xs text-muted-foreground">Cluster Operations Console</p>
          </div>
        </div>
        
        {runId && (
          <div className="flex items-center gap-2 rounded-full border border-border/40 bg-background/50 px-3 py-1">
            <Activity className="h-3 w-3 text-emerald-500" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Run: {runId.slice(0, 8)}</span>
          </div>
        )}
      </header>

      <main className="flex flex-1 overflow-hidden">
        {/* Left Side: Activity Stream & Interaction */}
        <div className="flex flex-1 flex-col overflow-hidden p-6">
          <div className="mb-6 flex-1 overflow-y-auto space-y-6">
            {events.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-4 rounded-full bg-muted/30 p-6">
                  <Shield className="h-12 w-12 text-muted-foreground/20" />
                </div>
                <h2 className="text-sm font-medium text-foreground">No Active Mission</h2>
                <p className="mt-1 text-xs text-muted-foreground">Enter a command to dispatch the agent.</p>
              </div>
            ) : (
              <>
                <MissionPlanner eventStream={events} onApprove={handleApprove} />
                
                {/* Tool Activity Widgets would go here */}
                <div className="space-y-4">
                   {events.filter(e => e.type === 'tool_result').map((event: any, i) => (
                     <div key={i} className="rounded-xl border border-border/40 bg-muted/20 p-4">
                        <div className="mb-2 flex items-center justify-between">
                           <div className="flex items-center gap-2">
                              <Activity className="h-3.5 w-3.5 text-primary" />
                              <span className="text-xs font-semibold uppercase tracking-tight">{event.tool.name}</span>
                           </div>
                           <span className={cn("text-[10px] font-medium", event.result.ok ? "text-emerald-500" : "text-destructive")}>
                              {event.result.ok ? 'SUCCESS' : 'FAILED'}
                           </span>
                        </div>
                        <p className="text-sm text-foreground">{event.result.summary}</p>
                        {event.result.data?.rawSnippet && (
                          <pre className="mt-3 max-h-48 overflow-y-auto rounded-lg bg-black/80 p-3 text-[11px] font-mono text-emerald-400">
                            {event.result.data.rawSnippet}
                          </pre>
                        )}
                     </div>
                   ))}
                </div>
              </>
            )}
          </div>

          <form onSubmit={startAgent} className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Dispatch mission (e.g. 'Check Plex status and restart if needed')"
              disabled={loading}
              className="w-full rounded-2xl border border-border/60 bg-card/50 py-4 pl-5 pr-14 text-sm shadow-sm backdrop-blur-sm transition-all focus:border-primary/40 focus:outline-none focus:ring-4 focus:ring-primary/5"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="absolute right-2 top-2 rounded-xl bg-primary p-2 text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </form>
        </div>

        {/* Right Side: Thought Stream */}
        <div className="w-96 border-l border-border/40 bg-muted/5 p-6 overflow-y-auto">
          <ThoughtSidebar events={events} />
        </div>
      </main>
    </div>
  );
}
