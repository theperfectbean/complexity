/**
 * Unified Agent Orchestration Route (Phase 1: Converged backend)
 *
 * Merges:
 * - v2 local-LLM tool loop (proven stable)
 * - Legacy AgentService run-state and approval semantics (richer state)
 * - New CommandRegistry for slash commands and intent classification
 * - Single event contract for /console UI
 *
 * UPDATE 2026-05-09: Eliminated hardcoded local Ollama/OpenAI dependencies.
 * Now uses the main Complexity model registry and pipeline.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUserOrApiToken } from '@/lib/auth-server';
import { getRedisClient } from '@/lib/redis';
import { buildAgentContext } from '@/lib/agent/v2/context/AgentContextPipeline';
import { createCommandApproval, createToolApproval, consumeApproval } from '@/lib/agent/v2/approval/ApprovalStore';
import { RedisUnifiedEventStore, RedisUnifiedRunStore } from '@/lib/agent/v2/unified/RunPersistence';
import { executeLegacyToolEnvelope, getLegacyToolManifest } from '@/lib/agent/v2/LegacyToolBridge';
import {
  CommandRegistry,
  parseSlashCommand,
  classifyNaturalLanguage,
  type ParsedCommand,
} from '@/lib/agent/v2/command';

// Complexity Core LLM Infrastructure
import { AgentService } from '@/lib/agent/core/AgentService';
import type { AgentStreamEvent } from '@/lib/agent/core/AgentEvents';
import { classifyProviderFailure, llmCall, streamUnifiedAgentLlm, summarizeConversation } from '@/lib/agent/core/AgentLlmAdapter';
import { LLMProviderError } from '@/lib/agent/core/AgentErrors';
import { applyAgentStateToUnified, mapAgentEventToConsoleEvent, toAgentRunState } from '@/lib/agent/core/UnifiedRouteAdapters';
import { dispatchSlashCommand as dispatchMetaCommand } from '@/lib/agent/meta';
import { getAgentSettings } from '@/lib/models/AgentSettings';
import { checkContextBudget, truncateMessages } from '@/lib/models/ContextWindowManager';
import { ModelRegistry } from '@/lib/models/ModelRegistry';
import { ModelRouter } from '@/lib/models/ModelRouter';
import type { ProviderModel } from '@/lib/models/ProviderModel';
import { classifyModelTask } from '@/lib/models/RoutingPolicy';
import { MODEL_SETTINGS_KEYS } from '@/lib/model-registry';
import { getDetailedSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SMART_KEYWORDS = /\b(design|architecture|compare|debug|plan|analyse|analyze|complex|explain in detail)\b/i;

type ToolCall = { id: string; function: { name: string; arguments: string } };

interface UnifiedRunState {
  runId: string;
  threadId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  status: 'in_progress' | 'paused_for_approval' | 'completed' | 'error' | 'cancelled';
  messages: object[];
  toolCallHistory: Array<{ tool: string; params: Record<string, unknown>; result?: unknown; error?: string }>;
  round: number;
  pendingApprovalId?: string;
  pendingQuestion?: { text: string; expectedType?: string };
  lastCommand?: ParsedCommand;
  commandMode: 'natural' | 'slash' | 'auto';
}

type ConsoleEvent =
  | { type: 'run_started'; userMessage: string; commandMode: string }
  | { type: 'run_status'; status: 'running' | 'waiting_for_approval' | 'completed' | 'cancelled' | 'error' }
  | { type: 'context'; domain: string; model: string; commandMode: string }
  | { type: 'command_parsed'; command: ParsedCommand; tier: string }
  | { type: 'text'; content: string; role?: 'assistant' | 'system' }
  | { type: 'tool_start'; tool: string; params: Record<string, unknown>; tier: number; toolCallId?: string }
  | { type: 'tool_result'; tool: string; result: unknown; tier: number }
  | { type: 'tool_error'; tool: string; error: string }
  | { type: 'destructive_confirm'; approvalId: string; command?: ParsedCommand; tool?: string; params?: Record<string, unknown>; message: string }
  | { type: 'question'; text: string; expectedType?: string }
  | { type: 'approval_decision'; approved: boolean }
  | { type: 'model_switched'; from: string; to: string; reason: string }
  | { type: 'context_summarized'; originalTokens: number; summaryTokens: number }
  | { type: 'error'; message: string }
  | { type: 'done' };

type PersistedConsoleEvent = ConsoleEvent & {
  runId: string;
  threadId: string;
  seq: number;
  timestamp: string;
};

/**
 * Selects a default model if none specified.
 * Defaults to the standard cloud haiku model for the console.
 */
