import { z } from "zod";
import { LanguageModel } from "ai";
import { tool } from "ai";
import { getLogger } from "@/lib/logger";
import { DraftMissionPlanInputSchema, type DraftMissionPlanInput, type AgentStreamEvent } from "@/lib/agent/protocol";
import { type AgentToolDefinition, type ToolExecutionContext } from "@/lib/agent/tools";
import { streamAgentResponse } from "@/lib/llm";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const log = getLogger("AgentService");

// Cast tool to escape strict overload inference for v6 inputSchema API
const makeTool = tool as (args: unknown) => unknown;

export class PauseForApprovalError extends Error {
  constructor(message = "Paused for approval") {
    super(message);
    this.name = "PauseForApprovalError";
  }
}

export class PauseForQuestionError extends Error {
  constructor(message = "Paused for question") {
    super(message);
    this.name = "PauseForQuestionError";
  }
}

export interface AgentRunState {
  runId: string;
  sessionId: string;
  approvalState: "not_requested" | "pending" | "approved" | "rejected";
  messageHistory: Array<{ role: string; content: any; toolName?: string; toolCallId?: string }>;
  agentId: string;
  userMessage: string;
  modelId: string;
  system?: string;
  actorId?: string;
  seq: number;
  autoApproveReadOnly?: boolean;
  proposedPlan?: any;
  pendingPlanToolCallId?: string;
  pendingQuestionToolCallId?: string;
}

interface AgentServiceDeps {
  llm: { streamAgentResponse: typeof streamAgentResponse };
  tools: Record<string, AgentToolDefinition<unknown, unknown>>;
  runStore: { save(state: AgentRunState): Promise<void>; load(runId: string): Promise<AgentRunState | null> };
  eventBus: { emit(event: AgentStreamEvent): Promise<void> };
}

interface ApproveMissionPlanRequest {
  runId: string;
  approved: boolean;
  reviewerId: string;
  comment?: string;
}

function isCommandReadOnly(command: string): boolean {
  const readOnlyPrefixes = [
    "cat ", "ls ", "echo ", "pwd", "whoami", "hostname",
    "df ", "du ", "ps ", "systemctl status", "journalctl",
    "find ", "grep ", "head ", "tail ", "wc ", "stat ",
    "file ", "which ", "type ",
  ];
  const trimmed = command.trim();
  return readOnlyPrefixes.some((p) => trimmed.startsWith(p));
}

export class AgentService {
  constructor(private readonly deps: AgentServiceDeps) {}

  async startRun(input: {
    runId: string;
    sessionId: string;
    agentId: string;
    userMessage: string;
    model: LanguageModel;
    modelId: string;
    system: string;
    messages: AgentRunState["messageHistory"];
    actorId: string;
    autoApproveReadOnly?: boolean;
    abortSignal?: AbortSignal;
  }) {
    const state: AgentRunState = {
      runId: input.runId,
      sessionId: input.sessionId,
      approvalState: "not_requested",
      messageHistory: [
        ...input.messages,
        { role: "user", content: input.userMessage },
      ],
      agentId: input.agentId,
      userMessage: input.userMessage,
      modelId: input.modelId,
      system: input.system,
      actorId: input.actorId,
      seq: 0,
      autoApproveReadOnly: input.autoApproveReadOnly,
    };

    await this.deps.runStore.save(state);

    await this.emit(state, {
      type: "run_started",
      agentId: input.agentId,
      userMessage: input.userMessage,
      model: {
        provider: "unknown",
        modelId: input.modelId,
      },
    });

    await this.emit(state, { type: "run_status", status: "running" });

    await this.continueAgentLoop(state, {
      model: input.model,
      system: input.system,
      actorId: input.actorId,
      abortSignal: input.abortSignal,
    });
  }

  async approveMissionPlan(
    input: ApproveMissionPlanRequest & { abortSignal?: AbortSignal },
    model: LanguageModel,
    system?: string,
    actorId?: string,
  ) {
    const state = await this.deps.runStore.load(input.runId);
    if (!state) throw new Error("Run not found: " + input.runId);

    if (state.approvalState !== "pending") {
      throw new Error("Run is not waiting for approval");
    }

    if (!input.approved) {
      state.approvalState = "rejected";
      state.messageHistory.push({
        role: "tool",
        content: [{
          type: "tool-result",
          toolCallId: state.pendingPlanToolCallId ?? "",
          toolName: "draft_mission_plan",
          output: { type: "json", value: {
            approved: false,
            reviewerId: input.reviewerId,
            comment: input.comment,
          } },
        }],
      } as never);
      await this.deps.runStore.save(state);
      await this.emit(state, { type: "run_status", status: "cancelled" });
      return;
    }

    state.approvalState = "approved";
    state.messageHistory.push({
      role: "tool",
      content: [{
        type: "tool-result",
        toolCallId: state.pendingPlanToolCallId ?? "",
        toolName: "draft_mission_plan",
        output: { type: "json", value: {
          approved: true,
          reviewerId: input.reviewerId,
          comment: input.comment,
          plan: state.proposedPlan,
        } },
      }],
    } as never);
    await this.deps.runStore.save(state);

    await this.emit(state, { type: "run_status", status: "running" });

    await this.continueAgentLoop(state, {
      model,
      system: system ?? state.system ?? "",
      actorId: actorId ?? state.actorId ?? "",
      abortSignal: input.abortSignal,
    });
  }

