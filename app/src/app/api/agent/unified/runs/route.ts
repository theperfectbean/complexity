/**
 * Unified Agent Orchestration Route (Phase 1: Converged backend)
 *
 * Merges:
 * - v2 local-LLM tool loop (proven stable)
 * - Legacy AgentService run-state and approval semantics (richer state)
 * - New CommandRegistry for slash commands and intent classification
 * - Single event contract for /console UI
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireUserOrApiToken } from '@/lib/auth-server';
import { getRedisClient } from '@/lib/redis';
import { buildAgentContext } from '@/lib/agent/v2/context/AgentContextPipeline';
import { executeTool } from '@/lib/agent/v2/ToolRegistry';
import { evaluateToolRisk } from '@/lib/agent/v2/policy/RiskPolicy';
import { createCommandApproval, createToolApproval, consumeApproval } from '@/lib/agent/v2/approval/ApprovalStore';
import { RedisUnifiedEventStore, RedisUnifiedRunStore } from '@/lib/agent/v2/unified/RunPersistence';
import {
  CommandRegistry,
  parseSlashCommand,
  classifyNaturalLanguage,
  type ParsedCommand,
} from '@/lib/agent/v2/command';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCAL_OPENAI_BASE = process.env.LOCAL_OPENAI_BASE_URL ?? 'http://192.168.0.107:4000/v1';
const LOCAL_OPENAI_KEY = process.env.LOCAL_OPENAI_API_KEY ?? 'sk-complexity-local';
const MODEL_DEFAULT = process.env.LOCAL_MODEL_DEFAULT ?? 'default';
const MODEL_SMART = process.env.LOCAL_MODEL_SMART ?? 'smart';

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
  | { type: 'tool_start'; tool: string; params: Record<string, unknown>; tier: number }
  | { type: 'tool_result'; tool: string; result: unknown; tier: number }
  | { type: 'tool_error'; tool: string; error: string }
  | { type: 'destructive_confirm'; approvalId: string; command?: ParsedCommand; tool?: string; params?: Record<string, unknown>; message: string }
  | { type: 'question'; text: string; expectedType?: string }
  | { type: 'approval_decision'; approved: boolean }
  | { type: 'error'; message: string }
  | { type: 'done' };

type PersistedConsoleEvent = ConsoleEvent & {
  runId: string;
  threadId: string;
  seq: number;
  timestamp: string;
};

function selectModel(message: string): string {
  return SMART_KEYWORDS.test(message) || message.length > 600 ? MODEL_SMART : MODEL_DEFAULT;
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
    if (typeof parsed.name === 'string' && typeof parsed.status === 'string') {
      const { name, status, ip, node } = parsed as Record<string, string>;
      return `${name} is ${status}${ip ? ` at ${ip}` : ''}${node ? ` on ${node}` : ''}.`;
    }
    const keys = Object.keys(parsed);
    if (keys.length === 1 && Array.isArray(parsed[keys[0]])) {
      const arr = parsed[keys[0]] as Array<Record<string, string>>;
      if (arr.length > 0 && typeof arr[0] === 'object') {
        return arr.map((item) =>
          Object.entries(item).map(([k, v]) => `${k}: ${v}`).join(', ')
        ).join('\n');
      }
    }
  } catch { /* not JSON */ }
  return content;
}

