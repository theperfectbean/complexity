import { NextRequest, NextResponse } from 'next/server';
import { requireUserOrApiToken } from '@/lib/auth-server';
import { buildAgentContext } from '@/lib/agent/v2/context/AgentContextPipeline';
import { executeTool, getToolEntry } from '@/lib/agent/v2/ToolRegistry';
import { evaluateToolRisk } from '@/lib/agent/v2/policy/RiskPolicy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCAL_OPENAI_BASE = process.env.LOCAL_OPENAI_BASE_URL ?? 'http://192.168.0.107:4000/v1';
const LOCAL_OPENAI_KEY  = process.env.LOCAL_OPENAI_API_KEY ?? 'sk-complexity-local';
const MODEL_DEFAULT     = process.env.LOCAL_MODEL_DEFAULT ?? 'default';
const MODEL_SMART       = process.env.LOCAL_MODEL_SMART ?? 'smart';

const SMART_KEYWORDS = /\b(design|architecture|compare|debug|plan|analyse|analyze|complex|explain in detail)\b/i;

type ToolCall = { id: string; function: { name: string; arguments: string } };

function selectModel(message: string): string {
  return SMART_KEYWORDS.test(message) || message.length > 600 ? MODEL_SMART : MODEL_DEFAULT;
}

/** Strip <think>...</think> blocks from model output */
function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

/**
 * Some models return tool calls or responses as JSON in content.
 * Formats seen:
 *   - {"json":[{"name":"x","arguments":{}}]}   (gemma4 tool calls)
 *   - [{"name":"x","arguments":{}}]            (plain array)
 *   - {"assistant_response":"text","tool_calls":[]} (qwen3.5 final answer)
 * Returns tool calls if found, or null if this looks like a plain answer.
 */
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
    // Exclude qwen-style {"assistant_response":"..."} — those are final answers, not tool calls
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

/**
 * Qwen3.5 sometimes wraps final answers in JSON objects instead of plain text.
 * Detect and extract/format into readable text.
 */