  async replyToQuestion(
    input: { runId: string; answer: string; actorId: string; abortSignal?: AbortSignal },
    model: LanguageModel,
  ) {
    const state = await this.deps.runStore.load(input.runId);
    if (!state) throw new Error("Run not found: " + input.runId);

    if (!state.pendingQuestionToolCallId) {
      throw new Error("Run is not waiting for a question reply");
    }

    state.messageHistory.push({
      role: "tool",
      content: [{
        type: "tool-result",
        toolCallId: state.pendingQuestionToolCallId ?? "",
        toolName: "ask_user",
        output: { type: "json", value: { answer: input.answer } },
      }],
    } as never);

    state.pendingQuestionToolCallId = undefined;
    await this.deps.runStore.save(state);

    await this.emit(state, { type: "run_status", status: "running" });

    await this.continueAgentLoop(state, {
      model,
      system: state.system ?? "",
      actorId: input.actorId ?? state.actorId ?? "",
      abortSignal: input.abortSignal,
    });
  }

  /** Pass through ModelMessage[] - step.response.messages already returns the correct format
   * (tool-call parts use "input"; tool-result parts use "output: {type,value}"). */
  private toCoreMsgs(msgs: unknown[]): unknown[] {
    return msgs;
  }

  private async continueAgentLoop(
    state: AgentRunState,
    args: { model: LanguageModel; system: string; actorId: string; abortSignal?: AbortSignal },
  ) {
    const sdkTools = this.buildSdkTools(state, args.actorId);

    await this.deps.llm.streamAgentResponse({
      model: args.model,
      system: args.system,
      messages: state.messageHistory as never,
      tools: sdkTools,
      maxSteps: state.approvalState === "approved" ? 20 : 1,
      abortSignal: args.abortSignal,
      handlers: {
        onReasoningDelta: async (text, source) => {
          await this.emit(state, {
            type: "reasoning",
            reasoning: {
              id: `${state.runId}:reasoning:${state.seq}`,
              source,
              phase: "delta",
              text,
            },
          });
        },
        onTextDelta: async (text) => {
          await this.emit(state, {
            type: "assistant_message",
            message: {
              id: `${state.runId}:msg:${state.seq}`,
              role: "assistant",
              text,
            },
          });
        },
        onToolCall: async ({ callId, name, input }) => {
          const toolDef = this.deps.tools[name];
          await this.emit(state, {
            type: "tool_executing",
            tool: {
              callId,
              name,
              input,
              widgetHint: toolDef?.widgetHint,
            },
          });
        },
        onToolResult: async ({ callId, name, result }) => {
          await this.emit(state, {
            type: "tool_result",
            tool: { callId, name },
            result,
          });
        },
        onStepFinish: async (step) => {
          // AI SDK v6: step.messages does not exist; use step.response.messages
          const responseMessages: unknown[] = (step as any).response?.messages ?? [];
          if (state.approvalState === "pending") {
            // Only save the assistant tool-call message; the actual tool result will be
            // injected by approveMissionPlan with the human's approval decision.
            const assistantMessages = this.toCoreMsgs(responseMessages.filter((m: any) => m.role === "assistant"));
            state.messageHistory = [
              ...(state.messageHistory ?? []),
              ...assistantMessages,
            ] as never;
          } else if (state.pendingQuestionToolCallId) {
            // Only save the assistant tool-call message; replyToQuestion injects the actual answer.
            const assistantMsgs = this.toCoreMsgs(responseMessages.filter((m) => (m as any).role === "assistant"));
            state.messageHistory = [
              ...(state.messageHistory ?? []),
              ...assistantMsgs,
            ] as never;
          } else {
            state.messageHistory = [
              ...(state.messageHistory ?? []),
              ...this.toCoreMsgs(responseMessages),
            ] as never;
          }
          await this.deps.runStore.save(state);
        },
        onError: async (error) => {
          await this.emit(state, {
            type: "error",
            error: {
              code: "MODEL_STREAM_ERROR",
              message: error instanceof Error ? error.message : String(error),
              retryable: false,
              details: error,
            },
          });
        },
      },
    });

    if (state.approvalState === "pending" || state.pendingQuestionToolCallId) {
      return; // waiting for human input
    }
    await this.emit(state, { type: "run_status", status: "completed" });
  }