async function llmCall(messages: object[], tools: object[], model: string, signal?: AbortSignal): Promise<Response> {
  const body: Record<string, unknown> = { model, messages, stream: false, think: false };
  if (tools.length > 0) body.tools = tools;
  return fetch(`${LOCAL_OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LOCAL_OPENAI_KEY}`,
    },
    body: JSON.stringify(body),
  });
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
  } = await req.json() as {
    message: string;
    threadId?: string;
    stateSnapshot?: Partial<UnifiedRunState>;
    approvalId?: string;
    commandMode?: 'auto' | 'slash' | 'natural';
  };

  const redis = getRedisClient();
  const runStore = new RedisUnifiedRunStore<UnifiedRunState>(redis);
  const eventStore = new RedisUnifiedEventStore<PersistedConsoleEvent>(redis);
  const effectiveThreadId = threadId ?? stateSnapshot?.threadId ?? `thread_${Date.now()}`;

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

      const finish = async (status: UnifiedRunState['status']) => {
        if (closed) return;
        runState.status = status;
        if (status !== 'paused_for_approval') {
          runState.pendingApprovalId = undefined;
        }
        persistRunState();
        emit({ type: 'run_status', status: toConsoleStatus(status) });
        emit({ type: 'done' });
        await flushPersistence();
        closed = true;
        controller.close();
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
                runState.toolCallHistory.push({
                  tool: `cmd:${approval.command.action}`,
                  params: { resource: approval.command.resource, options: approval.command.options },
                  error: cmdResult.error ?? 'Command failed.',
                });
                await finish('error');
                return;
              }
              emit({
                type: 'text',
                content: typeof cmdResult.output === 'string'
                  ? cmdResult.output
                  : JSON.stringify(cmdResult.output, null, 2),
                role: 'assistant',
              });
              runState.toolCallHistory.push({
                tool: `cmd:${approval.command.action}`,
                params: { resource: approval.command.resource, options: approval.command.options },
                result: cmdResult.output,
              });
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              emit({ type: 'error', message: errMsg });
              runState.toolCallHistory.push({
                tool: `cmd:${approval.command.action}`,
                params: { resource: approval.command.resource, options: approval.command.options },
                error: errMsg,
              });
              await finish('error');
              return;
            }
          } else {
            emit({ type: 'tool_start', tool: approval.tool.name, params: approval.tool.params, tier: 3 });
            try {
              const { result } = await executeTool(approval.tool.name, approval.tool.params, userId, true);
              emit({
                type: 'tool_result',
                tool: approval.tool.name,
                result,
                tier: 3,
              });
              runState.toolCallHistory.push({
                tool: approval.tool.name,
                params: approval.tool.params,
                result,
              });
              emit({
                type: 'text',
                content: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                role: 'assistant',
              });
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              emit({ type: 'tool_error', tool: approval.tool.name, error: errMsg });
              runState.toolCallHistory.push({
                tool: approval.tool.name,
                params: approval.tool.params,
                error: errMsg,
              });
              emit({ type: 'error', message: errMsg });
              await finish('error');
              return;
            }
          }

          persistRunState();
          await finish('completed');
          return;
        }

        let parsedCommand: ParsedCommand | null = null;
        if (commandMode === 'slash' || commandMode === 'auto') {
          parsedCommand = parseSlashCommand(message);
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
            emit({
              type: 'destructive_confirm',
              approvalId: pendingId,
              command: parsedCommand,
              message: confirmMsg,
            });
            emit({ type: 'text', content: confirmMsg });
            await finish('paused_for_approval');
            return;
          }

          try {
            emit({
              type: 'tool_start',
              tool: `cmd:${parsedCommand.action}`,
              params: { resource: parsedCommand.resource, options: parsedCommand.options },
              tier: parsedCommand.tier === 'tier3' ? 3 : parsedCommand.tier === 'tier2' ? 2 : parsedCommand.tier === 'tier1' ? 1 : 0,
            });
            const cmdResult = await cmdRegistry.executeCommand(parsedCommand, userId, true);
            if (!cmdResult.success) {
              emit({
                type: 'tool_error',
                tool: `cmd:${parsedCommand.action}`,
                error: cmdResult.error ?? 'Command failed.',
              });
              emit({ type: 'error', message: cmdResult.error ?? 'Command failed.' });
              runState.toolCallHistory.push({
                tool: `cmd:${parsedCommand.action}`,
                params: { resource: parsedCommand.resource, options: parsedCommand.options },
                error: cmdResult.error ?? 'Command failed.',
              });
              await finish('error');
              return;
            }
            emit({
              type: 'tool_result',
              tool: `cmd:${parsedCommand.action}`,
              result: cmdResult.output,
              tier: parsedCommand.tier === 'tier3' ? 3 : parsedCommand.tier === 'tier2' ? 2 : parsedCommand.tier === 'tier1' ? 1 : 0,
            });
            emit({
              type: 'text',
              content: typeof cmdResult.output === 'string'
                ? cmdResult.output
                : JSON.stringify(cmdResult.output, null, 2),
              role: 'assistant',
            });
            runState.toolCallHistory.push({
              tool: `cmd:${parsedCommand.action}`,
              params: { resource: parsedCommand.resource, options: parsedCommand.options },
              result: cmdResult.output,
            });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            emit({
              type: 'tool_error',
              tool: `cmd:${parsedCommand.action}`,
              error: errMsg,
            });
            emit({ type: 'error', message: errMsg });
            runState.toolCallHistory.push({
              tool: `cmd:${parsedCommand.action}`,
              params: { resource: parsedCommand.resource, options: parsedCommand.options },
              error: errMsg,
            });
            await finish('error');
            return;
          }

          persistRunState();
          await finish('completed');
          return;
        }

        const ctx = buildAgentContext(message, stateSnapshot);
        const model = selectModel(message);
        emit({ type: 'context', domain: ctx.domain, model, commandMode });

        const messages: object[] = runState.messages.length > 0
          ? [...runState.messages]
          : [{ role: 'system', content: ctx.systemPrompt }];

        messages.push({ role: 'user', content: message });

        const calledTools = new Set<string>();
        let forceSynthesis = false;
        let encounteredError = false;

        for (let round = runState.round; round < 10; round++) {
          runState.round = round;
          const roundTools = forceSynthesis ? [] : ctx.tools;
          forceSynthesis = false;

          if (req.signal.aborted) {
            await finish('cancelled');
            return;
          }

          const llmRes = await llmCall(messages, roundTools, model, req.signal);
          if (!llmRes.ok) {
            const errText = await llmRes.text();
            emit({ type: 'error', message: `LLM error ${llmRes.status}: ${errText.slice(0, 200)}` });
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
              msg.content = null;
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

            const decision = evaluateToolRisk(toolName);
            const tierNum = decision.tier;

            if (decision.requiresConfirm) {
              const pendingId = await createToolApproval(toolName, params, userId, runState.threadId);
              runState.pendingApprovalId = pendingId;
              runState.messages = messages;
              persistRunState();
              const confirmMsg = `I need to execute \`${toolName}\` with params: \`${JSON.stringify(params)}\`. This is a **destructive** action (tier 3). Reply \`CONFIRM\` to proceed or \`CANCEL\` to abort.`;
              emit({
                type: 'destructive_confirm',
                approvalId: pendingId,
                tool: toolName,
                params,
                message: confirmMsg,
              });
              emit({ type: 'text', content: confirmMsg });
              await finish('paused_for_approval');
              return;
            }

            emit({ type: 'tool_start', tool: toolName, params, tier: tierNum });
            emit({ type: 'text', content: `Executing ${toolName}...` });

            try {
              const { result } = await executeTool(toolName, params, userId, false);
              emit({ type: 'tool_result', tool: toolName, result, tier: tierNum });
              toolResults.push({ tool_call_id: tc.id, role: 'tool', content: JSON.stringify(result) });
              runState.toolCallHistory.push({ tool: toolName, params, result });
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
