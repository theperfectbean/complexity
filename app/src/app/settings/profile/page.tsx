"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { Copy, KeyRound, Plus, Save, Trash2, User } from "lucide-react";
import { toast } from "sonner";

import { ThemeToggle } from "@/components/shared/ThemeToggle";

type ProfileData = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  theme: string | null;
  streamingStyle: "typewriter" | "instant";
  streamingSpeed: number;
};

type ApiToken = {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
};

function AvatarInitials({ name, email }: { name: string | null; email: string }) {
  const text = name?.trim() || email;
  const initials = text
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
      {initials}
    </div>
  );
}

export default function ProfilePage() {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [streamingStyle, setStreamingStyle] = useState<"typewriter" | "instant">("typewriter");
  const [streamingSpeed, setStreamingSpeed] = useState<number>(3);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [tokenName, setTokenName] = useState("");
  const [tokenCreating, setTokenCreating] = useState(false);
  const [newToken, setNewToken] = useState<{ id: string; name: string; rawToken: string } | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then(r => r.ok ? r.json() as Promise<ProfileData> : null)
      .then(data => {
        if (data) {
          setProfile(data);
          setName(data.name ?? "");
          setStreamingStyle(data.streamingStyle ?? "typewriter");
          setStreamingSpeed(data.streamingSpeed ?? 3);
        }
      })
      .catch(() => toast.error("Failed to load profile"));
  }, []);

  useEffect(() => {
    fetch("/api/tokens")
      .then(r => r.ok ? r.json() as Promise<{ tokens: ApiToken[] }> : null)
      .then(data => {
        if (data) {
          setTokens(data.tokens);
        }
      })
      .catch(() => toast.error("Failed to load API tokens"));
  }, []);

  const saveStreamingPrefs = async (style: "typewriter" | "instant", speed: number) => {
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ streamingStyle: style, streamingSpeed: speed }),
      });
      toast.success("Preference saved");
    } catch {
      toast.error("Failed to save preference");
    }
  };

  const handleStreamingStyleChange = async (style: "typewriter" | "instant") => {
    setStreamingStyle(style);
    await saveStreamingPrefs(style, streamingSpeed);
  };

  const handleStreamingSpeedChange = async (speed: number) => {
    setStreamingSpeed(speed);
    await saveStreamingPrefs(streamingStyle, speed);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      if (!res.ok) throw new Error("Failed");
      setProfile(prev => prev ? { ...prev, name: name.trim() || null } : prev);
      toast.success("Profile updated");
    } catch {
      toast.error("Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  const refreshTokens = async () => {
    const res = await fetch("/api/tokens");
    if (!res.ok) throw new Error("Failed to load tokens");
    const data = await res.json() as { tokens: ApiToken[] };
    setTokens(data.tokens);
  };

  const createToken = async () => {
    const trimmedName = tokenName.trim();
    if (!trimmedName) {
      toast.error("Token name is required");
      return;
    }

    setTokenCreating(true);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName }),
      });
      if (!res.ok) throw new Error("Failed");

      const data = await res.json() as { token: { id: string; name: string; rawToken: string } };
      setNewToken(data.token);
      setTokenName("");
      await refreshTokens();
      toast.success("Token created");
    } catch {
      toast.error("Failed to create token");
    } finally {
      setTokenCreating(false);
    }
  };

  const revokeToken = async (tokenId: string) => {
    if (!window.confirm("Revoke this token? This cannot be undone.")) return;

    try {
      const res = await fetch(`/api/tokens/${tokenId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      if (newToken?.id === tokenId) {
        setNewToken(null);
      }
      await refreshTokens();
      toast.success("Token revoked");
    } catch {
      toast.error("Failed to revoke token");
    }
  };

  const copyToken = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied token");
    } catch {
      toast.error("Failed to copy token");
    }
  };

  const email = session?.user?.email ?? profile?.email ?? "";

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-8 text-2xl font-bold">Profile</h1>

      {/* Identity */}
      <section className="mb-8 rounded-xl border bg-card p-6">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
          <User className="h-4 w-4 text-muted-foreground" />
          Identity
        </h2>

        <div className="flex items-start gap-6">
          <AvatarInitials name={name || null} email={email} />
          <div className="flex-1 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Display Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={email}
                maxLength={100}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                How your name appears in the UI. Defaults to your email.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <input
                type="email"
                value={email}
                disabled
                className="w-full rounded-lg border bg-muted px-3 py-2 text-sm text-muted-foreground"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </section>

      {/* Appearance */}
      <section className="rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-base font-semibold">Appearance</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Your theme preference is saved to your account and syncs across devices.
        </p>
        <ThemeToggle />
      </section>

      {/* Chat Preferences */}
      <section className="mt-8 rounded-xl border bg-card p-6">
        <h2 className="mb-4 text-base font-semibold">Chat Preferences</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Control how AI responses are displayed as they stream in.
        </p>

        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium">Response display style</label>
            <div className="flex gap-3">
              <button
                onClick={() => void handleStreamingStyleChange("typewriter")}
                className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors text-left ${
                  streamingStyle === "typewriter"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                <div className="font-semibold mb-0.5">Typewriter</div>
                <div className="text-xs opacity-70">Text appears character by character as it arrives</div>
              </button>
              <button
                onClick={() => void handleStreamingStyleChange("instant")}
                className={`flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors text-left ${
                  streamingStyle === "instant"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                <div className="font-semibold mb-0.5">Instant</div>
                <div className="text-xs opacity-70">Text appears immediately as chunks arrive from the server</div>
              </button>
            </div>
          </div>

          {streamingStyle === "typewriter" && (
            <div>
              <label className="mb-2 block text-sm font-medium">
                Typewriter speed
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {["", "Slowest", "Slow", "Normal", "Fast", "Fastest"][streamingSpeed]}
                </span>
              </label>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={streamingSpeed}
                onChange={e => void handleStreamingSpeedChange(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>Slowest</span>
                <span>Fastest</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* API Tokens */}
      <section className="mt-8 rounded-xl border bg-card p-6">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          API Tokens
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Create personal API tokens for programmatic access. The token value is shown only once.
        </p>

        {newToken ? (
          <div className="mb-5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="mb-2 text-sm font-medium">Copy this token now</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                readOnly
                value={newToken.rawToken}
                className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm font-mono"
              />
              <button
                onClick={() => copyToken(newToken.rawToken)}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                <Copy className="h-4 w-4" />
                Copy
              </button>
            </div>
          </div>
        ) : null}

        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={tokenName}
            onChange={e => setTokenName(e.target.value)}
            placeholder="e.g. Cursor, CLI script, integration"
            maxLength={100}
            className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50"
          />
          <button
            onClick={createToken}
            disabled={tokenCreating}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {tokenCreating ? "Creating…" : "Create Token"}
          </button>
        </div>

        <div className="space-y-3">
          {tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">No personal API tokens yet.</p>
          ) : (
            tokens.map(token => (
              <div key={token.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{token.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Created {new Date(token.createdAt).toLocaleString()}
                    {token.lastUsedAt ? ` • Last used ${new Date(token.lastUsedAt).toLocaleString()}` : ""}
                    {token.expiresAt ? ` • Expires ${new Date(token.expiresAt).toLocaleString()}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => revokeToken(token.id)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium text-destructive hover:bg-destructive/5"
                >
                  <Trash2 className="h-4 w-4" />
                  Revoke
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