function selectModel(message: string): string {
  if (SMART_KEYWORDS.test(message) || message.length > 600) {
      return "perplexity/sonar-pro";
  }
  return "perplexity/sonar";
}

function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

function parseToolCallsFromContent(content: string): ToolCall[] | null {
  const clean = content.trim();
  if (!clean.startsWith('{') && !clean.startsWith('[')) return null;
  try {
    let arr: Array<{ name: string; arguments?: Record<string, unknown> }> | null = null;
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) {
      arr = parsed;
    } else if (parsed.json && Array.isArray(parsed.json)) {
      arr = parsed.json;
    } else if (parsed.tool_calls && Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
      arr = parsed.tool_calls;
    }
    if (!arr || arr.length === 0) return null;
    return arr
      .filter((t) => typeof t.name === 'string')
      .map((t, i) => ({
        id: `fallback_${i}`,
        function: { name: t.name, arguments: JSON.stringify(t.arguments ?? {}) },
      }));
  } catch {
    return null;
  }
}

function extractAssistantResponse(content: string): string {
  const clean = content.trim();
  if (!clean.startsWith('{') && !clean.startsWith('[')) return content;
  try {
    const parsed = JSON.parse(clean);
    if (typeof parsed.assistant_response === 'string') return parsed.assistant_response;
    if (typeof parsed.response === 'string') return parsed.response;
    if (typeof parsed.answer === 'string') return parsed.answer;
    if (typeof parsed.message === 'string') return parsed.message;
    if (typeof parsed.text === 'string') return parsed.text;
    if (typeof parsed.name === 'string' && parsed.arguments && typeof parsed.arguments === 'object') {
      const args = parsed.arguments as Record<string, unknown>;
      const textVal = args.text ?? args.content ?? args.message ?? args.answer ?? args.response ?? args.output;
      if (typeof textVal === 'string' && textVal.length > 20) return textVal;
    }
  } catch { /* not JSON */ }
  return content;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractLatestUserMessage(messages: object[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const raw = messages[index];
    if (!isRecord(raw) || raw.role !== 'user') continue;
    if (typeof raw.content === 'string' && raw.content.trim().length > 0) {
      return raw.content;
    }
  }
  return null;
}

function toConsoleStatus(status: UnifiedRunState['status']): Extract<ConsoleEvent, { type: 'run_status' }>['status'] {
  switch (status) {
    case 'in_progress':
      return 'running';
    case 'paused_for_approval':
      return 'waiting_for_approval';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'error':
    default:
      return 'error';
  }
}

function makeRunState(
  userId: string,
  threadId: string,
  commandMode: 'auto' | 'slash' | 'natural',
  stateSnapshot?: Partial<UnifiedRunState>,
): UnifiedRunState {
  return {
    runId: stateSnapshot?.runId ?? `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    threadId,
    userId,
    createdAt: stateSnapshot?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'in_progress',
    messages: stateSnapshot?.messages ?? [],
    toolCallHistory: stateSnapshot?.toolCallHistory ?? [],
    round: stateSnapshot?.round ?? 0,
    pendingApprovalId: stateSnapshot?.pendingApprovalId,
    pendingQuestion: stateSnapshot?.pendingQuestion,
    lastCommand: stateSnapshot?.lastCommand,
    commandMode: (stateSnapshot?.commandMode ?? commandMode) as UnifiedRunState['commandMode'],
  };
}


const CONSOLE_ORIGIN = "*";
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': CONSOLE_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key',
  'Access-Control-Max-Age': '86400',
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authResult = await requireUserOrApiToken(req);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult.user.id;

  const {
    message,
    threadId,
    stateSnapshot,
    approvalId,
    commandMode = 'auto',
    modelId,
  } = await req.json() as {
    message: string;
    threadId?: string;
    stateSnapshot?: Partial<UnifiedRunState>;
    approvalId?: string;
    commandMode?: 'auto' | 'slash' | 'natural';
    modelId?: string;
  };

  const redis = getRedisClient();
  const runStore = new RedisUnifiedRunStore<UnifiedRunState>(redis);
  const eventStore = new RedisUnifiedEventStore<PersistedConsoleEvent>(redis);
  const effectiveThreadId = threadId ?? stateSnapshot?.threadId ?? `thread_${Date.now()}`;
  const isExplicitSlashInput = message.trim().startsWith('/');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const runState = makeRunState(userId, effectiveThreadId, commandMode, stateSnapshot);
      let seq = 0;
      let closed = false;
      const pendingWrites: Array<Promise<unknown>> = [];

      const queuePersist = (promise: Promise<unknown>) => {
        pendingWrites.push(promise);
      };

      const flushPersistence = async () => {
        if (pendingWrites.length === 0) return;
        const writes = pendingWrites.splice(0, pendingWrites.length);
        await Promise.allSettled(writes);
      };

      const persistRunState = () => {
        runState.updatedAt = new Date().toISOString();
        queuePersist(runStore.save(runState));
      };

      const emit = (event: ConsoleEvent) => {
        const persistedEvent: PersistedConsoleEvent = {
          ...event,
          runId: runState.runId,
          threadId: runState.threadId,
          seq: ++seq,
          timestamp: new Date().toISOString(),
        };
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(persistedEvent)}\n\n`));
        queuePersist(eventStore.append(runState.runId, persistedEvent));
      };

      const finish = (status: UnifiedRunState['status']) => {
        if (closed) return;
        runState.status = status;
        if (status !== 'paused_for_approval') {
          runState.pendingApprovalId = undefined;
        }
        persistRunState();
        emit({ type: 'run_status', status: toConsoleStatus(status) });
        emit({ type: 'done' });
        closed = true;
        controller.close();
        void flushPersistence();
      };

      const handleAbort = () => {
        if (closed) return;
        runState.status = 'cancelled';
        persistRunState();
        void flushPersistence();
      };
      req.signal.addEventListener('abort', handleAbort);

      try {
        persistRunState();
        emit({ type: 'run_started', userMessage: message, commandMode: runState.commandMode });
        emit({ type: 'run_status', status: 'running' });

        let forceSynthesis = false;
        let deferToAgentService = false;
        const agentSettings = await getAgentSettings();
        const modelSettings = await getDetailedSettings([...MODEL_SETTINGS_KEYS]);
        const modelRegistry = new ModelRegistry(modelSettings);
        const modelRouter = new ModelRouter(modelRegistry);
        let activeModel = modelId ?? agentSettings.defaultModel ?? selectModel(message);
        let activeProviderModel: ProviderModel | null = null;
        let activeFallbackChain: ProviderModel[] = [];

        const runAgentServiceLoop = async (input: {
          resumeModelId?: string;
          routingTask?: ReturnType<typeof classifyModelTask>;
          contextMessage: string;
          userMessage: string;
          resumeToolCall?: {
            toolName: string;
            params: Record<string, unknown>;
            toolCallId?: string;
          };
        }) => {
          const ctx = buildAgentContext(input.contextMessage, stateSnapshot);
          emit({ type: 'context', domain: ctx.domain, model: input.resumeModelId ?? activeModel, commandMode });

          const agentService = new AgentService({
            router: modelRouter,
            settings: agentSettings,
            listModels: async () => (await modelRegistry.list()).map((m) => ({ id: m.id, label: m.label, local: m.local })),
            getToolDefinitions: () => ctx.tools,
            executeTool: async (toolName, params, toolCtx) => {
              const executed = await executeLegacyToolEnvelope(toolName, (params ?? {}) as Record<string, unknown>, toolCtx.actorId, false);
              return executed.result;
            },
            getToolManifest: (toolName) => getLegacyToolManifest(toolName),
            streamLLM: streamUnifiedAgentLlm,
            summarize: async (messages) => summarizeConversation(messages as object[], agentSettings.fastModel, req.signal),
            requestToolApproval: async ({ state, toolName, params, toolCallId }) => createToolApproval(toolName, (params ?? {}) as Record<string, unknown>, userId, runState.threadId, { runId: state.runId, activeModelId: state.activeModelId, routingTask: state.routingTask, round: state.round, commandMode: state.commandMode, toolCallId, messages: state.messages.map((entry) => entry as Record<string, unknown>), toolCallHistory: state.toolCallHistory }),
          });

          const agentState = toAgentRunState(runState, input.resumeModelId ?? activeModel, input.routingTask ?? classifyModelTask(input.contextMessage));
          if (agentState.messages.length === 0 || agentState.messages[0]?.role !== 'system') {
            agentState.messages.unshift({ role: 'system', content: ctx.systemPrompt });
          }
          const runner = agentService.run({
            state: agentState,
            userMessage: input.userMessage,
            signal: req.signal,
            resumeToolCall: input.resumeToolCall,
          });

          let next = await runner.next();
          while (!next.done) {
            if (next.value.type !== 'run_status' && next.value.type !== 'done') {
              const mapped = mapAgentEventToConsoleEvent(next.value);
              if (mapped) {
                emit(mapped as ConsoleEvent);
              }
            }
            next = await runner.next();
          }

          const finalState = next.value;
          applyAgentStateToUnified(runState, finalState);

          if (finalState.status === 'waiting_for_approval') {
            await finish('paused_for_approval');
            return;
          }
          if (finalState.status === 'cancelled') {
            await finish('cancelled');
            return;
          }
          if (finalState.status === 'error') {
            await finish('error');
            return;
          }

          await finish('completed');
        };

        if (approvalId) {
          const approval = await consumeApproval(approvalId, userId, runState.threadId);
          if (!approval) {
            emit({ type: 'error', message: 'Approval request is invalid or has expired.' });
            await finish('error');
            return;
          }

          const userConfirmed = message.trim().toUpperCase() === 'CONFIRM';
          if (!userConfirmed) {
            emit({ type: 'text', content: 'Action cancelled.' });
            emit({ type: 'approval_decision', approved: false });
            await finish('cancelled');
            return;
          }
          emit({ type: 'approval_decision', approved: true });

          if (approval.kind === 'command') {
            emit({ type: 'text', content: `Executing: ${approval.command.action} ${approval.command.resource}...` });
            try {
              const cmdRegistry = new CommandRegistry();
              const cmdResult = await cmdRegistry.executeCommand(approval.command, userId, true);
              if (!cmdResult.success) {
                emit({ type: 'error', message: cmdResult.error ?? 'Command failed.' });
                await finish('error');
                return;
              }
              
              if (runState.commandMode === 'slash') {
                emit({
                  type: 'text',
                  content: typeof cmdResult.output === 'string'
                    ? cmdResult.output
                    : JSON.stringify(cmdResult.output, null, 2),
                  role: 'assistant',
                });
                await finish('completed');
                return;
              }
              runState.messages.push({
                role: 'user',
                content: `${message}

A command has already been executed successfully. Answer directly in plain English using this result and do not call any more tools.
Command: ${approval.command.action} ${approval.command.resource ?? ''}
Result:
${typeof cmdResult.output === 'string' ? cmdResult.output : JSON.stringify(cmdResult.output, null, 2)}`,
              });
              forceSynthesis = true;
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              emit({ type: 'error', message: errMsg });
              await finish('error');
              return;
            }
          } else {
            if (approval.resume) {
              runState.runId = approval.resume.runId;
              runState.messages = approval.resume.messages as object[];
              runState.toolCallHistory = approval.resume.toolCallHistory.map((entry) => ({ tool: entry.tool, params: entry.params, result: entry.result, error: entry.error }));
              runState.round = approval.resume.round;
              runState.commandMode = approval.resume.commandMode;
              runState.pendingApprovalId = undefined;
              await runAgentServiceLoop({
                resumeModelId: approval.resume.activeModelId,
                routingTask: approval.resume.routingTask,
                contextMessage: extractLatestUserMessage(runState.messages) ?? approval.tool.name,
                userMessage: '',
                resumeToolCall: {
                  toolName: approval.tool.name,
                  params: approval.tool.params,
                  toolCallId: approval.resume.toolCallId,
                },
              });
              return;
            }

            const approvedManifest = getLegacyToolManifest(approval.tool.name);
            emit({
              type: 'tool_start',
              tool: approval.tool.name,
              params: approval.tool.params,
              tier: approvedManifest?.riskTier ?? 3,
            });
            try {
              const executed = await executeLegacyToolEnvelope(approval.tool.name, approval.tool.params, userId, true);
              emit({
                type: 'tool_result',
                tool: approval.tool.name,
                result: executed.result,
                tier: executed.manifest.riskTier,
              });
              runState.messages.push({
                role: 'user',
                content: `${message}

A tool has already been executed successfully. Answer directly in plain English using this result and do not call any more tools.
Tool: ${approval.tool.name}
Result:
${JSON.stringify(executed.result, null, 2)}`,
              });
              forceSynthesis = true;
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              emit({ type: 'tool_error', tool: approval.tool.name, error: errMsg });
              await finish('error');
              return;
            }
          }
        } else {
          // Meta slash-command intercept (/model, /help, /clear, /status)
          // Falls through if unrecognised so existing infra command parsing continues unchanged.
          if (isExplicitSlashInput) {
            let availableModels: Array<{ id: string; label: string; local: boolean }> = [];
            try {
              const discovered = await modelRegistry.list();
              availableModels = discovered.map((m) => ({ id: m.id, label: m.label, local: m.local }));
            } catch { /* proceed with empty list on discovery failure */ }

            const metaResult = await dispatchMetaCommand(message, {
              runId: runState.runId,
              userId,
              threadId: effectiveThreadId,
              currentModelId: activeModel,
              availableModels,
            });

            if (metaResult.handled) {
              for (const evt of metaResult.events) {
                const persistedEvt = {
                  ...evt,
                  runId: runState.runId,
                  threadId: runState.threadId,
                  seq: ++seq,
                  timestamp: new Date().toISOString(),
                };
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(persistedEvt)}\n\n`));
                queuePersist(eventStore.append(runState.runId, persistedEvt as PersistedConsoleEvent));
              }
              if (metaResult.switchToModel) {
                activeModel = metaResult.switchToModel;
              }
              if (metaResult.done) {
                await finish('completed');
                return;
              }
            }
          }

          let parsedCommand: ParsedCommand | null = null;
          if (commandMode === 'slash' || commandMode === 'auto') {
            parsedCommand = parseSlashCommand(message);
          }
          if (parsedCommand && isExplicitSlashInput) {
            runState.commandMode = 'slash';
          }
          if (!parsedCommand && (commandMode === 'natural' || commandMode === 'auto')) {
            parsedCommand = classifyNaturalLanguage(message);
          }

          if (parsedCommand) {
            emit({ type: 'command_parsed', command: parsedCommand, tier: parsedCommand.tier });
            runState.lastCommand = parsedCommand;

            const cmdRegistry = new CommandRegistry();
            if (parsedCommand.requiresApproval) {
              const pendingId = await createCommandApproval(parsedCommand, userId, runState.threadId);
              runState.pendingApprovalId = pendingId;
              persistRunState();
              const confirmMsg = `Destructive action: \`${parsedCommand.action}\` on \`${parsedCommand.resource}\`. This cannot be undone. Reply \`CONFIRM\` to proceed or \`CANCEL\` to abort.`;
              emit({ type: 'destructive_confirm', approvalId: pendingId, command: parsedCommand, message: confirmMsg });
              await finish('paused_for_approval');
              return;
            }

            try {
              emit({
                type: 'tool_start',
                tool: `cmd:${parsedCommand.action}`,
                params: { resource: parsedCommand.resource, options: parsedCommand.options },
                tier: parsedCommand.tier === 'tier3' ? 3 : 0,
              });
              const cmdResult = await cmdRegistry.executeCommand(parsedCommand, userId, true);
              if (!cmdResult.success) {
                emit({ type: 'error', message: cmdResult.error ?? 'Command failed.' });
                await finish('error');
                return;
              }
              emit({
                type: 'tool_result',
                tool: `cmd:${parsedCommand.action}`,
                result: cmdResult.output,
                tier: parsedCommand.tier === 'tier3' ? 3 : 0,
              });

              if (runState.commandMode === 'slash') {
                emit({
                  type: 'text',
                  content: typeof cmdResult.output === 'string'
                    ? cmdResult.output
                    : JSON.stringify(cmdResult.output, null, 2),
                  role: 'assistant',
                });
                await finish('completed');
                return;
              }
              runState.messages.push({
                role: 'user',
                content: `${message}

A command has already been executed successfully. Answer directly in plain English using this result and do not call any more tools.
Command: ${parsedCommand.action} ${parsedCommand.resource ?? ''}
Result:
${typeof cmdResult.output === 'string' ? cmdResult.output : JSON.stringify(cmdResult.output, null, 2)}`,
              });
              forceSynthesis = true;
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              emit({ type: 'error', message: errMsg });
              await finish('error');
              return;
            }
          } else {
            deferToAgentService = true;
          }
        }

        if (deferToAgentService && !forceSynthesis) {
          await runAgentServiceLoop({
            contextMessage: message,
            userMessage: message,
          });
          return;
        }

        let routedModelId = activeModel;
        try {
          const route = await modelRouter.select({
            requestedModelId: activeModel,
            task: classifyModelTask(message),
            message,
          });
          activeProviderModel = route.model;
          activeFallbackChain = route.fallbackChain;
          routedModelId = route.model.id;
          if (routedModelId !== activeModel) {
            emit({ type: 'model_switched', from: activeModel, to: routedModelId, reason: 'task routing' });
          }
          activeModel = routedModelId;
        } catch (err) {
          emit({ type: 'error', message: err instanceof Error ? err.message : 'Model routing failed.' });
          await finish('error');
          return;
        }

        const ctx = buildAgentContext(message, stateSnapshot);
        emit({ type: 'context', domain: ctx.domain, model: activeModel, commandMode });

        const messages: object[] = runState.messages.length > 0
          ? [...runState.messages]
          : [{ role: 'system', content: ctx.systemPrompt }];

        const calledTools = new Set<string>();
        let encounteredError = false;

        for (let round = runState.round; round < 10; round++) {
          runState.round = round;
          const roundTools = forceSynthesis ? {} : ctx.tools;
          forceSynthesis = false;

          if (req.signal.aborted) {
            await finish('cancelled');
            return;
          }

          if (activeProviderModel) {
            const budget = checkContextBudget(activeProviderModel, messages as Array<{ role: string; content: unknown }>, agentSettings);
            if (budget.action !== 'ok') {
              if (budget.action === 'summarize') {
                const summary = await summarizeConversation(messages, agentSettings.fastModel, req.signal);
                const systemMessages = messages.filter((entry) => isRecord(entry) && entry.role === 'system');
                const recentMessages = messages.filter((entry) => isRecord(entry) && entry.role !== 'system').slice(-4);
                messages.splice(0, messages.length, ...systemMessages, { role: 'assistant', content: `[Context summary: ${summary}]` }, ...recentMessages);
                emit({
                  type: 'context_summarized',
                  originalTokens: budget.estimatedTokens,
                  summaryTokens: Math.ceil(summary.length / 4),
                });
              } else {
                const truncated = truncateMessages(activeProviderModel, messages as Array<{ role: string; content: unknown }>);
                messages.splice(0, messages.length, ...truncated);
              }
            }
          }

          let llmRes;
          try {
            llmRes = await modelRouter.withFallback(
              {
                model: activeProviderModel ?? { id: activeModel } as ProviderModel,
                fallbackChain: activeFallbackChain,
              },
              async (candidate) => {
                activeProviderModel = candidate;
                activeModel = candidate.id;
                try {
                  return await llmCall(messages, roundTools, candidate.id, req.signal);
                } catch (error) {
                  throw classifyProviderFailure(error);
                }
              },
              (from, to, reason) => {
                activeProviderModel = to;
                activeModel = to.id;
                activeFallbackChain = activeFallbackChain.filter((candidate) => candidate.id !== to.id);
                emit({ type: 'model_switched', from: from.id, to: to.id, reason });
              },
            );
          } catch (err) {
            emit({ type: 'error', message: err instanceof Error ? err.message : 'LLM error' });
            encounteredError = true;
            break;
          }

          const completion = await llmRes.json() as {
            choices: Array<{
              finish_reason: string;
              message: { role: string; content?: string | null; tool_calls?: ToolCall[] };
            }>;
          };

          const choice = completion.choices[0];
          if (!choice) break;

          const msg = choice.message;

          if (msg.content) {
            msg.content = stripThinking(msg.content);
            msg.content = extractAssistantResponse(msg.content);
          }

          if ((!msg.tool_calls || msg.tool_calls.length === 0) && msg.content) {
            const fallbackCalls = parseToolCallsFromContent(msg.content);
            if (fallbackCalls && fallbackCalls.length > 0) {
              msg.tool_calls = fallbackCalls;
              msg.content = '';
            }
          }

          messages.push(msg);

          if (msg.content) {
            emit({ type: 'text', content: msg.content, role: 'assistant' });
          }

          if (!msg.tool_calls || msg.tool_calls.length === 0) break;

          const toolResults: object[] = [];
          let anyDuplicate = false;
          let allUnknown = true;
          for (const tc of msg.tool_calls) {
            const toolName = tc.function.name;
            let params: Record<string, unknown> = {};
            try { params = JSON.parse(tc.function.arguments); } catch { /* empty */ }

            const callKey = `${toolName}:${tc.function.arguments}`;
            if (calledTools.has(callKey)) { anyDuplicate = true; break; }
            calledTools.add(callKey);

            const manifest = getLegacyToolManifest(toolName);
            const tierNum = manifest?.riskTier ?? 1;

            if (manifest?.requiresApproval) {
              const pendingId = await createToolApproval(toolName, params, userId, runState.threadId);
              runState.pendingApprovalId = pendingId;
              runState.messages = messages;
              persistRunState();
              const confirmMsg = `I need to execute \`${toolName}\` with params: \`${JSON.stringify(params)}\`. This is a **destructive** action. Reply \`CONFIRM\` to proceed or \`CANCEL\` to abort.`;
              emit({ type: 'destructive_confirm', approvalId: pendingId, tool: toolName, params, message: confirmMsg });
              await finish('paused_for_approval');
              return;
            }

            emit({ type: 'tool_start', tool: toolName, params, tier: tierNum });

            try {
              const executed = await executeLegacyToolEnvelope(toolName, params, userId, false);
              emit({ type: 'tool_result', tool: toolName, result: executed.result, tier: executed.manifest.riskTier });
              toolResults.push({ tool_call_id: tc.id, role: 'tool', content: JSON.stringify(executed.result) });
              runState.toolCallHistory.push({ tool: toolName, params, result: executed.result });
              allUnknown = false;
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              emit({ type: 'tool_error', tool: toolName, error: errMsg });
              toolResults.push({ tool_call_id: tc.id, role: 'tool', content: `Error: ${errMsg}` });
              runState.toolCallHistory.push({ tool: toolName, params, error: errMsg });
            }
          }

          messages.push(...toolResults);
          runState.messages = messages;
          persistRunState();
          if (anyDuplicate) break;
          if (allUnknown && toolResults.length > 0) break;
          if (toolResults.length > 0) forceSynthesis = true;
        }

        runState.messages = messages;
        persistRunState();
        await finish(encounteredError ? 'error' : 'completed');
      } catch (err) {
        if (req.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
          await finish('cancelled');
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        emit({ type: 'error', message: msg });
        await finish('error');
      } finally {
        req.signal.removeEventListener('abort', handleAbort);
        if (!closed) {
          await flushPersistence();
          closed = true;
          controller.close();
        }
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      ...CORS_HEADERS,
    },
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authResult = await requireUserOrApiToken(req);
  if (authResult instanceof NextResponse) return authResult;
  const userId = authResult.user.id;
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get('runId');
  const threadId = searchParams.get('threadId');

  if (!runId && !threadId) {
    return NextResponse.json({ error: 'runId or threadId is required' }, { status: 400 });
  }

  const redis = getRedisClient();
  const runStore = new RedisUnifiedRunStore<UnifiedRunState>(redis);
  const eventStore = new RedisUnifiedEventStore<PersistedConsoleEvent>(redis);
  const state = runId ? await runStore.load(runId) : await runStore.loadLatestByThread(threadId!);

  if (!state) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
  if (state.userId !== userId) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }

  const events = await eventStore.getAll(state.runId);
  return NextResponse.json({ ok: true, state, events });
}
