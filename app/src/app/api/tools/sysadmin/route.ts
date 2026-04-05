import { NextResponse } from "next/server";
import { z } from "zod";
import { createId } from "@/lib/db/cuid";
import { messages } from "@/lib/db/schema";
import { db } from "@/lib/db";
import { requireUserOrApiToken } from "@/lib/auth-server";
import { ApiResponse } from "@/lib/api-response";
import { getLanguageModel } from "@/lib/llm";
import { getDetailedSettings } from "@/lib/settings";
import { MODEL_SETTINGS_KEYS } from "@/lib/model-registry";
import { createSshExecTool } from "@/lib/tools/sysadmin";
import { generateText, stepCountIs } from "ai";

const schema = z.object({
  prompt: z.string().min(1).max(8000),
  threadId: z.string().min(1),
});

const SYSTEM_PROMPT = `You are a cluster sysadmin agent for a three-node Proxmox homelab cluster.
You have SSH access to all nodes and LXC containers via the ssh_exec tool.
Use list_hosts to understand the cluster topology if needed.

Cluster overview:
- pve01 (192.168.0.201): App/proxy node — hosts Plex (CT100), Complexity (CT105), Caddy/proxy (CT107), Audiobooks (CT104)
- pve02 (192.168.0.202): Storage/control node — hosts Arr stack (CT103), AdGuard primary (CT106), Forgejo/docs (CT109)
- pve03 (192.168.0.203): General/backup node — hosts AdGuard secondary (CT111), qBittorrent/SABnzbd ingestion (CT112)

Guidelines:
- Run commands on the most relevant host(s) for the question
- For cluster-wide status, check all three Proxmox nodes
- Be concise and actionable — show actual output, not just summaries
- Format responses in clean markdown
- For service issues, check systemctl status and recent journal logs (journalctl -u <service> -n 20)
- Disk usage: df -h; storage details: lsblk
- Temperatures: sensors command on Proxmox hosts
- Memory: free -h
`;

export async function POST(request: Request) {
  const authResult = await requireUserOrApiToken(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  if (!authResult.user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return ApiResponse.badRequest("Invalid payload", parsed.error.format());
  }

  const { prompt, threadId } = parsed.data;

  // Fetch API keys the same way llm.ts does
  const settingsMap = await getDetailedSettings([...MODEL_SETTINGS_KEYS]);
  const keys = Object.fromEntries(
    Object.entries(settingsMap).map(([k, v]) => [k, v.value])
  );

  let langModel;
  try {
    langModel = await getLanguageModel("anthropic/claude-haiku-4-5", keys);
  } catch {
    try {
      langModel = await getLanguageModel("anthropic/claude-sonnet-4-5", keys);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "No Anthropic model configured";
      return ApiResponse.error(`Could not load language model: ${msg}`, 503);
    }
  }

  const toolCallLog: string[] = [];

  let result;
  try {
    result = await generateText({
      model: langModel,
      system: SYSTEM_PROMPT,
      prompt,
      tools: {
        ssh_exec: createSshExecTool(),
      },
      stopWhen: stepCountIs(10),
      onStepFinish: (step) => {
        for (const call of step.toolCalls ?? []) {
          if (!("dynamic" in call) && call.toolName === "ssh_exec") {
            const input = call.input as { host: string; command: string };
            toolCallLog.push(`\`${input.host}\` → \`${input.command}\``);
          }
        }
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Sysadmin agent error:", msg);
    return ApiResponse.error(`Agent error: ${msg}`, 500);
  }

  const answer = result.text.trim();

  // Prepend tool call log so user can see what commands ran
  const toolSummary =
    toolCallLog.length > 0
      ? `*Commands run: ${toolCallLog.join(", ")}*

---

`
      : "";

  const content = toolSummary + answer;

  await db.insert(messages).values({
    id: createId(),
    threadId,
    role: "assistant",
    content,
    model: "cluster-agent",
  });

  return ApiResponse.success({ ok: true, content });
}
