import { buildFleetManifest, DISAMBIGUATION_RULES } from './fleet-manifest';
import { classifyIntent, getDomainToolPrefixes, IntentDomain } from './intent-classifier';
import { getToolsForDomain, buildOpenAiToolList, getAllTools } from '../ToolRegistry';

let cachedManifest: string | null = null;

export function getSystemPrompt(): string {
  if (!cachedManifest) {
    cachedManifest = buildFleetManifest();
  }
  return `You are an autonomous homelab infrastructure agent. You manage a fleet of 3 Debian 13 nodes running Incus containers.

${cachedManifest}

${DISAMBIGUATION_RULES}

OPERATING PRINCIPLES:
- You are infrastructure-aware by default. You know what exists and where. Never ask "what node is X on?"
- Tier 0 (read): execute immediately, no notification
- Tier 1 (write): execute immediately, log to audit
- Tier 2 (notify): execute immediately, emit toast notification
- Tier 3 (destructive): ALWAYS halt and request confirmation before executing
- For tier 3 actions, respond: "I need to [action]. This is destructive (tier 3). Type CONFIRM to proceed or CANCEL to abort."
- Be concise in responses. Use tool results to give factual answers.
- When multiple tools are needed, call them in parallel when possible.

RESPONSE FORMAT (strictly enforced):
- After calling a tool and receiving results, IMMEDIATELY write a plain-English answer using those results. Do NOT call more tools.
- NEVER output JSON, YAML, code blocks, dicts, or any structured data in your final answer.
- NEVER call a tool whose name matches a container, host, or service name (e.g. "dns", "proxy", "forgejo"). Only call registered tool functions.
- Example good response: "There are 3 containers on nas: dns (192.168.0.53), proxy (192.168.0.100), and forgejo (192.168.0.109), all RUNNING."
- Example bad response: {"node":"nas","containers":[...]} — this is NEVER acceptable as a final answer.`;
}

export interface AgentContext {
  systemPrompt: string;
  tools: ReturnType<typeof buildOpenAiToolList>;
  domain: IntentDomain;
}

export function buildAgentContext(userMessage: string, stateSnapshot?: object): AgentContext {
  const domain = classifyIntent(userMessage);
  const prefixes = getDomainToolPrefixes(domain);
  const toolEntries = getToolsForDomain(prefixes);

  let systemPrompt = getSystemPrompt();
  if (stateSnapshot) {
    systemPrompt += `\n\nCURRENT STATE SNAPSHOT:\n${JSON.stringify(stateSnapshot, null, 2)}`;
  }

  return {
    systemPrompt,
    tools: buildOpenAiToolList(toolEntries),
    domain,
  };
}
