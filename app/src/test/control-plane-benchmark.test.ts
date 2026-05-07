import { describe, expect, it } from 'vitest';
import {
  CONTROL_PLANE_BENCHMARKS,
  scoreBenchmarkTranscript,
} from '@/lib/agent/v2/benchmark/ControlPlaneBenchmarks';

describe('Control-plane benchmark suite', () => {
  it('defines unique benchmark scenarios', () => {
    const ids = CONTROL_PLANE_BENCHMARKS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(5);
  });

  it('gives full credit to a matching destructive workflow transcript', () => {
    const scenario = CONTROL_PLANE_BENCHMARKS.find((item) => item.id === 'destructive-container-stop');
    expect(scenario).toBeDefined();

    const score = scoreBenchmarkTranscript(scenario!, {
      assistantText: 'I need approval before stopping plex.',
      toolCalls: ['incus_stop'],
      approvalRequested: true,
    });

    expect(score.passed).toBe(true);
    expect(score.score).toBe(100);
  });

  it('penalizes transcripts that skip diff preview and commit too early', () => {
    const scenario = CONTROL_PLANE_BENCHMARKS.find((item) => item.id === 'review-git-change-before-commit');
    expect(scenario).toBeDefined();

    const score = scoreBenchmarkTranscript(scenario!, {
      assistantText: 'I changed the file.',
      toolCalls: ['git_read_file', 'git_commit'],
      approvalRequested: false,
    });

    expect(score.passed).toBe(false);
    expect(score.score).toBeLessThan(100);
    expect(score.checks.some((check) => check.label === 'avoided git_commit' && !check.passed)).toBe(true);
  });
});
