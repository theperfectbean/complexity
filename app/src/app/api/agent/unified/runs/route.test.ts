import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-server', () => ({
  requireUserOrApiToken: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn(),
}));

vi.mock('@/lib/agent/v2/context/AgentContextPipeline', () => ({
  buildAgentContext: vi.fn(),
}));

vi.mock('@/lib/agent/v2/approval/ApprovalStore', () => ({
  createCommandApproval: vi.fn(),
  createToolApproval: vi.fn(),
  consumeApproval: vi.fn(),
}));

vi.mock('@/lib/agent/v2/LegacyToolBridge', () => ({
  executeLegacyToolEnvelope: vi.fn(),
  getLegacyToolManifest: vi.fn(),
}));

vi.mock('@/lib/agent/v2/command', () => ({
  CommandRegistry: vi.fn().mockImplementation(() => ({ executeCommand: vi.fn() })),
  parseSlashCommand: vi.fn(),
  classifyNaturalLanguage: vi.fn(),
}));

vi.mock('@/lib/agent/meta', () => ({
  dispatchSlashCommand: vi.fn(async () => ({ handled: false, events: [], done: false })),
}));

vi.mock('@/lib/models/AgentSettings', () => ({
  getAgentSettings: vi.fn(),
}));

vi.mock('@/lib/settings', () => ({
  getDetailedSettings: vi.fn(),
}));

vi.mock('@/lib/models/ModelDiscovery', () => ({
  discoverModels: vi.fn(),
}));

vi.mock('@/lib/llm', () => ({
  getLanguageModel: vi.fn(),
  getProviderRequestOptions: vi.fn(),
}));

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

import { requireUserOrApiToken } from '@/lib/auth-server';
import { getRedisClient } from '@/lib/redis';
import { buildAgentContext } from '@/lib/agent/v2/context/AgentContextPipeline';
import { createToolApproval, consumeApproval } from '@/lib/agent/v2/approval/ApprovalStore';
import { executeLegacyToolEnvelope, getLegacyToolManifest } from '@/lib/agent/v2/LegacyToolBridge';
import { parseSlashCommand, classifyNaturalLanguage } from '@/lib/agent/v2/command';
import { getAgentSettings } from '@/lib/models/AgentSettings';
import { getDetailedSettings } from '@/lib/settings';
import { discoverModels } from '@/lib/models/ModelDiscovery';
import { getLanguageModel, getProviderRequestOptions } from '@/lib/llm';
import { generateText } from 'ai';
import { createPostRequest } from '@/test/test-utils';
import { POST } from '@/app/api/agent/unified/runs/route';

type RedisMock = {
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  rpush: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  lrange: ReturnType<typeof vi.fn>;
  eval: ReturnType<typeof vi.fn>;
};

const kv = new Map<string, string>();
const lists = new Map<string, string[]>();

function makeRedis(): RedisMock {
  return {
    set: vi.fn(async (key: string, value: string) => {
      kv.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => kv.get(key) ?? null),
    rpush: vi.fn(async (key: string, value: string) => {
      const current = lists.get(key) ?? [];
      current.push(value);
      lists.set(key, current);
      return current.length;
    }),
    expire: vi.fn(async () => 1),
    lrange: vi.fn(async (key: string) => lists.get(key) ?? []),
    eval: vi.fn(async (_script: string, _keyCount: number, key: string, expectedRaw: string) => {
      const current = kv.get(key);
      if (current !== expectedRaw) return 0;
      kv.delete(key);
      return 1;
    }),
  };
}

function parseEvents(payload: string) {
  return payload
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice(6)) as { type: string; [key: string]: unknown });
}

const model = {
  id: 'perplexity/sonar',
  providerId: 'perplexity',
  providerModelId: 'sonar',
  label: 'Sonar',
  category: 'chat',
  capabilities: {
    streaming: true,
    toolCalling: true,
    reasoning: false,
    local: false,
    imageInput: false,
  },
  limits: { contextTokens: 200000 },
  costTier: 'cheap',
  availability: 'available',
  local: false,
};
const fallbackModel = {
  ...model,
  id: 'openai/gpt-4o-mini',
  providerId: 'openai',
  providerModelId: 'gpt-4o-mini',
  label: 'GPT-4o mini',
};

