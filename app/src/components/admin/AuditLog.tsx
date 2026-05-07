"use client";

import { useState, useEffect, useCallback } from "react";
import { Terminal, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface AuditLogEntry {
  id: string;
  action: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: {
    email: string | null;
    name: string | null;
  } | null;
}

export function AuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/audit-logs?limit=${limit}&offset=${offset}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
      }
    } catch (err) {
      console.error("Failed to fetch audit logs", err);
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const formatAction = (action: string) => {
    return action.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">System Audit Trail</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0 || loading}
            className="rounded-lg border p-2 hover:bg-muted disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs font-medium">
            Page {Math.floor(offset / limit) + 1}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={logs.length < limit || loading}
            className="rounded-lg border p-2 hover:bg-muted disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Details</th>
              <th className="px-4 py-3 text-right">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {loading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={4} className="px-4 py-4 h-12 bg-muted/10" />
                </tr>
              ))
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground italic">
                  No audit logs found.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "p-1.5 rounded-lg",
                        log.action.includes("delete") ? "bg-rose-500/10 text-rose-600" :
                        log.action.includes("share") ? "bg-blue-500/10 text-blue-600" :
                        log.action.includes("login") ? "bg-emerald-500/10 text-emerald-600" :
                        "bg-primary/10 text-primary"
                      )}>
                        <Terminal className="h-3.5 w-3.5" />
                      </div>
                      <span className="font-semibold text-xs whitespace-nowrap">
                        {formatAction(log.action)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium truncate max-w-[120px]">
                        {log.user?.name || log.user?.email || "System"}
                      </span>
                      {log.ipAddress && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {log.ipAddress}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {log.targetId && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded w-fit font-mono">
                          ID: {log.targetId}
                        </span>
                      )}
                      {log.metadata && (
                        <div className="text-[10px] text-muted-foreground break-all max-w-xs">
                          {Object.entries(log.metadata).map(([k, v]) => (
                            <span key={k} className="mr-2">
                              <span className="font-bold">{k}:</span> {JSON.stringify(v)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end">
                      <span className="text-xs font-medium">
                        {format(new Date(log.createdAt), "MMM d, HH:mm")}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {format(new Date(log.createdAt), "yyyy")}
                      </span>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-700 dark:text-amber-400">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <p>
          Audit logs provide a security trail of administrative actions. 
          To preserve system performance, logs older than 90 days may be automatically rotated or archived in future updates.
        </p>
      </div>
    </div>
  );
}
