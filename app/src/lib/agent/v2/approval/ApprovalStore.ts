import { getRedisClient } from '@/lib/redis';
import type { ParsedCommand } from '../command';
import type { ModelTask } from '@/lib/agent/core/AgentState';

const APPROVAL_TTL_SECONDS = 10 * 60;
const KEY_PREFIX = 'agent:approval';


export interface ToolApprovalResumeState {
  runId: string;
  activeModelId: string;
  routingTask: ModelTask;
  round: number;
  commandMode: 'auto' | 'slash' | 'natural';
  toolCallId?: string;
  messages: Array<Record<string, unknown>>;
  toolCallHistory: Array<{
    tool: string;
    params: Record<string, unknown>;
    result?: unknown;
    error?: string;
    timestamp?: string;
  }>;
}

type PendingApprovalPayload =
  | {
      kind: 'command';
      ownerId: string;
      threadId?: string;
      command: ParsedCommand;
    }
  | {
      kind: 'tool';
      ownerId: string;
      threadId?: string;
      tool: { name: string; params: Record<string, unknown> };
      resume?: ToolApprovalResumeState;
    };

function keyFor(id: string): string {
  return `${KEY_PREFIX}:${id}`;
}

async function persistApproval(payload: PendingApprovalPayload): Promise<string> {
  const redis = getRedisClient();
  if (!redis) {
    throw new Error('Approval storage is unavailable.');
  }

  const id = crypto.randomUUID();
  await redis.set(keyFor(id), JSON.stringify(payload), 'EX', APPROVAL_TTL_SECONDS);
  return id;
}

export async function createCommandApproval(
  command: ParsedCommand,
  ownerId: string,
  threadId?: string,
): Promise<string> {
  return persistApproval({ kind: 'command', ownerId, threadId, command });
}

export async function createToolApproval(
  name: string,
  params: Record<string, unknown>,
  ownerId: string,
  threadId?: string,
  resume?: ToolApprovalResumeState,
): Promise<string> {
  return persistApproval({ kind: 'tool', ownerId, threadId, tool: { name, params }, resume });
}

export async function consumeApproval(
  id: string,
  ownerId: string,
  threadId?: string,
): Promise<PendingApprovalPayload | null> {
  const redis = getRedisClient();
  if (!redis) {
    throw new Error('Approval storage is unavailable.');
  }

  const key = keyFor(id);
  const raw = await redis.get(key);
  if (!raw) return null;

  const parsed = JSON.parse(raw) as PendingApprovalPayload;
  if (parsed.ownerId !== ownerId) return null;
  if (parsed.threadId && parsed.threadId !== threadId) return null;

  const deleted = await redis.eval(
    `
      local value = redis.call('GET', KEYS[1])
      if value == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      end
      return 0
    `,
    1,
    key,
    raw,
  );
  if (deleted !== 1) return null;

  return parsed;
}