  private buildSdkTools(
    state: AgentRunState,
    actorId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Record<string, any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tools: Record<string, any> = {};

    // ask_user tool
    tools.ask_user = makeTool({
      description: "Ask the user a clarifying question when more information is needed to proceed.",
      inputSchema: z.object({ question: z.string() }),
      execute: async (input: { question: string }, options: { toolCallId: string; abortSignal?: AbortSignal }) => {
        const toolCallId = options.toolCallId ?? "";
        state.pendingQuestionToolCallId = toolCallId;
        await this.emit(state, {
          type: "agent_question",
          question: input.question,
        });
        await this.deps.runStore.save(state);
        return { ok: true, status: "awaiting_answer", message: "Question sent to user. Awaiting their reply." };
      },
    });

    // update_environment tool
    tools.update_environment = makeTool({
      description: "Update the current environment context (node, working directory, user).",
      inputSchema: z.object({
        node: z.string().optional(),
        cwd: z.string().optional(),
        user: z.string().optional(),
      }),
      execute: async (input: { node?: string; cwd?: string; user?: string }) => {
        await this.emit(state, {
          type: "environment_update",
          environment: {
            node: input.node,
            cwd: input.cwd,
            user: input.user,
          },
        });
        return { ok: true };
      },
    });

    // draft_mission_plan tool
    tools.draft_mission_plan = makeTool({
      description: "Propose the mission plan before any cluster-impacting tool may run.",
      inputSchema: DraftMissionPlanInputSchema,
      execute: async (input: DraftMissionPlanInput, options: { toolCallId: string; abortSignal?: AbortSignal }) => {
        const toolCallId = options.toolCallId ?? "";
        state.proposedPlan = input;
        state.pendingPlanToolCallId = toolCallId;
        state.approvalState = "pending";

        await this.emit(state, {
          type: "plan_proposed",
          plan: input,
          toolCallId,
        });
        await this.emit(state, {
          type: "approval_required",
          approval: {
            kind: "mission_plan",
            toolCallId,
            status: "pending",
          },
        });
        await this.emit(state, { type: "run_status", status: "waiting_for_approval" });
        await this.deps.runStore.save(state);
        return { ok: true, status: "awaiting_approval", message: "Mission plan proposed. Awaiting human approval before executing any commands." };
      },
    });

    // Cluster tools — only expose execution tools once approved.
    // Before approval, hide them so the model is forced to call draft_mission_plan.
    const showClusterTools = state.approvalState === "approved" || state.autoApproveReadOnly;
    for (const [name, toolDef] of Object.entries(this.deps.tools)) {
      if (!showClusterTools) continue;
      const capturedName = name;
      const capturedDef = toolDef;
      tools[capturedName] = makeTool({
        description: capturedDef.description,
        inputSchema: capturedDef.inputSchema as z.ZodType<unknown>,
        execute: async (input: unknown, options: { toolCallId: string; abortSignal?: AbortSignal }) => {
          const toolCallId = options.toolCallId ?? "";
          const abortSignal = options.abortSignal;

          const isReadOnly = typeof input === "object" && input !== null &&
            "command" in input && typeof (input as any).command === "string"
            ? isCommandReadOnly((input as any).command)
            : false;

          if (state.approvalState !== "approved" && !(state.autoApproveReadOnly && isReadOnly)) {
            throw new Error(`Tool ${capturedName} blocked until mission plan approval`);
          }

          const ctx: ToolExecutionContext = {
            runId: state.runId,
            sessionId: state.sessionId,
            actorId,
            signal: abortSignal,
            onStdout: async (chunk) => {
              await this.emit(state, {
                type: "tool_stdout",
                toolCallId,
                chunk,
              });
            },
            onStderr: async (chunk) => {
              await this.emit(state, {
                type: "tool_stderr",
                toolCallId,
                chunk,
              });
            },
          };

          const result = await capturedDef.execute(input, ctx);

          // tool_result is emitted via onToolResult handler in continueAgentLoop
          return result;
        },
      });
    }

    return tools;
  }

  private async emit(
    state: AgentRunState,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    event: any,
  ): Promise<void> {
    state.seq++;
    await this.deps.eventBus.emit({
      ...event,
      runId: state.runId,
      sessionId: state.sessionId,
      seq: state.seq,
      timestamp: new Date().toISOString(),
    } as AgentStreamEvent);
  }
}