function extractAssistantResponse(content: string): string {
  const clean = content.trim();
  if (!clean.startsWith('{') && !clean.startsWith('[')) return content;
  try {
    const parsed = JSON.parse(clean);
    // Named text response keys
    if (typeof parsed.assistant_response === 'string') return parsed.assistant_response;
    if (typeof parsed.response === 'string') return parsed.response;
    if (typeof parsed.answer === 'string') return parsed.answer;
    if (typeof parsed.message === 'string') return parsed.message;
    if (typeof parsed.text === 'string') return parsed.text;
    // Generic tool-as-response pattern: model wraps its answer in a fake tool call.
    // Matches any {name: "...", arguments: {text/content/message/answer: "<prose>"}}
    // where the text value is clearly a natural language response (>20 chars).
    if (typeof parsed.name === 'string' && parsed.arguments && typeof parsed.arguments === 'object') {
      const args = parsed.arguments as Record<string, unknown>;
      const textVal = args.text ?? args.content ?? args.message ?? args.answer ?? args.response ?? args.output;
      if (typeof textVal === 'string' && textVal.length > 20) return textVal;
    }
    // Infrastructure data objects (e.g. {"node":"nas","name":"dns","status":"RUNNING",...})
    if (typeof parsed.name === 'string' && typeof parsed.status === 'string') {
      const { name, status, ip, node } = parsed as Record<string, string>;
      return `${name} is ${status}${ip ? ` at ${ip}` : ''}${node ? ` on ${node}` : ''}.`;
    }
    // Single-key object where value is an array
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

  const { message, threadId, stateSnapshot, pendingConfirm } = await req.json() as {
    message: string;
    threadId?: string;
    stateSnapshot?: object;
    pendingConfirm?: { tool: string; params: Record<string, unknown> };
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        // Handle pending destructive confirmation
        if (pendingConfirm) {
          const userConfirmed = message.trim().toUpperCase() === 'CONFIRM';
          if (!userConfirmed) {
            emit({ type: 'text', content: 'Action cancelled.' });
            controller.close();
            return;
          }
          emit({ type: 'tool_start', tool: pendingConfirm.tool, params: pendingConfirm.params });
          const { result } = await executeTool(pendingConfirm.tool, pendingConfirm.params);
          emit({ type: 'tool_result', tool: pendingConfirm.tool, result });
          emit({ type: 'text', content: `Done. Executed \`${pendingConfirm.tool}\`.` });
          emit({ type: 'done' });
          controller.close();
          return;
        }

        const ctx = buildAgentContext(message, stateSnapshot);
        const model = selectModel(message);
        emit({ type: 'context', domain: ctx.domain, model });

        const messages: object[] = [
          { role: 'system', content: ctx.systemPrompt },
          { role: 'user', content: message },
        ];

        // Agentic loop — up to 10 rounds
        const calledTools = new Set<string>(); // deduplicate: stop if same tool+args called again
        let forceSynthesis = false; // set true after tool results to force no-tool synthesis round
        for (let round = 0; round < 10; round++) {
          // After executing tools, call without tools to force a synthesis response
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

          // Strip thinking tags from content
          if (msg.content) {
            msg.content = stripThinking(msg.content);
            // Extract plain text from qwen-style JSON answer wrappers
            msg.content = extractAssistantResponse(msg.content);
          }

          // Fallback: parse tool calls from content when model returns them as JSON text
          if ((!msg.tool_calls || msg.tool_calls.length === 0) && msg.content) {
            const fallbackCalls = parseToolCallsFromContent(msg.content);
            if (fallbackCalls && fallbackCalls.length > 0) {
              msg.tool_calls = fallbackCalls;
              msg.content = null;
            }
          }

          messages.push(msg);

          if (msg.content) {
            emit({ type: 'text', content: msg.content });
          }

          if (!msg.tool_calls || msg.tool_calls.length === 0) break;

          // Process tool calls
          const toolResults: object[] = [];
          let anyDuplicate = false;
          let allUnknown = true;
          for (const tc of msg.tool_calls) {
            const toolName = tc.function.name;
            let params: Record<string, unknown> = {};
            try { params = JSON.parse(tc.function.arguments); } catch { /* empty params */ }

            // Deduplicate: if this exact tool+args was already executed, skip the whole loop
            const callKey = `${toolName}:${tc.function.arguments}`;
            if (calledTools.has(callKey)) { anyDuplicate = true; break; }
            calledTools.add(callKey);

            const decision = evaluateToolRisk(toolName);

            if (decision.requiresConfirm) {
              const confirmMsg = `I need to execute \`${toolName}\` with params: \`${JSON.stringify(params)}\`. This is a **destructive** action (tier 3). Reply \`CONFIRM\` to proceed or \`CANCEL\` to abort.`;
              emit({ type: 'destructive_confirm', tool: toolName, params, message: confirmMsg });
              emit({ type: 'text', content: confirmMsg });
              emit({ type: 'done' });
              controller.close();
              return;
            }

            emit({ type: 'tool_start', tool: toolName, params, tier: decision.tier });
            if (decision.emitNotification) {
              emit({ type: 'notification', message: `Executing ${toolName}`, tier: decision.tier });
            }

            try {
              const { result } = await executeTool(toolName, params);
              emit({ type: 'tool_result', tool: toolName, result, tier: decision.tier });
              toolResults.push({ tool_call_id: tc.id, role: 'tool', content: JSON.stringify(result) });
              allUnknown = false;
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              emit({ type: 'tool_error', tool: toolName, error: errMsg });
              toolResults.push({ tool_call_id: tc.id, role: 'tool', content: `Error: ${errMsg}` });
            }
          }

          messages.push(...toolResults);
          if (anyDuplicate) break; // model is looping — stop
          if (allUnknown && toolResults.length > 0) break; // model called non-existent tools — stop
          // Force next round to synthesize without tools
          if (toolResults.length > 0) forceSynthesis = true;
        }

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
