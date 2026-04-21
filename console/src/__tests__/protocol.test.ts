import { describe, it, expect } from 'vitest';
import type {
  ToolResultEnvelope,
  ResourceWidgetHint,
  RunStatus,
  MissionPlan,
  MissionPlanStep,
} from '@/lib/protocol';

// --- Type guard helpers (runtime checks for the shapes defined in protocol.ts) ---

function isToolResultEnvelope(v: unknown): v is ToolResultEnvelope {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return typeof o.ok === 'boolean' && typeof o.summary === 'string';
}

const RUN_STATUSES: RunStatus[] = ['running', 'completed', 'cancelled', 'failed', 'waiting_for_approval'];

const WIDGET_HINT_TYPES: ResourceWidgetHint['type'][] = [
  'host_list', 'command_result', 'vm_list', 'task_status', 'key_value', 'table', 'diff',
];

describe('ToolResultEnvelope', () => {
  it('validates a minimal ok=true envelope', () => {
    const env: ToolResultEnvelope = { ok: true, widgetHint: { type: 'command_result' }, summary: 'done', data: null };
    expect(isToolResultEnvelope(env)).toBe(true);
    expect(env.ok).toBe(true);
  });

  it('validates a failed envelope', () => {
    const env: ToolResultEnvelope = { ok: false, widgetHint: { type: 'command_result' }, summary: 'ssh failed', data: {} };
    expect(isToolResultEnvelope(env)).toBe(true);
    expect(env.ok).toBe(false);
  });

  it('includes optional diagnostics fields', () => {
    const env: ToolResultEnvelope = {
      ok: true,
      widgetHint: { type: 'key_value' },
      summary: 'done',
      data: {},
      diagnostics: { durationMs: 250, cached: false, source: 'ssh' },
    };
    expect(env.diagnostics?.durationMs).toBe(250);
    expect(env.diagnostics?.source).toBe('ssh');
  });

  it('rejects non-objects', () => {
    expect(isToolResultEnvelope(null)).toBe(false);
    expect(isToolResultEnvelope('string')).toBe(false);
    expect(isToolResultEnvelope(42)).toBe(false);
  });

  it('rejects objects missing required fields', () => {
    expect(isToolResultEnvelope({ summary: 'x' })).toBe(false);   // missing ok
    expect(isToolResultEnvelope({ ok: true })).toBe(false);        // missing summary
  });
});

describe('ResourceWidgetHint', () => {
  it('covers all valid widget hint types', () => {
    for (const type of WIDGET_HINT_TYPES) {
      const hint: ResourceWidgetHint = { type } as ResourceWidgetHint;
      expect(hint.type).toBe(type);
    }
  });

  it('host_list and vm_list are distinct types', () => {
    const a: ResourceWidgetHint = { type: 'host_list' };
    const b: ResourceWidgetHint = { type: 'vm_list' };
    expect(a.type).not.toBe(b.type);
  });
});

describe('RunStatus', () => {
  it('contains exactly the expected values', () => {
    expect(RUN_STATUSES).toHaveLength(5);
    expect(RUN_STATUSES).toContain('running');
    expect(RUN_STATUSES).toContain('completed');
    expect(RUN_STATUSES).toContain('cancelled');
    expect(RUN_STATUSES).toContain('failed');
    expect(RUN_STATUSES).toContain('waiting_for_approval');
  });

  it('"completed" and "failed" are terminal states', () => {
    const terminal: RunStatus[] = ['completed', 'failed', 'cancelled'];
    terminal.forEach(s => expect(RUN_STATUSES).toContain(s));
  });
});

describe('MissionPlan shape', () => {
  const validPlan: MissionPlan = {
    goal: 'Restart qbittorrent on ingestion-stack',
    assumptions: ['Service is running', 'SSH access available'],
    risks: ['Torrents in progress will be interrupted'],
    steps: [
      {
        id: 'step-1',
        title: 'Check current status',
        description: 'Verify service is running before restart',
        kind: 'inspect',
      },
      {
        id: 'step-2',
        title: 'Restart service',
        description: 'systemctl restart qbittorrent-nox',
        kind: 'change',
        requiresApproval: true,
      },
      {
        id: 'step-3',
        title: 'Verify service',
        description: 'Check service is active after restart',
        kind: 'verify',
      },
    ],
    successCriteria: ['Service status shows active (running)'],
  };

  it('accepts a valid plan with all required fields', () => {
    expect(validPlan.goal).toContain('qbittorrent');
    expect(validPlan.steps).toHaveLength(3);
    expect(validPlan.successCriteria).toHaveLength(1);
  });

  it('accepts all four step kinds', () => {
    const kinds: MissionPlanStep['kind'][] = ['inspect', 'change', 'verify', 'fallback'];
    kinds.forEach(kind => {
      const step: MissionPlanStep = { id: `s-${kind}`, title: kind, description: kind, kind };
      expect(step.kind).toBe(kind);
    });
  });

  it('step requiresApproval is optional', () => {
    const step: MissionPlanStep = { id: 's1', title: 'inspect', description: 'd', kind: 'inspect' };
    expect(step.requiresApproval).toBeUndefined();
    const stepWithApproval: MissionPlanStep = { ...step, requiresApproval: true };
    expect(stepWithApproval.requiresApproval).toBe(true);
  });

  it('accepts optional patches field', () => {
    const planWithPatch: MissionPlan = {
      ...validPlan,
      patches: [{ file: '/etc/caddy/Caddyfile', oldContent: '# old', newContent: '# new' }],
    };
    expect(planWithPatch.patches).toHaveLength(1);
    expect(planWithPatch.patches?.[0]?.file).toBe('/etc/caddy/Caddyfile');
  });
});
