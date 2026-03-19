"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { User, Save } from "lucide-react";

import { ThemeToggle } from "@/components/shared/ThemeToggle";

type ProfileData = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  theme: string | null;
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

  useEffect(() => {
    fetch("/api/profile")
      .then(r => r.ok ? r.json() as Promise<ProfileData> : null)
      .then(data => {
        if (data) {
          setProfile(data);
          setName(data.name ?? "");
        }
      })
      .catch(() => toast.error("Failed to load profile"));
  }, []);

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
    </div>
  );
}
