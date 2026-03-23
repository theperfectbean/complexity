"use client";

import { useState, useRef, FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Sparkles, Wand2, Loader2, Save, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useCompletion } from "@ai-sdk/react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";

type Role = {
  id: string;
  name: string;
  instructions: string | null;
};

type RoleInstructionsDialogProps = {
  role: Role;
  onUpdate: (instructions: string | null) => void;
};

export function RoleInstructionsDialog({ role, onUpdate }: RoleInstructionsDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Instruction Generation State
  const [showGenerator, setShowGenerator] = useState(false);
  const [genPrompt, setGenPrompt] = useState("");
  const genModel = "anthropic/claude-4-6-sonnet-latest";
  
  const { 
    completion: instructions, 
    setCompletion: setInstructions, 
    complete, 
    isLoading: isGenerating 
  } = useCompletion({
    api: "/api/roles/generate-instructions",
    body: { model: genModel },
    initialCompletion: role.instructions || "",
    onError: (err) => {
      console.error(err);
      toast.error("Failed to generate instructions");
    },
    onFinish: () => {
      toast.success("Instructions generated successfully!");
    }
  });

  async function generateInstructions() {
    if (!genPrompt.trim() || isGenerating) return;
    setInstructions(""); // Clear existing
    await complete(genPrompt.trim());
  }

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/roles/${role.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructions: instructions.trim() ? instructions.trim() : null,
        }),
      });

      if (!response.ok) throw new Error("Failed to update instructions");

      onUpdate(instructions.trim() || null);
      toast.success("Instructions updated successfully");
      setOpen(false);
    } catch (error) {
      console.error(error);
      toast.error("Failed to update instructions");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(val) => {
      setOpen(val);
      if (val) {
        setInstructions(role.instructions || "");
      }
    }}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="text-muted-foreground/40 hover:text-foreground transition-colors"
          title="Edit instructions"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-popover p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between mb-6 shrink-0">
            <div>
              <Dialog.Title className="text-xl font-semibold">Instructions</Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground mt-1">
                Define the persona and behavior for <strong>{role.name}</strong>
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="rounded-full p-1.5 text-muted-foreground hover:bg-muted/60 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto space-y-6 pr-1 scrollbar-thin">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-muted-foreground">System Prompt</label>
                <button
                  type="button"
                  onClick={() => setShowGenerator(!showGenerator)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all",
                    showGenerator 
                      ? "bg-primary/10 text-primary" 
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Sparkles className="h-3 w-3" />
                  {showGenerator ? "Close Generator" : "Generate with AI"}
                </button>
              </div>

              <AnimatePresence>
                {showGenerator && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 mb-4">
                      <div className="flex flex-col gap-3">
                        <p className="text-xs text-muted-foreground/80">
                          Describe what you want this role to be, and a model will write the detailed instructions for you.
                        </p>
                        <textarea
                          className="w-full min-h-[80px] rounded-xl border border-border/40 bg-background px-3 py-2 text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/5"
                          placeholder="e.g. A senior software engineer who focuses on clean code and security best practices..."
                          value={genPrompt}
                          onChange={(e) => setGenPrompt(e.target.value)}
                        />
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            onClick={generateInstructions}
                            disabled={isGenerating || !genPrompt.trim()}
                            className="flex items-center gap-2 rounded-full bg-foreground px-4 py-1.5 text-xs font-semibold text-background transition-all hover:opacity-90 disabled:opacity-40"
                          >
                            {isGenerating ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Generating...
                              </>
                            ) : (
                              <>
                                <Wand2 className="h-3 w-3" />
                                Generate
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <textarea
                className="w-full min-h-[400px] rounded-xl border border-border/70 bg-background px-4 py-3 text-sm text-foreground outline-none transition-colors hover:border-border focus:border-primary/50 focus:ring-4 focus:ring-primary/5 font-mono leading-relaxed"
                placeholder="Describe the persona or system prompt in detail. What should this role do, how should it behave, and what are its constraints?"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
              />
            </div>
          </div>

          <div className="mt-6 shrink-0 flex items-center justify-end gap-3 pt-4 border-t border-border/40">
            <Dialog.Close asChild>
              <button className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/40 transition-colors">
                Cancel
              </button>
            </Dialog.Close>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 rounded-full bg-foreground px-6 py-2 text-sm font-medium text-background transition-all hover:opacity-90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save Instructions"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
