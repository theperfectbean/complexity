"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { LoadingSkeleton } from "@/components/shared/LoadingSkeleton";

const ALLOWED_KEYS = [
  { key: "PERPLEXITY_API_KEY", label: "Perplexity API Key", placeholder: "pplx-..." },
  { key: "ANTHROPIC_API_KEY", label: "Anthropic API Key", placeholder: "sk-ant-..." },
  { key: "OPENAI_API_KEY", label: "OpenAI API Key", placeholder: "sk-..." },
  { key: "GOOGLE_GENERATIVE_AI_API_KEY", label: "Google AI API Key", placeholder: "AIza..." },
  { key: "XAI_API_KEY", label: "xAI API Key", placeholder: "xai-..." },
  { key: "OLLAMA_BASE_URL", label: "Ollama Base URL", placeholder: "http://localhost:11434/api" },
  { key: "LOCAL_OPENAI_BASE_URL", label: "Local OpenAI-Compatible Base URL", placeholder: "http://localhost:1234/v1" },
  { key: "LOCAL_OPENAI_API_KEY", label: "Local OpenAI-Compatible API Key", placeholder: "Optional key for local API" },
];

export default function AdminSettingsPage() {
  const { data: session, status } = useSession();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !(session?.user as any)?.isAdmin) {
      return;
    }

    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setSettings(data))
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, [status, session]);

  if (status === "loading" || loading) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <LoadingSkeleton lines={5} />
      </main>
    );
  }

  if (!(session?.user as any)?.isAdmin) {
    return (
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="text-2xl font-bold text-destructive">Unauthorized</h1>
        <p className="mt-2">You do not have permission to access this page.</p>
        <Link href="/" className="mt-4 inline-block underline">Go back home</Link>
      </main>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!res.ok) throw new Error();
      toast.success("Settings saved successfully");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[var(--font-accent)] text-2xl font-semibold">Admin Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure global API keys for LLM providers. These will override or fallback from environment variables.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="mt-8 space-y-6">
        {ALLOWED_KEYS.map((item) => (
          <section key={item.key} className="rounded-lg border bg-card p-4 shadow-2xs">
            <label htmlFor={item.key} className="block text-sm font-semibold">
              {item.label}
            </label>
            <input
              id={item.key}
              type="password"
              className="mt-2 w-full rounded-md border bg-background px-3 py-2 text-sm"
              placeholder={item.placeholder}
              value={settings[item.key] || ""}
              onChange={(e) => setSettings({ ...settings, [item.key]: e.target.value })}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Stored securely in the database. Leave empty to use environment variable if set.
            </p>
          </section>
        ))}
      </div>
    </main>
  );
}
