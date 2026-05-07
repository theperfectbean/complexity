"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { MoreHorizontal, X, Trash2, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Role = {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
};

type RoleSettingsDialogProps = {
  role: Role;
  onUpdate: (updatedRole: Partial<Role>) => void;
};

export function RoleSettingsDialog({ role, onUpdate }: RoleSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description || "");
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleSave = async () => {
    if (!name.trim() || isSaving) return;

    setIsSaving(true);
    try {
      const response = await fetch(`/api/roles/${role.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
        }),
      });

      if (!response.ok) throw new Error("Failed to update role");

      onUpdate({ name: name.trim(), description: description.trim() || null });
      toast.success("Role updated successfully");
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to update role");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/roles/${role.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete role");

      toast.success("Role deleted");
      router.push("/roles");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete role");
      setIsDeleting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground hover:bg-muted/40 transition-colors"
          aria-label="Role settings"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-popover p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between">
            <Dialog.Title className="text-xl font-semibold">Role Settings</Dialog.Title>
            <Dialog.Close asChild>
              <button className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/60 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {!showDeleteConfirm ? (
            <div className="mt-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Role Name</label>
                <input
                  className="w-full rounded-xl border border-border/70 bg-background px-4 py-2.5 text-sm outline-none transition-colors hover:border-border focus:border-primary/50 focus:ring-4 focus:ring-primary/5"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Custom Role"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Description (optional)</label>
                <textarea
                  className="w-full min-h-[80px] rounded-xl border border-border/70 bg-background px-4 py-2.5 text-sm outline-none transition-colors hover:border-border focus:border-primary/50 focus:ring-4 focus:ring-primary/5"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this role for?"
                />
              </div>

              <div className="pt-4 flex flex-col gap-3">
                <button
                  onClick={handleSave}
                  disabled={isSaving || !name.trim()}
                  className="flex items-center justify-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-all hover:opacity-90 disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
                
                <div className="h-px bg-border/40 my-1" />
                
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center justify-center gap-2 rounded-full border border-destructive/20 bg-destructive/5 px-4 py-2.5 text-sm font-medium text-destructive transition-all hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Role
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 flex gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-destructive">Are you absolutely sure?</p>
                  <p className="text-xs text-destructive/80 leading-relaxed">
                    This will permanently delete the role <strong>{role.name}</strong> and all its associated documents and data. This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex items-center justify-center gap-2 rounded-full bg-destructive px-4 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
                >
                  {isDeleting ? "Deleting..." : "Permanently Delete Role"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="rounded-full border border-border/60 bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/40 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
