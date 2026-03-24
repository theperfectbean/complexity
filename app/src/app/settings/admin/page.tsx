"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { Check, Info, ShieldCheck, Zap, RefreshCw, Plus, Trash2, GripVertical, Settings2, Users, Activity, BarChart3, ScrollText } from "lucide-react";
import { Reorder } from "motion/react";
import { MODELS } from "@/lib/models";
import { UserManagement } from "@/components/admin/UserManagement";
import { HealthDashboard } from "@/components/admin/HealthDashboard";
import { AnalyticsDashboard } from "@/components/admin/AnalyticsDashboard";
import { AuditLog } from "@/components/admin/AuditLog";

type SettingInfo = {
  value: string | null;
  source: "db" | "env" | "none";
};

type ProviderConfig = {
  id: string;
  name: string;
  keyName: string;
  toggleName?: string;
  placeholder: string;
  description: string;
};

type ModelOption = {
  id: string;
  label: string;
  category: string;
  isPreset: boolean;
};

type DiscoveredModel = {
  id: string;
  name: string;
  provider: string;
  normalizedId: string;
};

type ModelHealthEntry = {
  status: "healthy" | "unavailable" | "disabled" | "unknown";
  reason: string | null;
  checkedAt: string;
  targetId: string;
};

const PROVIDERS: ProviderConfig[] = [
  {
    id: "perplexity",
    name: "Perplexity",
    keyName: "PERPLEXITY_API_KEY",
    toggleName: "PROVIDER_PERPLEXITY_ENABLED",
    placeholder: "pplx-...",
    description: "Core provider for Search. Supports Sonar and Agentic third-party models.",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    keyName: "ANTHROPIC_API_KEY",
    toggleName: "PROVIDER_ANTHROPIC_ENABLED",
    placeholder: "sk-ant-...",
    description: "Enables Claude models (e.g., Sonnet, Opus, Haiku).",
  },
  {
    id: "openai",
    name: "OpenAI",
    keyName: "OPENAI_API_KEY",
    toggleName: "PROVIDER_OPENAI_ENABLED",
    placeholder: "sk-...",
    description: "Enables GPT models (e.g., GPT-4o).",
  },
  {
    id: "google",
    name: "Google Gemini",
    keyName: "GOOGLE_GENERATIVE_AI_API_KEY",
    toggleName: "PROVIDER_GOOGLE_ENABLED",
    placeholder: "AIza...",
    description: "Enables Gemini models (e.g., Pro, Flash).",
  },
  {
    id: "xai",
    name: "xAI",
    keyName: "XAI_API_KEY",
    toggleName: "PROVIDER_XAI_ENABLED",
    placeholder: "xai-...",
    description: "Enables Grok models.",
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    keyName: "OLLAMA_BASE_URL",
    toggleName: "PROVIDER_OLLAMA_ENABLED",
    placeholder: "http://localhost:11434/api",
    description: "Enables locally running models via Ollama.",
  },
  {
    id: "local-openai",
    name: "Local OpenAI API",
    keyName: "LOCAL_OPENAI_BASE_URL",
    toggleName: "PROVIDER_LOCAL_OPENAI_ENABLED",
    placeholder: "http://localhost:1234/v1",
    description: "Enables custom OpenAI-compatible endpoints (e.g., LM Studio, vLLM).",
  },
];

const INTEGRATIONS = [
  {
    id: "google-drive",
    name: "Google Drive (RAG)",
    description: "Allow users to import documents from Google Drive. Requires a Google Cloud Project.",
    fields: [
      { key: "GOOGLE_CLIENT_ID", label: "Client ID", placeholder: "your-client-id.apps.googleusercontent.com" },
      { key: "GOOGLE_CLIENT_SECRET", label: "Client Secret", placeholder: "GOCSPX-...", type: "password" },
      { key: "GOOGLE_API_KEY", label: "API Key (Picker)", placeholder: "AIza...", type: "password" },
    ]
  },
  {
    id: "github",
    name: "GitHub Auth",
    description: "Enable signing in with GitHub.",
    fields: [
      { key: "GITHUB_CLIENT_ID", label: "Client ID", placeholder: "ov2-..." },
      { key: "GITHUB_CLIENT_SECRET", label: "Client Secret", placeholder: "github_pat_...", type: "password" },
    ]
  }
];

