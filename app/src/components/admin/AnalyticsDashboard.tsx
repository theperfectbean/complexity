"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Users, MessageSquare, Brain, FileText, Layers, GitBranch, BarChart3 } from "lucide-react";

type AnalyticsData = {
  totals: {
    users: number;
    threads: number;
    messages: number;
    memories: number;
    documents: number;
    chunks: number;
  };
  modelBreakdown: { model: string; count: number }[];
  dailyActivity: { day: string; threads: number }[];
};

const STAT_META = [
  { key: "users", label: "Users", icon: Users, color: "text-blue-500" },
  { key: "threads", label: "Threads", icon: GitBranch, color: "text-violet-500" },
  { key: "messages", label: "Messages", icon: MessageSquare, color: "text-green-500" },
  { key: "memories", label: "Memories", icon: Brain, color: "text-amber-500" },
  { key: "documents", label: "Documents", icon: FileText, color: "text-rose-500" },
  { key: "chunks", label: "RAG Chunks", icon: Layers, color: "text-cyan-500" },
] as const;

function Sparkline({ data }: { data: { day: string; threads: number }[] }) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No activity in the last 30 days.</p>;

  const max = Math.max(...data.map(d => d.threads), 1);
  const width = 600;
  const height = 80;
  const padX = 4;
  const step = (width - padX * 2) / Math.max(data.length - 1, 1);

  const points = data.map((d, i) => {
    const x = padX + i * step;
    const y = height - 8 - ((d.threads / max) * (height - 16));
    return `${x},${y}`;
  });

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-20 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon
          points={`${padX},${height} ${points.join(" ")} ${padX + (data.length - 1) * step},${height}`}
          fill="url(#sparkGrad)"
          className="text-primary"
        />
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-primary"
        />
        {data.map((d, i) => (
          <circle
            key={i}
            cx={padX + i * step}
            cy={height - 8 - ((d.threads / max) * (height - 16))}
            r="3"
            fill="currentColor"
            className="text-primary"
          >
            <title>{`${d.day}: ${d.threads} thread${d.threads !== 1 ? "s" : ""}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0]?.day?.slice(5)}</span>
        <span>{data[data.length - 1]?.day?.slice(5)}</span>
      </div>
    </div>
  );
}

export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/analytics");
      if (res.ok) {
        setData(await res.json() as AnalyticsData);
        setLastUpdated(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between rounded-2xl border bg-card p-6 shadow-xs">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-base font-semibold">Usage Analytics</h2>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground">Updated {lastUpdated.toLocaleTimeString()}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => void fetchData()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Totals grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {STAT_META.map(({ key, label, icon: Icon, color }) => (
          <div key={key} className="rounded-2xl border bg-card p-5 shadow-xs">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums">
              {loading ? "—" : (data?.totals[key] ?? 0).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      {/* Daily activity sparkline */}
      <div className="rounded-2xl border bg-card p-6 shadow-xs">
        <h3 className="mb-4 text-sm font-semibold">Threads — Last 30 Days</h3>
        {loading ? (
          <div className="h-20 animate-pulse rounded-lg bg-muted/40" />
        ) : (
          <Sparkline data={(data?.dailyActivity ?? []) as { day: string; threads: number }[]} />
        )}
      </div>

      {/* Model usage breakdown */}
      <div className="rounded-2xl border bg-card p-6 shadow-xs">
        <h3 className="mb-4 text-sm font-semibold">Model Usage</h3>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-muted/40" />)}
          </div>
        ) : data?.modelBreakdown && data.modelBreakdown.length > 0 ? (
          <div className="space-y-2">
            {data.modelBreakdown.map(({ model, count }) => {
              const total = data.modelBreakdown.reduce((s, m) => s + m.count, 0);
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={model} className="flex items-center gap-3">
                  <span className="w-48 truncate text-xs text-muted-foreground" title={model}>{model}</span>
                  <div className="flex-1 rounded-full bg-muted/40 h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-xs font-medium tabular-nums">{count.toLocaleString()}</span>
                  <span className="w-8 text-right text-xs text-muted-foreground">{pct}%</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No thread data yet.</p>
        )}
      </div>
    </section>
  );
}
