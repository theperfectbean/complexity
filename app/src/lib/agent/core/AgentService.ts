/**
 * AgentService: ReAct loop state machine.
 *
 * Responsibilities:
 * - Intercept slash commands before LLM
 * - Check context window budget and summarize/truncate if needed
 * - Route to the best available model with fallback chain
 * - Stream LLM output as SSE events
 * - Execute tools with approval gate (halt on requiresApproval)
 * - Emit normalized ToolResultEnvelope events
 * - Manage round limit and terminal status transitions
 *
 * This is a STUB implementation that establishes the interface and
 * flow for wiring into the unified route in a later phase.
 * It delegates heavy lifting to existing helpers (ModelRouter,
 * ContextWindowManager, ToolResultNormalizer) to remain backward-compatible.
 */

import type { AgentRunState, ModelTask } from "./AgentState";
import { transitionState } from "./AgentState";
import type { AgentStreamEvent } from "./AgentEvents";
import {
  makeStatusEvent,
  makeErrorEvent,
  makeToolResultEvent,
} from "./AgentEvents";
import {
  AgentMaxRoundsError,
  ApprovalRequiredError,
  LLMProviderError,
} from "./AgentErrors";
import type { AgentSettings } from "../../models/AgentSettings";
import { checkContextBudget, truncateMessages } from "../../models/ContextWindowManager";
import type { ProviderModel } from "../../models/ProviderModel";
import type { ModelRouter, ModelRoute } from "../../models/ModelRouter";
import { dispatchSlashCommand } from "../meta/SlashCommandRegistry";
import { evaluateApproval, buildApprovalRequestEvent } from "../approval/ApprovalGate";
import { normalizeToolResult, makeErrorEnvelope } from "../tools/ToolResultNormalizer";
import type { WidgetHint } from "../tools/BaseTool";

export interface AgentServiceDeps {
  router: ModelRouter;
  settings: AgentSettings;
  /** Callback to get available models for slash command ctx */
  listModels: () => Promise<Array<{ id: string; label: string; local: boolean }>>;
  /** Tool executor: takes tool name + parsed params, returns raw result */
  executeTool: (
    toolName: string,
    params: unknown,
    ctx: { runId: string; threadId: string; actorId: string },
  ) => Promise<unknown>;
  /** Get tool manifest by name */
  getToolManifest: (name: string) => {
    riskTier: 0 | 1 | 2 | 3;
    requiresApproval: boolean;
    readOnly: boolean;
    name: string;
    widgetHint: WidgetHint;
  } | null;
  /** LLM call — yields AgentStreamEvents from the provider */
  streamLLM: (
    modelId: string,
    messages: Array<{ role: string; content: unknown }>,
    tools: unknown,
    signal?: AbortSignal,
  ) => AsyncIterable<AgentStreamEvent>;
  /** Tool definitions or provider tool map exposed to the LLM */
  getToolDefinitions?: () => unknown;
  /** Optional: summarize conversation with a fast model */
  summarize?: (
    messages: Array<{ role: string; content: unknown }>,
  ) => Promise<string>;
  /** Persist a pending tool approval and return the durable approval id */
  requestToolApproval?: (input: {
    state: AgentRunState;
    toolName: string;
    params: unknown;
    toolCallId?: string;
    suggestedApprovalId: string;
  }) => Promise<string>;
}

export interface AgentServiceInput {
  state: AgentRunState;
  userMessage: string;
  signal?: AbortSignal;
  resumeToolCall?: {
    toolName: string;
    params: unknown;
    toolCallId?: string;
  };
}

export type AgentServiceOutput = AsyncGenerator<AgentStreamEvent, AgentRunState, unknown>;

export class AgentService {
  constructor(private readonly deps: AgentServiceDeps) {}

