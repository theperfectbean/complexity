import { commandRegistry } from "@/plugins/commandRegistry";
import { toast } from "sonner";

/**
 * Shared action helper for the cluster sysadmin agent.
 * Used by the /sysadmin slash command.
 */
export async function runSysadminAction(
  trigger: string,
  context: { inputValue: string; threadId?: string; insertText: (text: string) => void },
) {
  const raw = context.inputValue.trim();

  // Extract prompt: everything after '/{trigger} '
  const prefix = `/${trigger} `;
  const prompt = raw.toLowerCase().startsWith(prefix.toLowerCase())
    ? raw.substring(prefix.length).trim()
    : "";

  if (!prompt) {
    // Autocomplete and wait for the user to type their prompt
    context.insertText(`/${trigger} `);
    return;
  }

  let threadId = context.threadId;
  context.insertText("");
  const loadingToastId = toast.loading("Running cluster agent...");

  try {
    if (!threadId) {
      const title = "Cluster: " + prompt.substring(0, 60) + (prompt.length > 60 ? "..." : "");
      const threadRes = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!threadRes.ok) {
        toast.dismiss(loadingToastId);
        toast.error("Could not create thread for cluster agent response");
        return;
      }
      const { thread } = (await threadRes.json()) as { thread: { id: string } };
      threadId = thread.id;

      await fetch("/api/threads/" + threadId + "/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: prompt }),
      });
    }

    const res = await fetch("/api/tools/sysadmin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, threadId }),
    });

    toast.dismiss(loadingToastId);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Unknown error" }));
      toast.error((err as { error?: string }).error ?? "Cluster agent request failed");
      return;
    }

    toast.success("Cluster agent responded");
    if (!context.threadId) {
      window.location.href = "/search/" + threadId;
    }
  } catch {
    toast.dismiss(loadingToastId);
    toast.error("Could not reach the cluster agent");
  }
}
