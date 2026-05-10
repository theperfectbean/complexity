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
    expect(manifest).toContain('node01');
    expect(manifest).toContain('node02');
    expect(manifest).toContain('node03');
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

  it('getToolEntry returns metadata for known tool', async () => {
    const { getToolEntry } = await import('./ToolRegistry');
    const entry = getToolEntry('pve_list');
    expect(entry).toBeDefined();
    expect(entry?.tier).toBe(0);
  });

  it('getToolEntry returns undefined for unknown tool', async () => {
    const { getToolEntry } = await import('./ToolRegistry');
    expect(getToolEntry('nonexistent_tool')).toBeUndefined();
  });

  it('getAllTools returns a non-empty registry', async () => {
    const { getAllTools } = await import('./ToolRegistry');
    const tools = getAllTools();
    expect(Object.keys(tools).length).toBeGreaterThan(0);
    expect(tools['pve_list']).toBeDefined();
  });

  it('registry contains expected read tools at tier 0', async () => {
    const { getToolEntry } = await import('./ToolRegistry');
    expect(getToolEntry('pve_list')?.tier).toBe(0);
    expect(getToolEntry('disk_usage')?.tier).toBe(0);
    expect(getToolEntry('dns_query')?.tier).toBe(0);
  });

  it('registry contains expected destructive tools at tier 3', async () => {
    const { getToolEntry } = await import('./ToolRegistry');
    expect(getToolEntry('pve_stop')?.tier).toBe(3);
    expect(getToolEntry('pve_delete')?.tier).toBe(3);
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
    expect(Object.keys(ctx.tools).length).toBeGreaterThan(0);
  });

  it('narrows tool list for infra queries', async () => {
    const { buildAgentContext } = await import('./context/AgentContextPipeline');
    const ctx = buildAgentContext('restart the arrstack container', []);
    const names = Object.keys(ctx.tools);
    expect(names.some((n: string) => n.startsWith('pve_'))).toBe(true);
  });
});
