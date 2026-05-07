"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { ShieldCheck, Loader2, AlertCircle, XCircle, Search, Settings as SettingsIcon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { MissionInput } from "./MissionInput";
import { MissionPlanPanel } from "./MissionPlanPanel";
import { EventFeed } from "./EventFeed";
import { CommandPalette } from "../console/CommandPalette";
import { SettingsPanel } from "../console/SettingsPanel";
import { DocsPanel } from "../console/DocsPanel";
import { HelpDialog } from "../console/HelpDialog";
import { getDefaultModel, getLocalDefaultModel } from "@/lib/models";
import { 
  type AgentStreamEvent, 
  type MissionPlannerViewState,
  reduceMissionPlannerState,
  isAgentStreamEvent
} from "@/lib/agent/protocol";
import { CLUSTER_SYSTEM_PROMPT } from "@/lib/agent/cluster-context";

const INITIAL_PLANNER_STATE: MissionPlannerViewState = {
  approvalPending: false,
  status: "idle",
};

export function ConsoleShell() {
  const { data: session } = useSession();
  const [model, setModel] = useState(getLocalDefaultModel());
  const [inputValue, setInputValue] = useState("");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<AgentStreamEvent[]>([]);
  const [plannerState, setPlannerState] = useState<MissionPlannerViewState>(INITIAL_PLANNER_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const [questionPending, setQuestionPending] = useState<string | null>(null);
  const [envState, setEnvState] = useState<{ node?: string; cwd?: string; user?: string }>({});

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.defaultModel) setModel(data.defaultModel);
      })
      .catch(err => console.error('Failed to load initial settings', err));
  }, []);

  const startStream = useCallback((runId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/agent/runs/stream?runId=${runId}`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (isAgentStreamEvent(event)) {
          setEvents((prev) => [...prev, event]);
          setPlannerState((prev) => reduceMissionPlannerState(prev, event));
          if (event.type === "agent_question") {
            setQuestionPending(event.question);
          } else if (event.type === "run_status" && event.status === "running") {
            setQuestionPending(null);
          } else if (event.type === "environment_update") {
            setEnvState((prev) => ({ ...prev, ...event.environment }));
          }
          if (event.type === "run_status" && (event.status === "completed" || event.status === "cancelled")) {
            es.close();
            eventSourceRef.current = null;
          }
        }
      } catch (err) {
        console.error("Failed to parse event", err);
      }
    };

    es.onerror = (e) => {
      console.error("SSE Error", e);
    };

    return () => es.close();
  }, []);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleSlashCommand = (cmd: string) => {
    const command = cmd.slice(1).split(' ')[0].toLowerCase();
    switch (command) {
      case 'clear':
        setEvents([]);
        setActiveRunId(null);
        setPlannerState(INITIAL_PLANNER_STATE);
        setEnvState({});
        break;
      case 'docs':
        setDocsOpen(true);
        break;
      case 'settings':
        setSettingsOpen(true);
        break;
      case 'help':
        setHelpOpen(true);
        break;
      default:
        setError(`Unknown command: /${command}`);
        break;
    }
  };

  const handleSubmit = async (userMessage: string) => {
    if (!session?.user?.id) return;
    
    setIsSubmitting(true);
    setError(null);
    setInputValue("");

    try {
      if (activeRunId) {
        const res = await fetch("/api/agent/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reply",
            runId: activeRunId,
            answer: userMessage,
            actorId: session.user.id,
            modelId: model,
          }),
        });

        if (!res.ok) {
          const text = await res.text(); let data; try { data = JSON.parse(text); } catch (e) { throw new Error(`Invalid JSON response: ${text.slice(0, 100)}`); }
          throw new Error(data.message || "Failed to reply");
        }
        
        setQuestionPending(null);
      } else {
        setEvents([]);
        setPlannerState(INITIAL_PLANNER_STATE);
        
        const res = await fetch("/api/agent/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "start",
            actorId: session.user.id,
            modelId: model,
            system: CLUSTER_SYSTEM_PROMPT,
            userMessage,
          }),
        });

        if (!res.ok) {
          const text = await res.text(); let data; try { data = JSON.parse(text); } catch (e) { throw new Error(`Invalid JSON response: ${text.slice(0, 100)}`); }
          throw new Error(data.message || "Failed to start mission");
        }

        const text = await res.text(); let data; try { data = JSON.parse(text); } catch (e) { throw new Error(`Invalid JSON response: ${text.slice(0, 100)}`); }
        setActiveRunId(data.runId);
        startStream(data.runId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unknown error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (approved: boolean) => {
    if (!activeRunId || !session?.user?.id) return;

    try {
      const res = await fetch("/api/agent/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "approve",
          runId: activeRunId,
          approved,
          reviewerId: session.user.id,
        }),
      });

      if (!res.ok) {
        const text = await res.text(); let data; try { data = JSON.parse(text); } catch (e) { throw new Error(`Invalid JSON response: ${text.slice(0, 100)}`); }
        throw new Error(data.message || "Failed to submit approval");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
    }
  };

  const isRunning = !questionPending && (plannerState.status === "running" || (plannerState.status === "waiting_for_approval" && !plannerState.approvalPending));

  const handleHalt = async () => {
    if (!activeRunId) return;
    try {
      await fetch("/api/agent/runs/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: activeRunId }),
      });
    } catch (err) {
      console.error("Failed to halt run", err);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "c" && isRunning) {
        e.preventDefault();
        handleHalt();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeRunId, isRunning]);

  return (
    <div className="flex flex-col h-[calc(100dvh-0px)] bg-background text-foreground overflow-hidden">
      <CommandPalette 
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onAction={(action) => {
          if (action === "settings") setSettingsOpen(true);
          if (action === "clear") handleSlashCommand("/clear");
          if (action === "docs") setDocsOpen(true);
        }}
      />

      <SettingsPanel 
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      <DocsPanel 
        isOpen={docsOpen}
        onClose={() => setDocsOpen(false)}
      />

      <HelpDialog 
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
      />

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/40 bg-card/30 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Cluster Console</h1>
            <p className="text-xs text-muted-foreground font-medium">
              {plannerState.status === "idle" && "Ready for mission"}
              {plannerState.status === "running" && "Mission in progress..."}
              {plannerState.status === "waiting_for_approval" && !questionPending && "Awaiting approval"}
              {questionPending && "Awaiting your answer"}
              {plannerState.status === "completed" && "Mission completed"}
              {plannerState.status === "cancelled" && "Mission cancelled"}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setCommandPaletteOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/20 hover:bg-muted/40 border border-border/40 transition-colors text-xs font-medium text-muted-foreground"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Search...</span>
            <kbd className="ml-2 hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
              <span className="text-xs">⌘</span>K
            </kbd>
          </button>

          <button 
            onClick={() => setSettingsOpen(true)}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <SettingsIcon className="h-5 w-5 text-muted-foreground" />
          </button>

          {isRunning && (
            <>
              <button onClick={handleHalt} className="px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-bold uppercase tracking-wider hover:bg-destructive/20 transition-colors border border-destructive/20 flex items-center gap-2">
                <XCircle className="h-3.5 w-3.5" />
                Halt Execution
              </button>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/5 border border-primary/10">
                <Loader2 className="h-3 w-3 text-primary animate-spin" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary">Live</span>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <EventFeed 
            events={events} 
            onActionClick={(text) => setInputValue(text)}
          />
        </div>
      </main>

      {/* Input / UI Overlays */}
      <div className="border-t border-border/40 bg-background/80 backdrop-blur-xl px-6 py-4">
        <div className="max-w-4xl mx-auto relative">
          <AnimatePresence>
            {plannerState.approvalPending && plannerState.currentPlan && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                className="mb-6"
              >
                <MissionPlanPanel 
                  plan={plannerState.currentPlan} 
                  onApprove={() => handleApprove(true)} 
                  onReject={() => handleApprove(false)} 
                />
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-4 p-4 rounded-xl bg-destructive/5 border border-destructive/20 flex items-start gap-3 text-destructive"
              >
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <MissionInput 
            value={inputValue}
            onValueChange={setInputValue}
            model={model}
            onModelChange={setModel}
            onSubmit={handleSubmit}
            onSlashCommand={handleSlashCommand}
            disabled={isSubmitting || isRunning}
            placeholder={questionPending ? `Replying to: "${questionPending}"` : "Describe a cluster sysadmin task..."}
            envPrefix={
              envState.node || envState.cwd || envState.user 
                ? `${envState.user || "root"}@${envState.node || "cluster"}:${envState.cwd || "~"}# ` 
                : undefined
            }
          />
        </div>
      </div>
    </div>
  );
}
