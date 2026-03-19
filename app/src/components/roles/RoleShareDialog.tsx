"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X, Share2, Users, Loader2, Globe, Shield, Trash2, Mail } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SharedUser {
  userId: string;
  email: string;
  name: string | null;
  permission: "viewer" | "editor";
}

interface RoleShareDialogProps {
  roleId: string;
  roleName: string;
  isPublic: boolean;
  onPublicToggle: (isPublic: boolean) => Promise<void>;
}

export function RoleShareDialog({ roleId, roleName, isPublic, onPublicToggle }: RoleShareDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sharedUsers, setSharedUsers] = useState<SharedUser[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePermission, setInvitePermission] = useState<"viewer" | "editor">("viewer");
  const [isInviting, setIsInviting] = useState(false);

  const fetchSharedUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/roles/${roleId}/share`);
      if (res.ok) {
        const data = await res.json();
        setSharedUsers(data.access);
      }
    } catch {
      toast.error("Failed to load shared users");
    } finally {
      setLoading(false);
    }
  }, [roleId]);

  useEffect(() => {
    if (open) {
      void fetchSharedUsers();
    }
  }, [open, fetchSharedUsers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setIsInviting(true);
    try {
      const res = await fetch(`/api/roles/${roleId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), permission: invitePermission }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to invite");
      }

      toast.success(`Access granted to ${inviteEmail}`);
      setInviteEmail("");
      void fetchSharedUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveAccess = async (userId: string) => {
    try {
      const res = await fetch(`/api/roles/${roleId}/share?userId=${userId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to remove access");

      toast.success("Access removed");
      void fetchSharedUsers();
    } catch {
      toast.error("Failed to remove access");
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted">
          <Share2 className="h-3.5 w-3.5" />
          Share
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-2xl border border-border bg-background p-6 shadow-2xl transition-all">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <Dialog.Title className="text-lg font-semibold">Share Role</Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground truncate max-w-[240px]">
                  {roleName}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-full p-1.5 hover:bg-muted text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="space-y-6">
            {/* Public Access Toggle */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/20">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg", isPublic ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                  <Globe className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Public Access</p>
                  <p className="text-[11px] text-muted-foreground">Anyone on this instance can use this role</p>
                </div>
              </div>
              <button
                onClick={() => void onPublicToggle(!isPublic)}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                  isPublic ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    isPublic ? "translate-x-5" : "translate-x-0"
                  )}
                />
              </button>
            </div>

            {/* Invite Section */}
            <form onSubmit={handleInvite} className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Invite by Email
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full h-9 rounded-lg border border-border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
                <select
                  value={invitePermission}
                  onChange={(e) => setInvitePermission(e.target.value as "viewer" | "editor")}
                  className="h-9 rounded-lg border border-border bg-background px-2 text-xs focus:outline-none"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                </select>
                <button
                  type="submit"
                  disabled={isInviting || !inviteEmail}
                  className="h-9 px-4 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all"
                >
                  {isInviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Invite"}
                </button>
              </div>
            </form>

            {/* User List */}
            <div className="space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Who has access
              </label>
              <div className="max-h-40 overflow-y-auto space-y-2 pr-1 scrollbar-thin">
                {loading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : sharedUsers.length === 0 ? (
                  <p className="text-center py-4 text-xs text-muted-foreground italic">No specific users invited yet.</p>
                ) : (
                  sharedUsers.map((user) => (
                    <div key={user.userId} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 group">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{user.name || user.email}</p>
                        {user.name && <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 text-[10px] bg-background border px-1.5 py-0.5 rounded text-muted-foreground">
                          <Shield className="h-2.5 w-2.5" />
                          {user.permission}
                        </div>
                        <button 
                          onClick={() => void handleRemoveAccess(user.userId)}
                          className="p-1 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
