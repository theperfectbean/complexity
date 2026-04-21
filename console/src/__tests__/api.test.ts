import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { streamAgentRun, SERVICES } from '@/lib/api';

// ---------- streamAgentRun tests ----------

function makeSseStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
}

function makeFetchMock(body: ReadableStream<Uint8Array>, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    body,
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('streamAgentRun()', () => {
  it('calls /api/agent/v2/runs with POST and correct headers', async () => {
    const stream = makeSseStream([
      'data: {"type":"context","domain":"general","model":"default"}\n\n',
      'data: {"type":"text","content":"All good."}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const fetchMock = makeFetchMock(stream);
    vi.stubGlobal('fetch', fetchMock);

    const events: unknown[] = [];
    await new Promise<void>((resolve, reject) => {
      streamAgentRun('check plex status', 'default', (e) => events.push(e), resolve, reject);
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/agent/v2/runs');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string) as { message: string; modelId: string };
    expect(body.message).toBe('check plex status');
    expect(body.modelId).toBe('default');
  });

  it('emits parsed events in order', async () => {
    const stream = makeSseStream([
      'data: {"type":"context","domain":"media","model":"default"}\n\n',
      'data: {"type":"tool_start","tool":"plex_status","params":{}}\n\n',
      'data: {"type":"tool_result","tool":"plex_status","result":{"ok":true}}\n\n',
      'data: {"type":"text","content":"Plex is running."}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    vi.stubGlobal('fetch', makeFetchMock(stream));

    const events: Array<{ type: string }> = [];
    await new Promise<void>((resolve, reject) => {
      streamAgentRun('check plex', 'default', (e) => events.push(e as { type: string }), resolve, reject);
    });

    expect(events.map(e => e.type)).toEqual([
      'context', 'tool_start', 'tool_result', 'text', 'done',
    ]);
  });

  it('calls onDone when type=done is received', async () => {
    const stream = makeSseStream(['data: {"type":"done"}\n\n']);
    vi.stubGlobal('fetch', makeFetchMock(stream));

    const onDone = vi.fn();
    await new Promise<void>((resolve) => {
      streamAgentRun('test', 'default', () => {}, () => { onDone(); resolve(); }, () => resolve());
    });

    expect(onDone).toHaveBeenCalledOnce();
  });

  it('calls onError on HTTP 403', async () => {
    const stream = makeSseStream([]);
    vi.stubGlobal('fetch', makeFetchMock(stream, 403));

    const onError = vi.fn();
    await new Promise<void>((resolve) => {
      streamAgentRun('test', 'default', () => {}, resolve, (err) => { onError(err); resolve(); });
    });

    expect(onError).toHaveBeenCalledWith(expect.stringContaining('403'));
  });

  it('does not call onError when AbortError is thrown', async () => {
    const abortErr = Object.assign(new Error('abort'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortErr));

    const onError = vi.fn();
    const ac = new AbortController();
    ac.abort();

    await new Promise<void>((resolve) => {
      streamAgentRun('test', 'default', () => {}, resolve, onError, ac.signal);
      // Give microtask queue a chance to process
      setTimeout(resolve, 50);
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it('handles chunked SSE lines across multiple reads', async () => {
    // Split a single SSE line across two encoder chunks
    const encoder = new TextEncoder();
    const part1 = encoder.encode('data: {"type":"text","cont');
    const part2 = encoder.encode('ent":"hello"}\n\ndata: {"type":"done"}\n\n');
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(part1);
        controller.enqueue(part2);
        controller.close();
      },
    });
    vi.stubGlobal('fetch', makeFetchMock(stream));

    const events: Array<{ type: string; content?: string }> = [];
    await new Promise<void>((resolve, reject) => {
      streamAgentRun('test', 'default', (e) => events.push(e as typeof events[0]), resolve, reject);
    });

    const textEvent = events.find(e => e.type === 'text');
    expect(textEvent?.content).toBe('hello');
  });

  it('ignores non-data lines (comments, empty lines)', async () => {
    const stream = makeSseStream([
      ': this is a comment\n',
      '\n',
      'data: {"type":"text","content":"ok"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    vi.stubGlobal('fetch', makeFetchMock(stream));

    const events: Array<{ type: string }> = [];
    await new Promise<void>((resolve, reject) => {
      streamAgentRun('test', 'default', (e) => events.push(e as { type: string }), resolve, reject);
    });

    expect(events.filter(e => e.type !== 'done').map(e => e.type)).toEqual(['text']);
  });

  it('ignores malformed JSON lines without throwing', async () => {
    const stream = makeSseStream([
      'data: {not valid json}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    vi.stubGlobal('fetch', makeFetchMock(stream));

    const onError = vi.fn();
    await new Promise<void>((resolve) => {
      streamAgentRun('test', 'default', () => {}, resolve, onError);
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it('signals run complete on run_status completed', async () => {
    const stream = makeSseStream([
      'data: {"type":"run_status","status":"completed"}\n\n',
    ]);
    vi.stubGlobal('fetch', makeFetchMock(stream));

    const onDone = vi.fn();
    await new Promise<void>((resolve) => {
      streamAgentRun('test', 'default', () => {}, () => { onDone(); resolve(); }, () => resolve());
    });

    expect(onDone).toHaveBeenCalledOnce();
  });

  it('passes AbortSignal to fetch', () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: makeSseStream(['data: {"type":"done"}\n\n']),
    });
    vi.stubGlobal('fetch', fetchMock);

    const ac = new AbortController();
    streamAgentRun('test', 'default', () => {}, () => {}, () => {}, ac.signal);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(ac.signal);
  });
});

// ---------- SERVICES registry tests ----------

describe('SERVICES registry', () => {
  it('contains all expected containers', () => {
    const names = SERVICES.map(s => s.name);
    expect(names).toContain('dns');
    expect(names).toContain('proxy');
    expect(names).toContain('forgejo');
    expect(names).toContain('arrstack');
    expect(names).toContain('ingestion-stack');
    expect(names).toContain('audio-stack');
    expect(names).toContain('plex');
    expect(names).toContain('ollama');
    expect(names).toContain('complexity');
  });

  it('every service has required fields: name, ip, node, purpose, tags', () => {
    for (const svc of SERVICES) {
      expect(typeof svc.name).toBe('string');
      expect(svc.name.length).toBeGreaterThan(0);
      expect(typeof svc.ip).toBe('string');
      expect(svc.ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
      expect(['nas', 'media', 'ai']).toContain(svc.node);
      expect(typeof svc.purpose).toBe('string');
      expect(Array.isArray(svc.tags)).toBe(true);
    }
  });

  it('services are distributed across all three nodes', () => {
    const nodes = new Set(SERVICES.map(s => s.node));
    expect(nodes).toContain('nas');
    expect(nodes).toContain('media');
    expect(nodes).toContain('ai');
  });

  it('ingestion-stack has qbittorrent link', () => {
    const ingestion = SERVICES.find(s => s.name === 'ingestion-stack');
    expect(ingestion).toBeDefined();
    const links = ingestion?.links ?? [];
    const qbitLink = links.find(l => l.label === 'qBittorrent');
    expect(qbitLink).toBeDefined();
    expect(qbitLink?.url).toContain('torrent.internal.lan');
  });

  it('arrstack has links for sonarr, radarr, prowlarr', () => {
    const arr = SERVICES.find(s => s.name === 'arrstack');
    const labels = (arr?.links ?? []).map(l => l.label);
    expect(labels).toContain('Sonarr');
    expect(labels).toContain('Radarr');
    expect(labels).toContain('Prowlarr');
  });

  it('forgejo has separate git and docs links', () => {
    const forgejo = SERVICES.find(s => s.name === 'forgejo');
    const labels = (forgejo?.links ?? []).map(l => l.label);
    expect(labels).toContain('Git');
    expect(labels).toContain('Docs');
  });

  it('no two services share the same IP', () => {
    const ips = SERVICES.map(s => s.ip);
    const unique = new Set(ips);
    expect(unique.size).toBe(ips.length);
  });
});
