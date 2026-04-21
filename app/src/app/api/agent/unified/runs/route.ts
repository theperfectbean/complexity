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
import { buildAgentContext } from '@/lib/agent/v2/context/AgentContextPipeline';
import { ToolRegistry, executeTool, getToolEntry } from '@/lib/agent/v2/ToolRegistry';
import { evaluateToolRisk } from '@/lib/agent/v2/policy/RiskPolicy';
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

/**
 * Unified run state combining old AgentService semantics with new v2 tool loop
 */
interface UnifiedRunState {
  runId: string;
  threadId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  status: 'in_progress' | 'paused_for_approval' | 'completed' | 'error' | 'cancelled';
  
  // v2 loop state
  messages: object[];
  toolCallHistory: Array<{ tool: string; params: Record<string, unknown>; result?: unknown; error?: string }>;
  round: number;
  
  // Approval/question state
  pendingConfirm?: { tool: string; params: Record<string, unknown> };
  pendingQuestion?: { text: string; expectedType?: string };
  
  // Command routing
  lastCommand?: ParsedCommand;
  commandMode: 'natural' | 'slash' | 'auto';
}

/**
 * Event contract for /console UI (unified across all modes)
 */
type ConsoleEvent = 
  | { type: 'context'; domain: string; model: string; commandMode: string }
  | { type: 'command_parsed'; command: ParsedCommand; tier: string }
  | { type: 'text'; content: string; role?: 'assistant' | 'system' }
  | { type: 'tool_start'; tool: string; params: Record<string, unknown>; tier: number }
  | { type: 'tool_result'; tool: string; result: unknown; tier: number }
  | { type: 'tool_error'; tool: string; error: string }
  | { type: 'destructive_confirm'; tool: string; params: Record<string, unknown>; message: string }
  | { type: 'question'; text: string; expectedType?: string }
  | { type: 'approval_decision'; approved: boolean }
  | { type: 'error'; message: string }
  | { type: 'done' };

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

