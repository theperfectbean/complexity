import { beforeEach, describe, expect, it, vi } from 'vitest';

type RedisLike = {
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  eval: ReturnType<typeof vi.fn>;
};

let mockRedis: RedisLike | null = null;
const backingStore = new Map<string, string>();

vi.mock('@/lib/redis', () => ({
  getRedisClient: () => mockRedis,
}));

function makeRedis(): RedisLike {
  return {
    set: vi.fn(async (key: string, value: string) => {
      backingStore.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => backingStore.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      const existed = backingStore.delete(key);
      return existed ? 1 : 0;
    }),
    eval: vi.fn(async (_script: string, _keyCount: number, key: string, expectedRaw: string) => {
      const current = backingStore.get(key);
      if (current !== expectedRaw) return 0;
      backingStore.delete(key);
      return 1;
    }),
  };
}

describe('ApprovalStore', () => {
  beforeEach(() => {
    backingStore.clear();
    mockRedis = makeRedis();
    vi.resetModules();
  });

  it('binds approvals to the owning user and thread and consumes them once', async () => {
    const { createCommandApproval, consumeApproval } = await import('@/lib/agent/v2/approval/ApprovalStore');

    const approvalId = await createCommandApproval(
      {
        action: 'stop',
        resource: 'plex',
        options: {},
        tier: 'tier3',
        requiresApproval: true,
      },
      'user-1',
      'thread-1',
    );

    expect(await consumeApproval(approvalId, 'user-2', 'thread-1')).toBeNull();
    expect(await consumeApproval(approvalId, 'user-1', 'thread-2')).toBeNull();

    const approval = await consumeApproval(approvalId, 'user-1', 'thread-1');
    expect(approval).toMatchObject({
      kind: 'command',
      ownerId: 'user-1',
      threadId: 'thread-1',
      command: {
        action: 'stop',
        resource: 'plex',
      },
    });

    expect(await consumeApproval(approvalId, 'user-1', 'thread-1')).toBeNull();
  });

  it('atomically consumes an approval when confirmations race', async () => {
    const { createToolApproval, consumeApproval } = await import('@/lib/agent/v2/approval/ApprovalStore');

    const approvalId = await createToolApproval(
      'incus_stop',
      { container: 'plex' },
      'user-1',
      'thread-1',
    );

    let waiting = 0;
    let releaseGets!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGets = resolve;
    });

    mockRedis!.get.mockImplementation(async (key: string) => {
      waiting += 1;
      if (waiting === 2) {
        releaseGets();
      }
      await gate;
      return backingStore.get(key) ?? null;
    });

    const [first, second] = await Promise.all([
      consumeApproval(approvalId, 'user-1', 'thread-1'),
      consumeApproval(approvalId, 'user-1', 'thread-1'),
    ]);

    expect([first, second].filter((value) => value !== null)).toHaveLength(1);
    expect(await consumeApproval(approvalId, 'user-1', 'thread-1')).toBeNull();
  });
});
