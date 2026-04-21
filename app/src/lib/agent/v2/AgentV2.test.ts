import { describe, expect, it } from 'vitest';
import { classifyIntent, getDomainToolPrefixes } from './context/intent-classifier';
import { buildFleetManifest } from './context/fleet-manifest';
import { evaluateRisk } from './policy/RiskPolicy';

describe('Intent classifier', () => {
  it('classifies media-related queries', () => {
    expect(classifyIntent('why is sonarr not downloading?')).toBe('media');
    expect(classifyIntent('show me the radarr queue')).toBe('media');
  });
  it('classifies infra queries', () => {
    expect(classifyIntent('restart the arrstack container')).toBe('infra');
  });
  it('classifies storage queries', () => {
    expect(classifyIntent('how much disk space is left on nas?')).toBe('storage');
  });
  it('classifies network queries', () => {
    expect(classifyIntent('add a DNS record for myservice.internal.lan')).toBe('network');
  });
  it('classifies audit queries', () => {
    expect(classifyIntent('what changed yesterday?')).toBe('audit');
  });
  it('returns general for unrecognized queries', () => {
    expect(classifyIntent('hello there')).toBe('general');
  });
  it('returns narrowed tool prefixes for media domain', () => {
    const prefixes = getDomainToolPrefixes('media');
    expect(prefixes).toContain('sonarr_');
    expect(prefixes).not.toContain('dns_');
  });
});

describe('Fleet manifest', () => {
  it('includes all 3 nodes', () => {
    const manifest = buildFleetManifest();
    expect(manifest).toContain('nas');
    expect(manifest).toContain('media');
    expect(manifest).toContain('ai');
  });
  it('includes key containers', () => {
    const manifest = buildFleetManifest();
    expect(manifest).toContain('arrstack');
  });
});

describe('Risk policy', () => {
  it('tier 0 allows without confirm', () => {
    const d = evaluateRisk(0);
    expect(d.allow).toBe(true);
    expect(d.requiresConfirm).toBe(false);
  });
  it('tier 2 allows with notification', () => {
    const d = evaluateRisk(2);
    expect(d.allow).toBe(true);
    expect(d.emitNotification).toBe(true);
  });
  it('tier 3 blocks and requires confirmation', () => {
    const d = evaluateRisk(3);
    expect(d.allow).toBe(false);
    expect(d.requiresConfirm).toBe(true);
  });
});

describe('ToolRegistry', () => {
  it('executeTool rejects unknown tool names', async () => {
    const { executeTool } = await import('./ToolRegistry');
    await expect(executeTool('nonexistent_tool', {})).rejects.toThrow();
  });

  it('executeTool validates required parameters', async () => {
    const { executeTool } = await import('./ToolRegistry');
    await expect(executeTool('incus_status', {})).rejects.toThrow('Missing required parameter "container"');
  });

  it('executeTool rejects unknown parameters', async () => {
    const { executeTool } = await import('./ToolRegistry');
    await expect(executeTool('incus_list', { unexpected: true })).rejects.toThrow('Unknown parameter "unexpected"');
  });

  it('executeTool validates enum parameters', async () => {
    const { executeTool } = await import('./ToolRegistry');
    await expect(executeTool('qbit_pause', { action: 'stop' })).rejects.toThrow('Invalid parameter "action"');
  });

  it('getToolEntry returns metadata for known tools', async () => {
    const { getToolEntry } = await import('./ToolRegistry');
    const entry = getToolEntry('sonarr_status');
    expect(entry).toBeDefined();
    expect(entry?.tier).toBe(0);
  });

  it('registers git diff preview and guarded commit tools', async () => {
    const { getToolEntry } = await import('./ToolRegistry');
    expect(getToolEntry('git_diff_preview')?.tier).toBe(0);
    expect(getToolEntry('git_commit')?.tier).toBe(3);
  });
});

describe('Destructive confirmation flow', () => {
  it('risk policy blocks tier-3 actions', () => {
    const r = evaluateRisk(3);
    expect(r.allow).toBe(false);
    expect(r.requiresConfirm).toBe(true);
  });

  it('risk policy allows tier-1 actions without confirm', () => {
    const r = evaluateRisk(1);
    expect(r.allow).toBe(true);
    expect(r.requiresConfirm).toBe(false);
  });
});

describe('AgentContextPipeline', () => {
  it('builds context with fleet manifest and tool list', async () => {
    const { buildAgentContext } = await import('./context/AgentContextPipeline');
    const ctx = buildAgentContext('check disk space on nas', []);
    expect(ctx.systemPrompt).toContain('NAS');
    expect(ctx.tools.length).toBeGreaterThan(0);
  });

  it('narrows tool list for media queries', async () => {
    const { buildAgentContext } = await import('./context/AgentContextPipeline');
    const ctx = buildAgentContext('why is sonarr not downloading', []);
    const names = ctx.tools.map((t: {function: {name: string}}) => t.function.name);
    expect(names.some((n: string) => n.startsWith('sonarr_'))).toBe(true);
  });
});
