import { commandRegistry } from "@/plugins/commandRegistry";
import { toast } from "sonner";

let registered = false;

export function registerGeminiCommand() {
  if (registered) return;
  registered = true;

  commandRegistry.register({
    id: "gemini-cli",
    trigger: "gemini",
    label: "Ask Gemini CLI",
    description: "Send a prompt to the local Gemini CLI agent",
    action: async (context) => {
      const raw = context.inputValue;
      const prompt = raw.replace(/^\/gemini\s*/i, "").trim();

      if (!prompt) {
        context.insertText("/gemini ");
        return;
      }

      const threadId = context.threadId;
      if (!threadId) {
        toast.error("Cannot run Gemini CLI outside of a thread.");
        context.insertText("");
        return;
      }

      context.insertText("");
      const loadingToastId = toast.loading("Running Gemini CLI...");

      try {
        const res = await fetch("/api/tools/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, threadId }),
        });

        toast.dismiss(loadingToastId);

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          toast.error((err as { error?: string }).error ?? "Gemini CLI request failed");
          return;
        }

        toast.success("Gemini CLI responded - see the thread");
      } catch {
        toast.dismiss(loadingToastId);
        toast.error("Could not reach the Gemini CLI bridge");
      }
    },
  });
}