describe('/api/agent/unified/runs', () => {
  beforeEach(() => {
    kv.clear();
    lists.clear();
    vi.clearAllMocks();

    vi.mocked(requireUserOrApiToken).mockResolvedValue({ user: { id: 'user-1', email: 'user@example.com' } } as never);
    vi.mocked(getRedisClient).mockReturnValue(makeRedis() as never);
    vi.mocked(buildAgentContext).mockReturnValue({
      domain: 'homelab',
      systemPrompt: 'Homelab system prompt',
      tools: { pve_list: {}, pve_stop: {} },
    } as never);
    vi.mocked(parseSlashCommand).mockReturnValue(null);
    vi.mocked(classifyNaturalLanguage).mockReturnValue(null);
    vi.mocked(getAgentSettings).mockResolvedValue({
      defaultModel: 'perplexity/sonar',
      heavyModel: 'perplexity/sonar-pro',
      fastModel: 'perplexity/sonar',
      autoApproveReads: true,
      maxAgentRounds: 5,
      contextStrategy: 'rolling_summary',
      contextUtilizationThreshold: 0.8,
      providerFallbacks: {},
    } as never);
    vi.mocked(getDetailedSettings).mockResolvedValue({} as never);
    vi.mocked(discoverModels).mockResolvedValue({ models: [model, fallbackModel] } as never);
    vi.mocked(getLanguageModel).mockResolvedValue({ provider: 'mock' } as never);
    vi.mocked(getProviderRequestOptions).mockResolvedValue({ providerOptions: {} } as never);
    vi.mocked(createToolApproval).mockResolvedValue('approval-1');
    vi.mocked(consumeApproval).mockResolvedValue(null);
    vi.mocked(executeLegacyToolEnvelope).mockImplementation(async (toolName: string) => ({
      result: { ok: true, toolName },
      manifest: toolName === 'pve_stop'
        ? { riskTier: 3, requiresApproval: true, readOnly: false, name: 'pve_stop', widgetHint: { type: 'command_result' } }
        : { riskTier: 0, requiresApproval: false, readOnly: true, name: 'pve_list', widgetHint: { type: 'table' } },
    }) as never);
    vi.mocked(getLegacyToolManifest).mockImplementation((toolName: string) => {
      if (toolName === 'pve_stop') {
        return { riskTier: 3, requiresApproval: true, readOnly: false, name: 'pve_stop', widgetHint: { type: 'command_result' } } as never;
      }
      return { riskTier: 0, requiresApproval: false, readOnly: true, name: 'pve_list', widgetHint: { type: 'table' } } as never;
    });
  });

  it('injects system prompt and preserves toolCallId through a non-command unified run without duplicate tool_start events', async () => {
    const llmCalls: Array<unknown[]> = [];
    vi.mocked(generateText)
      .mockImplementationOnce(async (options: { messages: unknown[] }) => {
        llmCalls.push(options.messages);
        return {
          text: '',
          toolCalls: [{ toolCallId: 'call-1', toolName: 'pve_list', args: { node: 'node01' } }],
        } as never;
      })
      .mockImplementationOnce(async (options: { messages: unknown[] }) => {
        llmCalls.push(options.messages);
        return { text: 'final answer', toolCalls: [] } as never;
      });

    const response = await POST(createPostRequest('http://localhost/api/agent/unified/runs', {
      message: 'show containers',
      threadId: 'thread-1',
      commandMode: 'auto',
    }) as never);

    expect(response.status).toBe(200);
    const events = parseEvents(await response.text());

    expect(llmCalls[0]?.[0]).toMatchObject({ role: 'system', content: 'Homelab system prompt' });
    expect(llmCalls[1]?.find((message: { role?: string }) => message.role === 'tool')).toMatchObject({
      role: 'tool',
      content: [expect.objectContaining({ toolCallId: 'call-1' })],
    });
    expect(events.filter((event) => event.type === 'tool_start')).toHaveLength(1);
    expect(events.some((event) => event.type === 'tool_result')).toBe(true);
    expect(events.some((event) => event.type === 'text' && event.content === 'final answer')).toBe(true);
  });

  it('resumes an approved agent tool call from durable approval payload without needing client stateSnapshot', async () => {
    const llmCalls: Array<unknown[]> = [];
    vi.mocked(generateText)
      .mockImplementationOnce(async (options: { messages: unknown[] }) => {
        llmCalls.push(options.messages);
        return {
          text: '',
          toolCalls: [{ toolCallId: 'call-stop-1', toolName: 'pve_stop', args: { container: 'plex' } }],
        } as never;
      })
      .mockImplementationOnce(async (options: { messages: unknown[] }) => {
        llmCalls.push(options.messages);
        return { text: 'approval resumed', toolCalls: [] } as never;
      });

    const firstResponse = await POST(createPostRequest('http://localhost/api/agent/unified/runs', {
      message: 'stop plex',
      threadId: 'thread-1',
      commandMode: 'auto',
    }) as never);
    const firstEvents = parseEvents(await firstResponse.text());

    expect(firstEvents.some((event) => event.type === 'destructive_confirm')).toBe(true);
    expect(firstEvents.some((event) => event.type === 'run_status' && event.status === 'waiting_for_approval')).toBe(true);

    const resumePayload = vi.mocked(createToolApproval).mock.calls[0]?.[4];
    expect(resumePayload).toMatchObject({
      activeModelId: 'perplexity/sonar',
      routingTask: 'chat',
      toolCallId: 'call-stop-1',
    });

    vi.mocked(consumeApproval).mockResolvedValue({
      kind: 'tool',
      ownerId: 'user-1',
      threadId: 'thread-1',
      tool: { name: 'pve_stop', params: { container: 'plex' } },
      resume: resumePayload,
    } as never);

    const secondResponse = await POST(createPostRequest('http://localhost/api/agent/unified/runs', {
      message: 'CONFIRM',
      threadId: 'thread-1',
      approvalId: 'approval-1',
      commandMode: 'auto',
    }) as never);
    const secondEvents = parseEvents(await secondResponse.text());

    expect(llmCalls[1]?.find((message: { role?: string }) => message.role === 'tool')).toMatchObject({
      role: 'tool',
      content: [expect.objectContaining({ toolCallId: 'call-stop-1' })],
    });
    expect(secondEvents.some((event) => event.type === 'approval_decision' && event.approved === true)).toBe(true);
    expect(secondEvents.filter((event) => event.type === 'tool_start')).toHaveLength(1);
    expect(secondEvents.some((event) => event.type === 'tool_result')).toBe(true);
    expect(secondEvents.some((event) => event.type === 'text' && event.content === 'approval resumed')).toBe(true);
  });

  it('falls back to the next model when the first AgentService LLM attempt is retryable', async () => {
    vi.mocked(generateText)
      .mockImplementationOnce(async () => {
        throw new Error('429 rate limit from provider');
      })
      .mockImplementationOnce(async () => ({ text: 'fallback succeeded', toolCalls: [] } as never));

    const response = await POST(createPostRequest('http://localhost/api/agent/unified/runs', {
      message: 'summarize node status',
      threadId: 'thread-1',
      commandMode: 'auto',
    }) as never);

    expect(response.status).toBe(200);
    const events = parseEvents(await response.text());

    expect(events.some((event) =>
      event.type === 'model_switched'
      && event.from === 'perplexity/sonar'
      && event.to === 'openai/gpt-4o-mini')).toBe(true);
    expect(events.some((event) => event.type === 'text' && event.content === 'fallback succeeded')).toBe(true);
  });

  it('returns a terminal error when an approval id is invalid or expired', async () => {
    vi.mocked(consumeApproval).mockResolvedValue(null);

    const response = await POST(createPostRequest('http://localhost/api/agent/unified/runs', {
      message: 'CONFIRM',
      threadId: 'thread-1',
      approvalId: 'missing-approval',
      commandMode: 'auto',
    }) as never);

    const events = parseEvents(await response.text());
    expect(events.some((event) => event.type === 'error' && String(event.message).includes('invalid or has expired'))).toBe(true);
    expect(events.some((event) => event.type === 'run_status' && event.status === 'error')).toBe(true);
  });

  it('cancels a pending approval without executing the stored tool call', async () => {
    vi.mocked(consumeApproval).mockResolvedValue({
      kind: 'tool',
      ownerId: 'user-1',
      threadId: 'thread-1',
      tool: { name: 'pve_stop', params: { container: 'plex' } },
      resume: {
        runId: 'run-1',
        activeModelId: 'perplexity/sonar',
        routingTask: 'chat',
        round: 1,
        commandMode: 'auto',
        toolCallId: 'call-stop-1',
        messages: [],
        toolCallHistory: [],
      },
    } as never);

    const response = await POST(createPostRequest('http://localhost/api/agent/unified/runs', {
      message: 'CANCEL',
      threadId: 'thread-1',
      approvalId: 'approval-1',
      commandMode: 'auto',
    }) as never);

    const events = parseEvents(await response.text());
    expect(events.some((event) => event.type === 'approval_decision' && event.approved === false)).toBe(true);
    expect(events.some((event) => event.type === 'run_status' && event.status === 'cancelled')).toBe(true);
    expect(events.some((event) => event.type === 'tool_start')).toBe(false);
  });
});
