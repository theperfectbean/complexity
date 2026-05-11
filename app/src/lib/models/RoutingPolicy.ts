/**
 * Routing policy: maps task types and message characteristics
 * to model selection preferences.
 */

import type { ModelTask } from "../agent/core/AgentState";

export type CostBias = "cheap" | "balanced" | "quality";

export interface RoutingPreference {
  task: ModelTask;
  preferLocal: boolean;
  costBias: CostBias;
  requireToolCalling: boolean;
  requireReasoning: boolean;
  maxContextTokens?: number;
}

/** Classify a user message into a routing task */
export function classifyModelTask(message: string): ModelTask {
  const lower = message.toLowerCase();

  const planningKeywords = /\b(design|architecture|plan|compare|analyse|analyze|refactor|propose|evaluate|should i|what is the best)\b/i;
  const summaryKeywords = /\b(summarize|summarise|summary|digest|tldr|what does this (log|output|error) mean|explain this error)\b/i;
  const classifyKeywords = /^(is|are|check|verify|confirm|does|do|can|will)\b/i;

  if (planningKeywords.test(lower) || message.length > 800) {
    return "mission_planning";
  }
  if (summaryKeywords.test(lower)) {
    return "log_summary";
  }
  if (classifyKeywords.test(lower) && message.length < 200) {
    return "intent_classification";
  }

  return "chat";
}

/** Default routing preferences per task */
export function getRoutingPreference(task: ModelTask): RoutingPreference {
  switch (task) {
    case "mission_planning":
      return {
        task,
        preferLocal: false,
        costBias: "quality",
        requireToolCalling: true,
        requireReasoning: false,
      };
    case "tool_synthesis":
      return {
        task,
        preferLocal: false,
        costBias: "balanced",
        requireToolCalling: true,
        requireReasoning: false,
      };
    case "log_summary":
    case "intent_classification":
      return {
        task,
        preferLocal: true,
        costBias: "cheap",
        requireToolCalling: false,
        requireReasoning: false,
      };
    case "chat":
    default:
      return {
        task,
        preferLocal: false,
        costBias: "balanced",
        requireToolCalling: true,
        requireReasoning: false,
      };
  }
}
