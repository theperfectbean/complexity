/**
 * Manages context window utilization.
 * Estimates token usage and triggers rolling summary or truncation
 * before the model's context limit is reached.
 */

import type { ProviderModel } from "./ProviderModel";
import type { AgentSettings } from "./AgentSettings";

type Message = { role: string; content: unknown };

export type ContextAction = "ok" | "summarize" | "truncate";

export interface ContextBudget {
  action: ContextAction;
  estimatedTokens: number;
  limit: number;
  utilizationPct: number;
}

/**
 * Very rough token estimate: ~4 chars per token for English text.
 * Good enough for headroom decisions before hitting provider limits.
 */
function estimateTokens(messages: Message[]): number {
  return Math.ceil(
    messages.reduce((sum, msg) => {
      const content = typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content);
      return sum + content.length / 4;
    }, 0),
  );
}

export function checkContextBudget(
  model: ProviderModel,
  messages: Message[],
  settings: AgentSettings,
): ContextBudget {
  const estimatedTokens = estimateTokens(messages);
  const limit = model.limits.contextTokens;
  const utilizationPct = estimatedTokens / limit;
  const threshold = settings.contextUtilizationThreshold;

  let action: ContextAction = "ok";
  if (utilizationPct >= 0.95) {
    action = settings.contextStrategy === "rolling_summary" ? "summarize" : "truncate";
  } else if (utilizationPct >= threshold) {
    action = settings.contextStrategy === "rolling_summary" ? "summarize" : "truncate";
  }

  return { action, estimatedTokens, limit, utilizationPct };
}

/**
 * Truncate messages from oldest to keep within 70% of limit.
 * Always preserves the system message (first) and last N messages.
 */
export function truncateMessages(
  model: ProviderModel,
  messages: Message[],
  keepLastN = 6,
): Message[] {
  const target = Math.floor(model.limits.contextTokens * 0.7);
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");

  if (nonSystem.length <= keepLastN) return messages;

  // Keep the last keepLastN non-system messages
  const tail = nonSystem.slice(-keepLastN);

  // Build a truncation notice
  const dropped = nonSystem.length - keepLastN;
  const notice: Message = {
    role: "system",
    content: `[${dropped} earlier messages have been removed to stay within context limits]`,
  };

  const trimmed = [...systemMessages, notice, ...tail];

  // Double-check: if still too long, truncate more aggressively
  if (estimateTokens(trimmed) > target && keepLastN > 2) {
    return truncateMessages(model, messages, Math.max(2, keepLastN - 2));
  }

  return trimmed;
}

/**
 * Build a prompt asking a fast model to summarize the current conversation.
 */
export function buildSummaryPrompt(messages: Message[]): Message[] {
  const history = messages
    .filter((m) => m.role !== "system")
    .map((m) => {
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      return `[${m.role.toUpperCase()}]: ${content.slice(0, 500)}`;
    })
    .join("\n\n");

  return [
    {
      role: "system",
      content:
        "You are a conversation summarizer. Your job is to create a compact summary of the conversation so far that preserves all key facts, decisions, tool results, pending tasks, and unresolved questions. Be thorough but concise. Output a single structured paragraph or bullet list.",
    },
    {
      role: "user",
      content: `Please summarize this infrastructure agent conversation:\n\n${history}`,
    },
  ];
}
