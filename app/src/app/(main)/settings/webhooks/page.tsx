"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { 
  Webhook, 
  Plus, 
  Trash2, 
  Shield, 
  Activity, 
  RefreshCw,
  Clock,
  AlertCircle,
  Power,
  PowerOff,
  Send
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn, copyToClipboard } from "@/lib/utils";

interface WebhookData {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

interface CreateWebhookResponse {
  webhook: WebhookData;
  signingSecret: string;
}

interface DeliveryData {
  id: string;
  eventType: string;
  status: number;
  durationMs: number;
  createdAt: string;
  response: string | null;
}

export default function WebhooksPage() {
  const { status } = useSession();
  const [webhooks, setWebhooks] = useState<WebhookData[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newSigningSecret, setNewSigningSecret] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; status?: number; durationMs?: number; error?: string } | null>(null);
  
  // Delivery history state
  const [selectedHookId, setSelectedHookId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryData[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);

  const fetchWebhooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/webhooks");
      if (res.ok) {
        const data = await res.json();
        setWebhooks(data.webhooks);
      }
    } catch {
      toast.error("Failed to load webhooks");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDeliveries = useCallback(async (id: string) => {
    setLoadingDeliveries(true);
    try {
      const res = await fetch(`/api/webhooks/${id}/deliveries`);
      if (res.ok) {
        const data = await res.json();
        setDeliveries(data.deliveries);
      }
    } catch {
      toast.error("Failed to load history");
    } finally {
      setLoadingDeliveries(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      void fetchWebhooks();
    }
  }, [status, fetchWebhooks]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;

    setIsCreating(true);
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: newUrl.trim(),
          events: ["thread.completed"], // Default for now
        }),
      });

      const data = await res.json() as Partial<CreateWebhookResponse> & { error?: string };
      if (!res.ok || !data.signingSecret) {
        throw new Error(data.error || "Failed to create webhook");
      }

      setNewSigningSecret(data.signingSecret);
      toast.success("Webhook created");
      setNewUrl("");
      void fetchWebhooks();
    } catch {
      toast.error("Failed to create webhook");
    } finally {
      setIsCreating(false);
    }
  };

  const handleToggle = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      if (!res.ok) throw new Error("Failed to toggle");
      toast.success(currentActive ? "Webhook disabled" : "Webhook enabled");
      void fetchWebhooks();
    } catch {
      toast.error("Failed to toggle webhook");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this webhook?")) return;

    try {
      const res = await fetch(`/api/webhooks/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete");

      toast.success("Webhook deleted");
      void fetchWebhooks();
      if (selectedHookId === id) setSelectedHookId(null);
    } catch {
      toast.error("Failed to delete webhook");
    }
  };

  const handleCopy = (id: string, text: string) => {
    copyToClipboard(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/webhooks/${id}/test`, { method: "POST" });
      const data = await res.json() as { success: boolean; status?: number; durationMs?: number; error?: string };
      setTestResult({ id, ...data });
      if (data.success) {
        toast.success(`Test ping delivered (${data.status} in ${data.durationMs}ms)`);
      } else {
        toast.error(`Test ping failed: ${data.error ?? data.status}`);
      }
    } catch {
      toast.error("Test ping failed");
    } finally {
      setTestingId(null);
    }
  };

  if (status === "loading" || loading) {
    return <main className="mx-auto max-w-4xl p-6">Loading...</main>;
  }

  return (
    <main className="mx-auto max-w-4xl p-6 pb-20">
      <div className="mb-8">
        <h1 className="font-[var(--font-accent)] text-3xl font-semibold">Webhooks</h1>
        <p className="mt-1 text-muted-foreground">Automate your research by pushing completed threads to external URLs.</p>
      </div>

      {newSigningSecret ? (
        <section className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Copy your signing secret now</p>
              <p className="mt-1 text-xs text-muted-foreground">
                For security, stored webhook secrets are no longer shown again after creation.
              </p>
            </div>
            <button
              onClick={() => handleCopy("new-webhook-secret", newSigningSecret)}
              className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-background"
            >
              {copiedId === "new-webhook-secret" ? "Copied" : "Copy Secret"}
            </button>
          </div>
          <div className="mt-3 rounded-lg border border-border/50 bg-background/70 p-3 font-mono text-[11px] break-all">
            {newSigningSecret}
          </div>
        </section>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[1fr_350px]">
        <div className="space-y-6">
          {/* Create Form */}
          <section className="rounded-2xl border bg-card p-6 shadow-xs">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-muted-foreground/60 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add New Webhook
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="webhook-url" className="text-sm font-medium">Payload URL</label>
                <div className="flex gap-2">
                  <input
                    id="webhook-url"
                    type="url"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://n8n.example.com/webhook/..."
                    className="flex-1 rounded-xl border bg-background/50 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    required
                  />
                  <button
                    type="submit"
                    disabled={isCreating || !newUrl}
                    className="rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all"
                  >
                    {isCreating ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Add"}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                <Shield className="h-3 w-3 mt-0.5" />
                By default, this webhook will receive <strong>thread.completed</strong> events.
              </p>
            </form>
          </section>

          {/* List */}
          <section className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/60">Active Webhooks</h2>
            {webhooks.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed p-12 text-center">
                <Webhook className="mx-auto h-8 w-8 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">No webhooks configured yet.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {webhooks.map((hook) => (
                  <div 
                    key={hook.id} 
                    className={cn(
                      "group rounded-2xl border p-5 transition-all",
                      selectedHookId === hook.id ? "bg-muted/30 border-primary/30" : "bg-card hover:border-border/80"
                    )}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5 text-primary">
                          <Webhook className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate max-w-[300px]">{hook.url}</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-0.5">
                            ID: {hook.id}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => void handleToggle(hook.id, hook.isActive)}
                          className={cn(
                            "rounded-lg p-2 transition-colors",
                            hook.isActive 
                              ? "hover:bg-amber-500/10 hover:text-amber-500 text-muted-foreground" 
                              : "hover:bg-emerald-500/10 hover:text-emerald-500 text-muted-foreground"
                          )}
                          title={hook.isActive ? "Disable Webhook" : "Enable Webhook"}
                        >
                          {hook.isActive ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => {
                            setSelectedHookId(hook.id);
                            void fetchDeliveries(hook.id);
                          }}
                          className="rounded-lg p-2 hover:bg-muted text-muted-foreground transition-colors"
                          title="View History"
                        >
                          <Activity className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => void handleTest(hook.id)}
                          disabled={testingId === hook.id}
                          className="rounded-lg p-2 hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors disabled:opacity-50"
                          title="Send test ping"
                        >
                          {testingId === hook.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => void handleDelete(hook.id)}
                          className="rounded-lg p-2 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {!hook.isActive && (
                      <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-600/90 dark:text-amber-500/90">
                        This webhook is currently disabled and will not receive events.
                      </div>
                    )}
                    {testResult?.id === hook.id && (
                      <div className={`mb-3 rounded-lg border p-2 text-xs ${testResult.success ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600" : "border-rose-500/20 bg-rose-500/10 text-rose-600"}`}>
                        {testResult.success
                          ? `✓ Test ping delivered — HTTP ${testResult.status} in ${testResult.durationMs}ms`
                          : `✗ Test ping failed: ${testResult.error ?? `HTTP ${testResult.status}`}`}
                      </div>
                    )}
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-[11px] text-muted-foreground">
                      Signing secrets are shown once at creation and are no longer retrievable from the server.
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Delivery History Panel */}
        <aside className="space-y-4">
          <div className="sticky top-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/60 mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Delivery History
            </h2>
            
            {!selectedHookId ? (
              <div className="rounded-2xl border-2 border-dashed p-8 text-center bg-muted/10">
                <p className="text-xs text-muted-foreground italic">Select a webhook to see recent delivery attempts.</p>
              </div>
            ) : (
              <div className="rounded-2xl border bg-card overflow-hidden shadow-xs">
                <div className="bg-muted/50 p-3 border-b flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase">Recent Attempts</span>
                  <button onClick={() => void fetchDeliveries(selectedHookId)} className="hover:text-primary transition-colors">
                    <RefreshCw className={cn("h-3 w-3", loadingDeliveries && "animate-spin")} />
                  </button>
                </div>
                
                <div className="divide-y divide-border/50 max-h-[500px] overflow-y-auto scrollbar-thin">
                  {loadingDeliveries && deliveries.length === 0 ? (
                    <div className="p-8 text-center"><RefreshCw className="mx-auto h-4 w-4 animate-spin text-muted-foreground" /></div>
                  ) : deliveries.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground italic">No deliveries recorded yet.</div>
                  ) : (
                    deliveries.map((delivery) => (
                      <div key={delivery.id} className="p-3 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <span className={cn(
                            "text-[10px] font-bold px-1.5 py-0.5 rounded",
                            delivery.status >= 200 && delivery.status < 300 
                              ? "bg-emerald-500/10 text-emerald-600" 
                              : "bg-rose-500/10 text-rose-600"
                          )}>
                            {delivery.status || "FAIL"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(delivery.createdAt), "HH:mm:ss")}
                          </span>
                        </div>
                        <p className="text-[11px] font-medium truncate mb-1">{delivery.eventType}</p>
                        <div className="flex items-center justify-between text-[9px] text-muted-foreground">
                          <span>{delivery.durationMs}ms</span>
                          {delivery.status >= 400 && (
                            <span className="text-rose-500 flex items-center gap-1">
                              <AlertCircle className="h-2.5 w-2.5" />
                              Error
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