  async *run(input: AgentServiceInput): AgentServiceOutput {
    let state = input.state;
    const { userMessage, signal, resumeToolCall } = input;

    // ── 1. Slash command interception ─────────────────────────────
    if (userMessage.trim().startsWith("/")) {
      const availableModels = await this.deps.listModels();
      const slashResult = await dispatchSlashCommand(userMessage, {
        runId: state.runId,
        userId: state.userId,
        threadId: state.threadId,
        currentModelId: state.activeModelId,
        availableModels,
      });

      if (slashResult.handled) {
        for (const event of slashResult.events) {
          yield event;
        }
        if (slashResult.switchToModel) {
          state = { ...state, activeModelId: slashResult.switchToModel };
        }
        if (slashResult.done) {
          state = transitionState(state, "completed");
          return state;
        }
        return state;
      }
    }

    // ── 2. Route to model ─────────────────────────────────────────
    let route: ModelRoute;
    try {
      const routingMessage = userMessage.trim().length > 0
        ? userMessage
        : ([...state.messages].reverse().find((message) => message.role === "user" && typeof message.content === "string")?.content as string | undefined) ?? "";
      route = await this.deps.router.select({
        requestedModelId: state.activeModelId,
        task: state.routingTask as ModelTask,
        message: routingMessage,
      });
      if (route.model.id !== state.activeModelId) {
        yield {
          type: "model_switched",
          from: state.activeModelId,
          to: route.model.id,
          reason: "task routing",
        };
      }
      state = { ...state, activeModelId: route.model.id };
    } catch (err) {
      yield makeErrorEvent(
        err instanceof Error ? err.message : "Model routing failed",
        "routing_error",
        false,
      );
      return transitionState(state, "error");
    }

    // ── 3. Context window budget ──────────────────────────────────
    const messages = resumeToolCall ? [...state.messages] : [...state.messages, { role: "user", content: userMessage }];
    const budget = checkContextBudget(route.model as ProviderModel, messages, this.deps.settings);

    if (budget.action !== "ok") {
      if (budget.action === "summarize" && this.deps.summarize) {
        yield makeStatusEvent("summarizing_context");
        const summary = await this.deps.summarize(messages);
        const compressed = resumeToolCall
          ? [
              messages[0],
              { role: "assistant", content: `[Context summary: ${summary}]` },
            ]
          : [
              messages[0],
              { role: "assistant", content: `[Context summary: ${summary}]` },
              { role: "user", content: userMessage },
            ];
        yield {
          type: "context_summarized",
          originalTokens: budget.estimatedTokens,
          summaryTokens: Math.ceil(summary.length / 4),
        };
        messages.splice(0, messages.length, ...compressed);
      } else {
        const truncated = truncateMessages(route.model as ProviderModel, messages);
        messages.splice(0, messages.length, ...truncated);
      }
    }

    // ── 4. ReAct loop ─────────────────────────────────────────────
    let round = state.round;
    const maxRounds = this.deps.settings.maxAgentRounds;
    const toolDefinitions = this.deps.getToolDefinitions?.() ?? [];


    if (resumeToolCall) {
      const manifest = this.deps.getToolManifest(resumeToolCall.toolName);
      yield {
        type: "tool_start",
        tool: resumeToolCall.toolName,
        params: resumeToolCall.params,
        tier: manifest?.riskTier ?? 1,
        toolCallId: resumeToolCall.toolCallId,
      };

      try {
        const raw = await this.deps.executeTool(resumeToolCall.toolName, resumeToolCall.params, {
          runId: state.runId,
          threadId: state.threadId,
          actorId: state.userId,
        });
        const envelope = normalizeToolResult(resumeToolCall.toolName, raw, manifest?.widgetHint);
        yield makeToolResultEvent(resumeToolCall.toolName, envelope, manifest?.riskTier);
        messages.push({
          role: "tool",
          tool_call_id: resumeToolCall.toolCallId ?? "approved_tool_call",
          content: JSON.stringify({ toolName: resumeToolCall.toolName, result: envelope }),
        } as { role: string; content: unknown });
        state.toolCallHistory.push({
          tool: resumeToolCall.toolName,
          params: (resumeToolCall.params ?? {}) as Record<string, unknown>,
          result: envelope,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        yield { type: "tool_error", tool: resumeToolCall.toolName, error: msg };
        const errEnvelope = makeErrorEnvelope(resumeToolCall.toolName, msg);
        messages.push({
          role: "tool",
          tool_call_id: resumeToolCall.toolCallId ?? "approved_tool_call",
          content: JSON.stringify({ toolName: resumeToolCall.toolName, result: errEnvelope }),
        } as { role: string; content: unknown });
        state.toolCallHistory.push({
          tool: resumeToolCall.toolName,
          params: (resumeToolCall.params ?? {}) as Record<string, unknown>,
          error: msg,
          timestamp: new Date().toISOString(),
        });
      }
    }

    while (round < maxRounds) {
      if (signal?.aborted) {
        state = transitionState(state, "cancelled");
        yield makeStatusEvent("cancelled");
        return state;
      }

      round++;
      const pendingToolCalls: Array<{ id: string; toolName: string; params: unknown }> = [];
      let assistantText = "";

      // Stream LLM response
      try {
        for await (const event of this.deps.streamLLM(route.model.id, messages, toolDefinitions, signal)) {
          yield event;

          if (event.type === "text" && event.role !== "system") {
            assistantText += event.content;
          }
          if (event.type === "tool_start") {
            pendingToolCalls.push({
              id: event.toolCallId ?? String(pendingToolCalls.length),
              toolName: event.tool,
              params: event.params,
            });
          }
          if (event.type === "done") break;
        }
      } catch (err) {
        if (
          err instanceof LLMProviderError &&
          err.retryable &&
          route.fallbackChain.length > 0
        ) {
          const next = route.fallbackChain[0];
          yield { type: "model_switched", from: route.model.id, to: next.id, reason: err.message };
          route = { model: next, fallbackChain: route.fallbackChain.slice(1) };
          continue;
        }
        yield makeErrorEvent(
          err instanceof Error ? err.message : "LLM error",
          err instanceof LLMProviderError ? err.kind : "llm_error",
          err instanceof LLMProviderError ? err.retryable : false,
        );
        return transitionState(state, "error");
      }

      if (assistantText.length > 0 || pendingToolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: assistantText,
          ...(pendingToolCalls.length > 0
            ? {
                tool_calls: pendingToolCalls.map((call) => ({
                  id: call.id,
                  function: {
                    name: call.toolName,
                    arguments: JSON.stringify(call.params ?? {}),
                  },
                })),
              }
            : {}),
        } as { role: string; content: unknown });
      }

      // No tool calls → done
      if (pendingToolCalls.length === 0) {
        break;
      }

      // ── 5. Tool execution with approval gate ──────────────────
      for (const call of pendingToolCalls) {
        const manifest = this.deps.getToolManifest(call.toolName);

        if (manifest) {
          const decision = evaluateApproval(manifest as Parameters<typeof evaluateApproval>[0], this.deps.settings);

          if (!decision.proceed && decision.approvalId) {
            const approvalId = this.deps.requestToolApproval
              ? await this.deps.requestToolApproval({
                  state,
                  toolName: call.toolName,
                  params: call.params,
                  toolCallId: call.id,
                  suggestedApprovalId: decision.approvalId,
                })
              : decision.approvalId;

            state = {
              ...state,
              messages,
              round,
              pendingApproval: {
                approvalId,
                kind: "tool",
                toolName: call.toolName,
                params: call.params,
              },
            };
            state = transitionState(state, "waiting_for_approval");
            yield makeStatusEvent("waiting_for_approval");
            yield buildApprovalRequestEvent(
              call.toolName,
              call.params,
              approvalId,
              manifest.riskTier,
            ) as AgentStreamEvent;
            return state;
          }
        }

        try {
          const raw = await this.deps.executeTool(call.toolName, call.params, {
            runId: state.runId,
            threadId: state.threadId,
            actorId: state.userId,
          });
          const envelope = normalizeToolResult(call.toolName, raw, manifest?.widgetHint);
          yield makeToolResultEvent(call.toolName, envelope, manifest?.riskTier);

          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ toolName: call.toolName, result: envelope }),
          } as { role: string; content: unknown });
          state.toolCallHistory.push({
            tool: call.toolName,
            params: (call.params ?? {}) as Record<string, unknown>,
            result: envelope,
            timestamp: new Date().toISOString(),
          });
        } catch (err) {
          if (err instanceof ApprovalRequiredError) throw err;
          const msg = err instanceof Error ? err.message : String(err);
          yield { type: "tool_error", tool: call.toolName, error: msg };
          const errEnvelope = makeErrorEnvelope(call.toolName, msg);
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ toolName: call.toolName, result: errEnvelope }),
          } as { role: string; content: unknown });
          state.toolCallHistory.push({
            tool: call.toolName,
            params: (call.params ?? {}) as Record<string, unknown>,
            error: msg,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }

    if (round >= maxRounds) {
      yield makeErrorEvent(
        new AgentMaxRoundsError(maxRounds).message,
        "max_rounds",
        false,
      );
      return transitionState(state, "error");
    }

    state = { ...state, messages, round };
    state = transitionState(state, "completed");
    yield makeStatusEvent("completed");
    yield { type: "done" };

    return state;
  }
}
