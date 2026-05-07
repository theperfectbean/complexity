"use client";

import { useRef, useEffect, useMemo } from "react";
import { Loader2, CheckCircle2, XCircle, Bot } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import ReactMarkdown from "react-markdown";

import { ReasoningPanel } from "./ReasoningPanel";
import { ToolWidget } from "./ToolWidget";
import { WelcomeDashboard } from "../console/WelcomeDashboard";
import { type AgentStreamEvent, reduceReasoningEvents } from "@/lib/agent/protocol";

interface EventFeedProps {
  events: AgentStreamEvent[];
  onActionClick: (text: string) => void;
}

export function EventFeed({ events, onActionClick }: EventFeedProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (events.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [events.length]);

  const reasoningItems = useMemo(() => reduceReasoningEvents(events), [events]);
  
  const toolExecutions = useMemo(() => {
    const map = new Map<string, {
      name: string;
      startEvent: Extract<AgentStreamEvent, { type: "tool_executing" }>;
      stdout: string[];
      stderr: string[];
      resultEvent?: Extract<AgentStreamEvent, { type: "tool_result" }>;
    }>();

    for (const e of events) {
      if (e.type === "tool_executing") {
        map.set(e.tool.callId, { name: e.tool.name, startEvent: e, stdout: [], stderr: [] });
      } else if (e.type === "tool_stdout" && map.has(e.toolCallId)) {
        map.get(e.toolCallId)!.stdout.push(e.chunk);
      } else if (e.type === "tool_stderr" && map.has(e.toolCallId)) {
        map.get(e.toolCallId)!.stderr.push(e.chunk);
      } else if (e.type === "tool_result" && map.has(e.tool.callId)) {
        map.get(e.tool.callId)!.resultEvent = e;
      }
    }
    return Array.from(map.values());
  }, [events]);

  const assistantMessages = useMemo(() => {
    const messages = new Map<string, string>();
    for (const e of events) {
      if (e.type === "assistant_message") {
        const current = messages.get(e.message.id) || "";
        messages.set(e.message.id, current + e.message.text);
      }
    }
    return Array.from(messages.values());
  }, [events]);

  const lastStatus = useMemo(() => {
    const statusEvents = events.filter(e => e.type === "run_status");
    return statusEvents.length > 0 
      ? (statusEvents[statusEvents.length - 1] as Extract<AgentStreamEvent, { type: "run_status" }>).status 
      : null;
  }, [events]);

  const errors = useMemo(() => 
    events.filter(e => e.type === "error"), 
    [events]
  ) as Extract<AgentStreamEvent, { type: "error" }>[];

  if (events.length === 0) {
    return <WelcomeDashboard onActionClick={onActionClick} />;
  }

  return (
    <div className="space-y-8 pb-10">
      {/* Reasoning Section */}
      {reasoningItems.length > 0 && (
        <ReasoningPanel items={reasoningItems} />
      )}

      {/* Assistant Messages Section */}
      {assistantMessages.map((text, idx) => (
        <motion.div 
          key={idx}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-4 items-start"
        >
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 text-sm leading-relaxed prose prose-invert prose-p:leading-relaxed prose-pre:bg-muted/40 prose-pre:border prose-pre:border-border/40 max-w-none">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        </motion.div>
      ))}

      {/* Tools Section */}
      <AnimatePresence mode="popLayout">
        {toolExecutions.map((exec) => (
          <motion.div
            key={exec.startEvent.tool.callId}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            layout
          >
            <ToolWidget 
              name={exec.name} 
              exec={exec} 
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Errors */}
      {errors.map((event, idx) => (
        <div key={idx} className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 flex items-start gap-3 text-destructive">
          <XCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-[13px] font-bold uppercase tracking-widest">Error: {event.error.code}</p>
            <p className="text-sm font-medium">{event.error.message}</p>
          </div>
        </div>
      ))}

      {/* Final Status Indicator */}
      {lastStatus && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-muted/20 border border-border/40 w-fit">
          {lastStatus === "running" || lastStatus === "waiting_for_approval" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-primary">{lastStatus === "running" ? "Executing..." : "Awaiting Approval"}</span>
            </>
          ) : lastStatus === "completed" ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-500">Mission Accomplished</span>
            </>
          ) : (
            <>
              <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Mission Aborted</span>
            </>
          )}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