export default function AdminSettingsPage() {
  const { data: session, status } = useSession();
  const [details, setDetails] = useState<Record<string, SettingInfo>>({});
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<"providers" | "models" | "users" | "health" | "analytics" | "audit-logs">("providers");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Model Management State
  const [activeModels, setActiveModels] = useState<ModelOption[]>([]);
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [modelHealth, setModelHealth] = useState<Record<string, ModelHealthEntry>>({});
  const [fetchingModels, setFetchingModels] = useState(false);
  const [hasFetchedModelData, setHasFetchedModelData] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    loadSettings();
  }, [status, session]);

  async function loadSettings() {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error();
      const data = await res.json();
      
      if (data.details) {
        setDetails(data.details);
        const initialForm: Record<string, string> = {};
        
        // Load all database-sourced settings into form
        Object.entries(data.details).forEach(([key, info]) => {
          const settingInfo = info as SettingInfo;
          if (settingInfo.source === "db") {
            initialForm[key] = settingInfo.value || "";
          }
        });

        // Set default toggles if they weren't in DB
        PROVIDERS.forEach(provider => {
          if (provider.toggleName && !initialForm[provider.toggleName]) {
            const keyInfo = data.details[provider.keyName];
            const hasKey = keyInfo && keyInfo.source !== "none";
            initialForm[provider.toggleName] = hasKey ? "true" : "false";
          }
        });

        if (data.details["CUSTOM_MODEL_LIST"]?.source === "db") {
          initialForm["CUSTOM_MODEL_LIST"] = data.details["CUSTOM_MODEL_LIST"].value || "";
        }

        setFormData(initialForm);

        if (data.details["CUSTOM_MODEL_LIST"]?.value) {
          try {
            setActiveModels(JSON.parse(data.details["CUSTOM_MODEL_LIST"].value));
          } catch (error) {
            console.error("Failed to parse model list", error);
            setActiveModels([...MODELS]);
          }
        } else {
          setActiveModels([...MODELS]);
        }
      }
    } catch (error) {
      console.error("Failed to load settings", error);
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = { ...formData };
      payload["CUSTOM_MODEL_LIST"] = JSON.stringify(activeModels);

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error();
      toast.success("Settings saved successfully");
      await loadSettings();
    } catch (error) {
      console.error("Failed to save settings", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function fetchModels() {
    setFetchingModels(true);
    try {
      const res = await fetch("/api/admin/fetch-provider-models");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDiscoveredModels(data.models || []);
      setModelHealth(data.health?.models || {});
      setHasFetchedModelData(true);
      toast.success(`Discovered ${data.models?.length || 0} models from enabled providers`);
    } catch (error) {
      console.error("Failed to fetch models", error);
      toast.error("Failed to fetch models from providers. Check your API keys.");
    } finally {
      setFetchingModels(false);
    }
  }

  const updateField = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const addModel = (discovered: DiscoveredModel) => {
    const id = discovered.normalizedId;

    if (activeModels.some(m => m.id === id)) {
      toast.error("Model already in active list");
      return;
    }

    const newModel: ModelOption = {
      id,
      label: discovered.name,
      category: discovered.provider,
      isPreset: false
    };
    setActiveModels([...activeModels, newModel]);
  };

  const removeModel = (id: string) => {
    setActiveModels(activeModels.filter(m => m.id !== id));
  };

  const updateModelLabel = (id: string, label: string) => {
    setActiveModels(activeModels.map(m => m.id === id ? { ...m, label } : m));
  };

  useEffect(() => {
    if (activeTab === "models" && !hasFetchedModelData && !fetchingModels) {
      void fetchModels();
    }
  }, [activeTab, hasFetchedModelData, fetchingModels]);

  const healthBadgeStyles: Record<ModelHealthEntry["status"], string> = {
    healthy: "bg-emerald-500/10 text-emerald-600",
    unknown: "bg-amber-500/10 text-amber-600",
    unavailable: "bg-destructive/10 text-destructive",
    disabled: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  };

  if (status === "loading" || loading) {
    return <main className="mx-auto max-w-4xl p-6"><LoadingSkeleton lines={10} /></main>;
  }

  if (!(session?.user as { isAdmin?: boolean })?.isAdmin) {
    return (
      <main className="mx-auto max-w-4xl p-6 text-center">
        <h1 className="text-2xl font-bold text-destructive">Unauthorized</h1>
        <p className="mt-2">You do not have permission to access this page.</p>
        <Link href="/" className="mt-4 inline-block text-primary underline">Go back home</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6 pb-20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-6">
        <div>
          <h1 className="font-[var(--font-accent)] text-3xl font-semibold tracking-tight">Admin Console</h1>
          <p className="mt-1 text-muted-foreground">Configure your Complexity workspace.</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-50 active:scale-95"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="mt-6 flex gap-1 rounded-xl bg-muted/50 p-1 w-fit">
        <button
          onClick={() => setActiveTab("providers")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            activeTab === "providers" ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-background/50"
          }`}
        >
          <Zap className="h-4 w-4" />
          Providers & Keys
        </button>
        <button
          onClick={() => setActiveTab("models")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            activeTab === "models" ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-background/50"
          }`}
        >
          <Settings2 className="h-4 w-4" />
          Manage Models
        </button>
        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            activeTab === "users" ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-background/50"
          }`}
        >
          <Users className="h-4 w-4" />
          Users
        </button>
        <button
          onClick={() => setActiveTab("health")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            activeTab === "health" ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-background/50"
          }`}
        >
          <Activity className="h-4 w-4" />
          Health
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            activeTab === "analytics" ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-background/50"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Analytics
        </button>
        <button
          onClick={() => setActiveTab("audit-logs")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            activeTab === "audit-logs" ? "bg-background shadow-sm" : "text-muted-foreground hover:bg-background/50"
          }`}
        >
          <ScrollText className="h-4 w-4" />
          Audit Log
        </button>
      </div>

      {activeTab === "providers" ? (
        <div className="mt-8 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {PROVIDERS.map((provider) => {
            const keyInfo = details[provider.keyName] || { value: null, source: "none" };
            return (
              <section key={provider.id} className="rounded-2xl border bg-card p-6 shadow-xs transition-shadow hover:shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5 text-primary">
                      {provider.id === "perplexity" ? <Zap className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                    </div>
                    <div>
                      <h2 className="text-lg font-bold">{provider.name}</h2>
                      <p className="text-xs text-muted-foreground">{provider.description}</p>
                    </div>
                  </div>
                  
                {provider.toggleName && (
                  <div className="flex items-center gap-2">
                    {(() => {
                      const isEnabled = formData[provider.toggleName!] === "true";
                      
                      return (
                        <>
                          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">
                            {isEnabled ? "Enabled" : "Disabled"}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateField(provider.toggleName!, isEnabled ? "false" : "true")}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                              isEnabled ? "bg-primary" : "bg-muted"
                            }`}
                          >
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${isEnabled ? "translate-x-5" : "translate-x-0"}`} />
                          </button>
                        </>
                      );
                    })()}
                  </div>
                )}                </div>

                <div className="mt-6 space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor={provider.keyName} className="text-sm font-semibold">{provider.id.includes("URL") ? "Base URL" : "API Key"}</label>
                    {keyInfo.source === "env" && !formData[provider.keyName] && (
                      <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                        <Check className="h-3 w-3" /> SET VIA ENVIRONMENT
                      </div>
                    )}
                    {keyInfo.source === "db" && (
                      <div className="flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600">
                        <ShieldCheck className="h-3 w-3" /> STORED IN DATABASE
                      </div>
                    )}
                  </div>
                  <input
                    id={provider.keyName}
                    type={provider.keyName.includes("KEY") ? "password" : "text"}
                    className="w-full rounded-xl border bg-background/50 px-4 py-2.5 text-sm transition-all focus:border-primary focus:ring-4 focus:ring-primary/5 outline-hidden"
                    placeholder={provider.placeholder}
                    value={formData[provider.keyName] || ""}
                    onChange={(e) => updateField(provider.keyName, e.target.value)}
                  />
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Info className="h-3 w-3" />
                    {keyInfo.source === "env" && !formData[provider.keyName] 
                      ? "Currently using the key from your .env file. Enter a value here to override it."
                      : "Leave empty to fallback to environment variables."}
                  </p>
                </div>
              </section>
            );
          })}

          <div className="pt-8 border-t">
            <h2 className="text-xl font-bold font-[var(--font-accent)] mb-1">External Integrations</h2>
            <p className="text-sm text-muted-foreground mb-6">Configure OAuth and third-party services.</p>
          </div>

          {INTEGRATIONS.map((integration) => (
            <section key={integration.id} className="rounded-2xl border bg-card p-6 shadow-xs transition-shadow hover:shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/5 text-primary">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">{integration.name}</h2>
                  <p className="text-xs text-muted-foreground">{integration.description}</p>
                </div>
              </div>

              <div className="space-y-6">
                {integration.fields.map((field) => {
                  const keyInfo = details[field.key] || { value: null, source: "none" };
                  return (
                    <div key={field.key} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label htmlFor={field.key} className="text-sm font-semibold">{field.label}</label>
                        {keyInfo.source === "env" && !formData[field.key] && (
                          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600">
                            <Check className="h-3 w-3" /> SET VIA ENVIRONMENT
                          </div>
                        )}
                        {keyInfo.source === "db" && (
                          <div className="flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-600">
                            <ShieldCheck className="h-3 w-3" /> STORED IN DATABASE
                          </div>
                        )}
                      </div>
                      <input
                        id={field.key}
                        type={(field.type as string) === "password" ? "password" : "text"}
                        className="w-full rounded-xl border bg-background/50 px-4 py-2.5 text-sm transition-all focus:border-primary focus:ring-4 focus:ring-primary/5 outline-hidden"
                        placeholder={field.placeholder}
                        value={formData[field.key] || ""}
                        onChange={(e) => updateField(field.key, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : activeTab === "models" ? (
        <div className="mt-8 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <section className="rounded-2xl border bg-card p-6 shadow-xs">
            <div className="flex items-center justify-between border-b pb-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-foreground">Active Model List</h2>
                <p className="text-xs text-muted-foreground">Reorder and rename models. Drag to change the sequence in the dropdown.</p>
              </div>
              <button 
                onClick={fetchModels}
                disabled={fetchingModels}
                className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${fetchingModels ? "animate-spin" : ""}`} />
                Fetch from Providers
              </button>
            </div>

            <Reorder.Group axis="y" values={activeModels} onReorder={setActiveModels} className="space-y-2">
              {activeModels.map((model) => (
                <Reorder.Item 
                  key={model.id} 
                  value={model}
                  className="group flex items-center gap-3 rounded-xl border bg-background/50 p-3 shadow-2xs hover:shadow-sm transition-all"
                >
                  <GripVertical className="h-4 w-4 cursor-grab text-muted-foreground/40 group-active:cursor-grabbing" />
                  {(() => {
                    const health = modelHealth[model.id];
                    return (
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <input 
                            type="text" 
                            value={model.label} 
                            onChange={(e) => updateModelLabel(model.id, e.target.value)}
                            className="bg-transparent text-sm font-semibold outline-hidden focus:text-primary"
                          />
                          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{model.category}</span>
                          {health && (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${healthBadgeStyles[health.status]}`}>
                              {health.status}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] font-mono text-muted-foreground/60">{model.id}</p>
                        {health?.reason && (
                          <p className="text-[11px] text-muted-foreground">{health.reason}</p>
                        )}
                      </div>
                    );
                  })()}
                  <button 
                    onClick={() => removeModel(model.id)}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors md:opacity-0 md:group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Reorder.Item>
              ))}
              {activeModels.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-2xl bg-muted/20">
                  <Settings2 className="h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">No models configured. Fetch models or add manually.</p>
                </div>
              )}
            </Reorder.Group>
          </section>

          {discoveredModels.length > 0 && (
            <section className="rounded-2xl border bg-card p-6 shadow-xs animate-in zoom-in-95 duration-200">
              <h2 className="text-lg font-bold text-foreground mb-4">Discovered Models</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {discoveredModels.map((m) => {
                  const isAdded = activeModels.some(am => am.id === m.normalizedId);
                  
                  return (
                    <div key={m.id + m.provider} className="flex items-center justify-between rounded-xl border p-3 bg-muted/10">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{m.name}</p>
                        <p className="text-[10px] text-muted-foreground">{m.provider}</p>
                        <p className="text-[10px] font-mono text-muted-foreground/70">{m.normalizedId}</p>
                      </div>
                      <button
                        onClick={() => addModel(m)}
                        disabled={isAdded}
                        className={`ml-2 rounded-lg p-1.5 transition-colors ${isAdded ? "text-emerald-500 bg-emerald-500/10 cursor-default" : "text-primary hover:bg-primary/10"}`}
                      >
                        {isAdded ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      ) : activeTab === "users" ? (
        <div className="mt-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <section className="rounded-2xl border bg-card p-6 shadow-xs">
            <UserManagement />
          </section>
        </div>
      ) : activeTab === "analytics" ? (
        <div className="mt-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <AnalyticsDashboard />
        </div>
      ) : activeTab === "audit-logs" ? (
        <div className="mt-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <section className="rounded-2xl border bg-card p-6 shadow-xs">
            <AuditLog />
          </section>
        </div>
      ) : (
        <div className="mt-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <HealthDashboard />
        </div>
      )}
    </main>
  );
}