async function llmCall(messages: object[], tools: object[], model: string): Promise<Response> {
  const body: Record<string, unknown> = { model, messages, stream: false, think: false };
  if (tools.length > 0) body.tools = tools;
  return fetch(`${LOCAL_OPENAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LOCAL_OPENAI_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authResult = await requireUserOrApiToken(req);
  if (authResult instanceof NextResponse) return authResult;

  const {
    message,
    threadId,
    stateSnapshot,
    pendingConfirm,
    commandMode = 'auto',
  } = await req.json() as {
    message: string;
    threadId?: string;
    stateSnapshot?: Partial<UnifiedRunState>;
    pendingConfirm?: { tool: string; params: Record<string, unknown> };
    commandMode?: 'auto' | 'slash' | 'natural';
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: ConsoleEvent) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        // Initialize run state
        const runState: UnifiedRunState = {
          runId: `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          threadId: threadId || `thread_${Date.now()}`,
          userId: 'default_user', // TODO: extract from authResult
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'in_progress',
          messages: stateSnapshot?.messages ?? [],
          toolCallHistory: stateSnapshot?.toolCallHistory ?? [],
          round: stateSnapshot?.round ?? 0,
          commandMode: commandMode as 'natural' | 'slash' | 'auto',
        };

        // Handle pending destructive confirmation
        if (pendingConfirm) {
          const userConfirmed = message.trim().toUpperCase() === 'CONFIRM';
          if (!userConfirmed) {
            emit({ type: 'text', content: 'Action cancelled.' });
            emit({ type: 'approval_decision', approved: false });
            emit({ type: 'done' });
            controller.close();
            return;
          }

          emit({ type: 'tool_start', tool: pendingConfirm.tool, params: pendingConfirm.params, tier: 3 });
          try {
            const { result } = await executeTool(pendingConfirm.tool, pendingConfirm.params);
            emit({ type: 'tool_result', tool: pendingConfirm.tool, result, tier: 3 });
            emit({ type: 'approval_decision', approved: true });
            emit({ type: 'text', content: `Done. Executed \`${pendingConfirm.tool}\`.` });
            runState.toolCallHistory.push({
              tool: pendingConfirm.tool,
              params: pendingConfirm.params,
              result,
            });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            emit({ type: 'tool_error', tool: pendingConfirm.tool, error: errMsg });
            runState.toolCallHistory.push({
              tool: pendingConfirm.tool,
              params: pendingConfirm.params,
              error: errMsg,
            });
          }
          emit({ type: 'done' });
          controller.close();
          return;
        }

        // Try to parse as command first
        let parsedCommand: ParsedCommand | null = null;
        if (commandMode === 'slash' || commandMode === 'auto') {
          parsedCommand = parseSlashCommand(message);
        }
        if (!parsedCommand && (commandMode === 'natural' || commandMode === 'auto')) {
          parsedCommand = classifyNaturalLanguage(message);
        }

        // If we got a command, execute via CommandRegistry
        if (parsedCommand) {
          emit({ type: 'command_parsed', command: parsedCommand, tier: parsedCommand.tier });
          runState.lastCommand = parsedCommand;

          const toolRegistry = new ToolRegistry();
          const cmdRegistry = new CommandRegistry(toolRegistry);

          // Check if approval is needed
          if (parsedCommand.requiresApproval) {
            const confirmMsg = `Destructive action: \`${parsedCommand.action}\` on \`${parsedCommand.resource}\`. This cannot be undone. Reply \`CONFIRM\` to proceed or \`CANCEL\` to abort.`;
            emit({
              type: 'destructive_confirm',
              tool: `cmd:${parsedCommand.action}`,
              params: { resource: parsedCommand.resource, options: parsedCommand.options },
              message: confirmMsg,
            });
            emit({ type: 'text', content: confirmMsg });
            emit({ type: 'done' });
            controller.close();
            return;
          }

          // Execute the command
          try {
            const cmdResult = await cmdRegistry.executeCommand(parsedCommand, runState.userId, true);
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
            emit({ type: 'error', message: errMsg });
            runState.toolCallHistory.push({
              tool: `cmd:${parsedCommand.action}`,
              params: { resource: parsedCommand.resource, options: parsedCommand.options },
              error: errMsg,
            });
          }
          emit({ type: 'done' });
          controller.close();
          return;
        }

        // Fall back to agentic loop (natural language without command parsing)
        const ctx = buildAgentContext(message, stateSnapshot);
        const model = selectModel(message);
        emit({ type: 'context', domain: ctx.domain, model, commandMode });

        const messages: object[] = runState.messages.length > 0
          ? runState.messages
          : [{ role: 'system', content: ctx.systemPrompt }];

        messages.push({ role: 'user', content: message });

        const calledTools = new Set<string>();
        let forceSynthesis = false;
        for (let round = runState.round; round < 10; round++) {
          runState.round = round;
          const roundTools = forceSynthesis ? [] : ctx.tools;
          forceSynthesis = false;

          const llmRes = await llmCall(messages, roundTools, model);
          if (!llmRes.ok) {
            const errText = await llmRes.text();
            emit({ type: 'error', message: `LLM error ${llmRes.status}: ${errText.slice(0, 200)}` });
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

            if (decision.requiresConfirm) {
              const confirmMsg = `I need to execute \`${toolName}\` with params: \`${JSON.stringify(params)}\`. This is a **destructive** action (tier 3). Reply \`CONFIRM\` to proceed or \`CANCEL\` to abort.`;
              emit({
                type: 'destructive_confirm',
                tool: toolName,
                params,
                message: confirmMsg,
              });
              emit({ type: 'text', content: confirmMsg });
              emit({ type: 'done' });
              controller.close();
              return;
            }

            emit({ type: 'tool_start', tool: toolName, params, tier: decision.tier });
            if (decision.emitNotification) {
              emit({ type: 'text', content: `Executing ${toolName}...` });
            }

            try {
              const { result } = await executeTool(toolName, params);
              emit({ type: 'tool_result', tool: toolName, result, tier: decision.tier });
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
          if (anyDuplicate) break;
          if (allUnknown && toolResults.length > 0) break;
          if (toolResults.length > 0) forceSynthesis = true;
        }

        runState.messages = messages;
        runState.status = 'completed';
        runState.updatedAt = new Date().toISOString();
        emit({ type: 'done' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        emit({ type: 'error', message: msg });
      } finally {
        controller.close();
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
