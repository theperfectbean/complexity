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
      const raw = context.inputValue.trim();

      // Extract the prompt — only if the input actually starts with /gemini.
      // If the user selected from the menu with just "/" or "/gem", raw won't
      // match the pattern and prompt will be empty, triggering autocomplete.
      const match = raw.match(/^\/gemini\s+([\s\S]+)$/i);
      const prompt = match ? match[1].trim() : "";

      if (!prompt) {
        // Autocomplete the trigger and wait for the user to type their prompt
        context.insertText("/gemini ");
        return;
      }

      let threadId = context.threadId;

      context.insertText("");
      const loadingToastId = toast.loading("Running Gemini CLI...");

      try {
        // If not inside a thread yet, create one first
        if (!threadId) {
          const title = "Gemini: " + prompt.substring(0, 60) + (prompt.length > 60 ? "..." : "");
          const threadRes = await fetch("/api/threads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
          });
          if (!threadRes.ok) {
            toast.dismiss(loadingToastId);
            toast.error("Could not create thread for Gemini CLI response");
            return;
          }
          const { thread } = (await threadRes.json()) as { thread: { id: string } };
          threadId = thread.id;

          // Save the user prompt as context in the new thread
          await fetch("/api/threads/" + threadId + "/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: "user", content: prompt }),
          });
        }

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

        toast.success("Gemini CLI responded");
        // Navigate to the new thread if we just created one
        if (!context.threadId) {
          window.location.href = "/search/" + threadId;
        }
      } catch {
        toast.dismiss(loadingToastId);
        toast.error("Could not reach the Gemini CLI bridge");
      }
    },
  });
}
