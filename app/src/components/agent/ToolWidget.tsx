"use client";

import { useEffect, useRef, type ComponentType } from "react";
import { Server, Terminal, Table, KeyRound, CheckCircle2, XCircle, type LucideProps } from "lucide-react";
import { type ToolResultEnvelope, type ResourceWidgetHint } from "@/lib/agent/protocol";
import { cn } from "@/lib/utils";

interface ToolWidgetProps {
  name: string;
  exec: {
    name: string;
    startEvent: {
      tool: {
        widgetHint?: ResourceWidgetHint;
        callId: string;
      }
    };
    stdout: string[];
    stderr: string[];
    resultEvent?: { result: ToolResultEnvelope };
  };
}

export function ToolWidget({ name, exec }: ToolWidgetProps) {
  const result = exec.resultEvent?.result;
  const widgetHintType = result?.widgetHint?.type || exec.startEvent?.tool?.widgetHint?.type || "command_result";

  const IconMap: Record<string, ComponentType<LucideProps>> = {
    host_list: Server,
    command_result: Terminal,
    table: Table,
    key_value: KeyRound,
    vm_list: Server,
    task_status: CheckCircle2,
  };
  const Icon = IconMap[widgetHintType] || Terminal;

  const isError = result ? !result.ok : false;
  const isExecuting = !result;

  return (
    <div className="rounded-2xl border border-border/40 bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300">
      {/* Header */}
      <div className={cn(
        "flex items-center justify-between px-6 py-4 border-b border-border/40 bg-muted/20",
        isError ? "border-destructive/20 bg-destructive/[0.03]" : ""
      )}>
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-10 w-10 rounded-xl flex items-center justify-center",
            isExecuting ? "bg-primary/5 text-primary/70" : isError ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
          )}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight font-mono uppercase">{name}</h3>
            <p className="text-xs text-muted-foreground/80 mt-0.5">
              {result ? result.summary : "Executing..."}
            </p>
          </div>
        </div>
        
        {isExecuting ? (
          <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        ) : result?.ok ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-500/50" />
        ) : (
          <XCircle className="h-5 w-5 text-destructive/50" />
        )}
      </div>

      {/* Body */}
      <div className="p-6">
        {widgetHintType === "host_list" && result && <HostList data={result.data as { hosts: Array<{ hostname: string; address: string; status: string }> }} />}
        {widgetHintType === "command_result" && <CommandResult exec={exec} />}
        {widgetHintType === "table" && result && <TableWidget data={result.data as { columns: string[]; rows: unknown[][] }} />}
        {widgetHintType === "key_value" && result && <KeyValueWidget data={result.data as Record<string, unknown>} />}
        {![ "host_list", "command_result", "table", "key_value" ].includes(widgetHintType) && result && (
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground/80 p-4 rounded-xl bg-muted/30">
            {JSON.stringify(result.data, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function HostList({ data }: { data: { hosts: Array<{ hostname: string; address: string; status: string }> } }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {data.hosts.map((host) => (
        <div key={host.address} className="p-4 rounded-xl border border-border/40 bg-background/40 flex items-center justify-between">
          <div className="space-y-1 min-w-0">
            <p className="text-sm font-bold text-foreground leading-tight truncate">{host.hostname}</p>
            <p className="text-[11px] font-mono text-muted-foreground/80">{host.address}</p>
          </div>
          <div className={cn(
            "h-2.5 w-2.5 rounded-full shadow-sm",
            host.status === "online" ? "bg-emerald-500 shadow-emerald-500/20" : "bg-muted-foreground/20"
          )} />
        </div>
      ))}
    </div>
  );
}

function CommandResult({ exec }: { exec: ToolWidgetProps["exec"] }) {
  const result = exec.resultEvent?.result;
  const data = result?.data as { table?: { columns: string[]; rows: unknown[][] }; rawSnippet?: string; exitCode: number } | undefined;
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [exec.stdout, exec.stderr]);

  if (data?.table) {
    return (
      <div className="space-y-4">
        <TableWidget data={data.table} />
        {data.rawSnippet && (
           <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-muted-foreground/60 p-4 rounded-xl bg-muted/20 border border-border/20">
            {data.rawSnippet}
          </pre>
        )}
      </div>
    );
  }

  const hasOutput = exec.stdout.length > 0 || exec.stderr.length > 0;

  return (
    <pre ref={preRef} className={cn(
      "whitespace-pre-wrap font-mono text-xs leading-relaxed p-6 rounded-xl border border-border/20 max-h-[400px] overflow-y-auto",
      result && data?.exitCode === 0 ? "bg-zinc-950 text-emerald-400" : 
      result ? "bg-destructive/5 text-destructive" : "bg-zinc-950 text-muted-foreground"
    )}>
      {exec.stdout.map((chunk: string, i: number) => <span key={`out-${i}`}>{chunk}</span>)}
      {exec.stderr.map((chunk: string, i: number) => <span key={`err-${i}`} className="text-red-400">{chunk}</span>)}
      {!hasOutput && !result && "Waiting for output..."}
      {!hasOutput && result && (data?.rawSnippet || "(No output)")}
    </pre>
  );
}

function TableWidget({ data }: { data: { columns: string[]; rows: unknown[][] } }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/40">
      <table className="w-full text-left text-sm border-collapse">
        <thead className="bg-muted/30">
          <tr>
            {data.columns.map((col, idx) => (
              <th key={idx} className="px-4 py-3 font-bold text-xs uppercase tracking-widest text-muted-foreground/60">{col}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {data.rows.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-muted/10 transition-colors">
              {row.map((cell, cellIdx) => (
                <td key={cellIdx} className="px-4 py-3 font-medium text-foreground/80">
                  {typeof cell === "object" ? JSON.stringify(cell) : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeyValueWidget({ data }: { data: Record<string, unknown> }) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="space-y-1.5">
          <dt className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50">{key}</dt>
          <dd className="text-sm font-medium text-foreground/90">
            {typeof value === "object" ? (
              <pre className="text-[11px] font-mono p-2 rounded bg-muted/20">{JSON.stringify(value, null, 2)}</pre>
            ) : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
