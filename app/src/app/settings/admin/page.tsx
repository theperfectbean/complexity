"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";
import { Check, Info, ShieldCheck, Zap, RefreshCw, Plus, Trash2, GripVertical, Settings2 } from "lucide-react";
import { Reorder } from "motion/react";

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
};

const PROVIDERS: ProviderConfig[] = [
  {
    id: "perplexity",
    name: "Perplexity",
    keyName: "PERPLEXITY_API_KEY",
    placeholder: "pplx-...",
    description: "Core provider for Search. Required for Perplexity models.",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    keyName: "ANTHROPIC_API_KEY",
    toggleName: "PROVIDER_ANTHROPIC_ENABLED",
    placeholder: "sk-ant-...",
    description: "Enables Claude 4.6 and 4.5 models.",
  },
  {
    id: "openai",
    name: "OpenAI",
    keyName: "OPENAI_API_KEY",
    toggleName: "PROVIDER_OPENAI_ENABLED",
    placeholder: "sk-...",
    description: "Enables GPT-5.4 and other OpenAI models.",
  },
  {
    id: "google",
    name: "Google Gemini",
    keyName: "GOOGLE_GENERATIVE_AI_API_KEY",
    toggleName: "PROVIDER_GOOGLE_ENABLED",
    placeholder: "AIza...",
    description: "Enables Gemini 3.1 Pro and Flash models.",
  },
  {
    id: "xai",
    name: "xAI",
    keyName: "XAI_API_KEY",
    toggleName: "PROVIDER_XAI_ENABLED",
    placeholder: "xai-...",
    description: "Enables Grok 4.20 models.",
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

export default function AdminSettingsPage() {
  const { data: session, status } = useSession();
  const [details, setDetails] = useState<Record<string, SettingInfo>>({});
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<"providers" | "models">("providers");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Model Management State
  const [activeModels, setActiveModels] = useState<ModelOption[]>([]);
  const [discoveredModels, setDiscoveredModels] = useState<DiscoveredModel[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !(session?.user as { isAdmin?: boolean })?.isAdmin) {
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
        Object.entries(data.details as Record<string, SettingInfo>).forEach(([key, info]) => {
          if (info.source === "db") {
            initialForm[key] = info.value || "";
          }
        });
        setFormData(initialForm);

        // Load active model list
        if (data.details["CUSTOM_MODEL_LIST"]?.value) {
          try {
            setActiveModels(JSON.parse(data.details["CUSTOM_MODEL_LIST"].value));
          } catch (error) {
            console.error("Failed to parse model list", error);
          }
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
    const providerPrefix = discovered.provider.toLowerCase().replace(" (local)", "");
    const id = providerPrefix === "perplexity" ? discovered.id : `${providerPrefix}/${discovered.id}`;
    
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
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">
                        {formData[provider.toggleName] === "true" ? "Enabled" : "Disabled"}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateField(provider.toggleName!, formData[provider.toggleName!] === "true" ? "false" : "true")}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                          formData[provider.toggleName] === "true" ? "bg-primary" : "bg-muted"
                        }`}
                      >
                        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${formData[provider.toggleName] === "true" ? "translate-x-5" : "translate-x-0"}`} />
                      </button>
                    </div>
                  )}
                </div>

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
        </div>
      ) : (
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
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        value={model.label} 
                        onChange={(e) => updateModelLabel(model.id, e.target.value)}
                        className="bg-transparent text-sm font-semibold outline-hidden focus:text-primary"
                      />
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{model.category}</span>
                    </div>
                    <p className="text-[10px] font-mono text-muted-foreground/60">{model.id}</p>
                  </div>
                  <button 
                    onClick={() => removeModel(model.id)}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
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
                  const providerPrefix = m.provider.toLowerCase().replace(" (local)", "");
                  const fullId = providerPrefix === "perplexity" ? m.id : `${providerPrefix}/${m.id}`;
                  const isAdded = activeModels.some(am => am.id === fullId);
                  
                  return (
                    <div key={m.id + m.provider} className="flex items-center justify-between rounded-xl border p-3 bg-muted/10">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{m.name}</p>
                        <p className="text-[10px] text-muted-foreground">{m.provider}</p>
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
      )}
    </main>
  );
}
