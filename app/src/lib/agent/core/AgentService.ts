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
  makeToolStartEvent,
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
import { waitForApproval } from "../approval/ApprovalQueue";
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
    tools: unknown[],
    signal?: AbortSignal,
  ) => AsyncIterable<AgentStreamEvent>;
  /** Optional: summarize conversation with a fast model */
  summarize?: (
    messages: Array<{ role: string; content: unknown }>,
  ) => Promise<string>;
}

export interface AgentServiceInput {
  state: AgentRunState;
  userMessage: string;
  signal?: AbortSignal;
}

export type AgentServiceOutput = AsyncGenerator<AgentStreamEvent, AgentRunState, unknown>;

export class AgentService {
  constructor(private readonly deps: AgentServiceDeps) {}

  async *run(input: AgentServiceInput): AgentServiceOutput {
    let state = input.state;
    const { userMessage, signal } = input;

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
      route = await this.deps.router.select({
        requestedModelId: state.activeModelId,
        task: state.routingTask as ModelTask,
        message: userMessage,
      });
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
    const messages = [...state.messages, { role: "user", content: userMessage }];
    const budget = checkContextBudget(route.model as ProviderModel, messages, this.deps.settings);

    if (budget.action !== "ok") {
      if (budget.action === "summarize" && this.deps.summarize) {
        yield makeStatusEvent("summarizing_context");
        const summary = await this.deps.summarize(messages);
        const compressed = [
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

    while (round < maxRounds) {
      if (signal?.aborted) {
        state = transitionState(state, "cancelled");
        yield makeStatusEvent("cancelled");
        return state;
      }

      round++;
      const pendingToolCalls: Array<{ id: string; toolName: string; params: unknown }> = [];

      // Stream LLM response
      try {
        for await (const event of this.deps.streamLLM(route.model.id, messages, [], signal)) {
          yield event;

          if (event.type === "tool_start") {
            pendingToolCalls.push({
              id: String(pendingToolCalls.length),
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
            state = transitionState(state, "waiting_for_approval");
            yield makeStatusEvent("waiting_for_approval");
            yield buildApprovalRequestEvent(
              call.toolName,
              call.params,
              decision.approvalId,
              manifest.riskTier,
            ) as AgentStreamEvent;

            let approvalResult;
            try {
              approvalResult = await waitForApproval(decision.approvalId);
            } catch {
              yield makeErrorEvent(
                `Approval timed out for tool "${call.toolName}"`,
                "approval_timeout",
                false,
              );
              return transitionState(state, "error");
            }

            if (!approvalResult.approved) {
              yield { type: "approval_decision", approved: false };
              const denialMessage = 'Tool "' + call.toolName + '" was denied by the user.';
              yield {
                type: "text",
                content: denialMessage,
                role: "assistant",
              };
              messages.push({ role: "assistant", content: denialMessage });
              state = { ...state, messages, round };
              state = transitionState(state, "cancelled");
              yield makeStatusEvent("cancelled");
              yield { type: "done" };
              return state;
            }

            yield { type: "approval_decision", approved: true };
            state = transitionState(state, "running");
          }
        }

        yield makeToolStartEvent(call.toolName, call.params, manifest?.riskTier ?? 1);

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
            content: JSON.stringify({ toolName: call.toolName, result: envelope }),
          });
        } catch (err) {
          if (err instanceof ApprovalRequiredError) throw err;
          const msg = err instanceof Error ? err.message : String(err);
          yield { type: "tool_error", tool: call.toolName, error: msg };
          const errEnvelope = makeErrorEnvelope(call.toolName, msg);
          messages.push({
            role: "tool",
            content: JSON.stringify({ toolName: call.toolName, result: errEnvelope }),
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
