"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, CheckCircle2, XCircle, Activity, Database, Server, Cpu, Layers } from "lucide-react";

type HealthData = {
  status: "healthy" | "degraded";
  checks: Record<string, "ok" | "error">;
  details: {
    queue?: { waiting: number; active: number; failed: number };
  };
  uptime: number;
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(seconds % 60)}s`;
}

const SERVICE_META: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  database: { label: "PostgreSQL", icon: Database },
  redis: { label: "Redis", icon: Server },
  embedder: { label: "Embedder Service", icon: Cpu },
  queue: { label: "BullMQ Queue", icon: Layers },
};

export function HealthDashboard() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/health");
      const data = await res.json() as HealthData;
      setHealth(data);
      setLastChecked(new Date());
    } catch {
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
    const interval = setInterval(() => void fetchHealth(), 30_000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-xs">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-base font-semibold">System Health</h2>
            {lastChecked && (
              <p className="text-xs text-muted-foreground">
                Last checked {lastChecked.toLocaleTimeString()} · auto-refreshes every 30s
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {health && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                health.status === "healthy"
                  ? "bg-green-500/10 text-green-600 dark:text-green-400"
                  : "bg-red-500/10 text-red-600 dark:text-red-400"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${health.status === "healthy" ? "bg-green-500" : "bg-red-500"}`} />
              {health.status === "healthy" ? "All systems operational" : "Degraded"}
            </span>
          )}
          <button
            onClick={() => void fetchHealth()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Service Status Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {health &&
          Object.entries(health.checks).map(([key, status]) => {
            const meta = SERVICE_META[key] ?? { label: key, icon: Activity };
            const Icon = meta.icon;
            return (
              <div
                key={key}
                className={`flex items-center gap-4 rounded-xl border p-4 transition-colors ${
                  status === "ok"
                    ? "border-green-500/20 bg-green-500/5"
                    : "border-red-500/20 bg-red-500/5"
                }`}
              >
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                    status === "ok" ? "bg-green-500/10 text-green-600 dark:text-green-400" : "bg-red-500/10 text-red-500"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{meta.label}</p>
                  {key === "queue" && health.details?.queue && (
                    <p className="text-xs text-muted-foreground">
                      {health.details.queue.waiting} waiting · {health.details.queue.active} active · {health.details.queue.failed} failed
                    </p>
                  )}
                  {key !== "queue" && (
                    <p className={`text-xs ${status === "ok" ? "text-green-600 dark:text-green-400" : "text-red-500"}`}>
                      {status === "ok" ? "Connected" : "Unreachable"}
                    </p>
                  )}
                </div>
                {status === "ok" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
              </div>
            );
          })}

        {loading && !health &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[74px] animate-pulse rounded-xl border bg-muted/30" />
          ))}
      </div>

      {/* Process Info */}
      {health && (
        <div className="mt-4 flex items-center gap-4 rounded-xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium">App Uptime</span>
          <span>{formatUptime(health.uptime)}</span>
        </div>
      )}
    </section>
  );
}
