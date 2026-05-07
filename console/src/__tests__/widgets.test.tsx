import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { CommandResult } from '@/components/widgets/CommandResult';
import { HostList } from '@/components/widgets/HostList';
import { WidgetRenderer } from '@/components/WidgetRenderer';
import type { ToolResultEnvelope } from '@/lib/protocol';

// ---------- CommandResult ----------

describe('CommandResult', () => {
  it('renders string data directly', () => {
    render(<CommandResult data="hello world" />);
    expect(screen.getByText('hello world')).toBeInTheDocument();
  });

  it('renders output field from object data', () => {
    render(<CommandResult data={{ output: 'service is active' }} />);
    expect(screen.getByText('service is active')).toBeInTheDocument();
  });

  it('renders stdout field from object data', () => {
    render(<CommandResult data={{ stdout: 'exit=0' }} />);
    expect(screen.getByText('exit=0')).toBeInTheDocument();
  });

  it('shows exit code badge when exitCode is 0', () => {
    render(<CommandResult data={{ output: 'done', exitCode: 0 }} />);
    expect(screen.getByText('exit 0')).toBeInTheDocument();
  });

  it('shows exit code badge in red when exitCode is non-zero', () => {
    render(<CommandResult data={{ output: 'failed', exitCode: 1 }} />);
    const badge = screen.getByText('exit 1');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveStyle({ color: '#ef4444' });
  });

  it('does not show exit code badge when exitCode is absent', () => {
    render(<CommandResult data={{ output: 'no exit code here' }} />);
    expect(screen.queryByText(/^exit \d/)).not.toBeInTheDocument();
  });

  it('renders raw JSON when no known text field', () => {
    const data = { someField: 'val' };
    render(<CommandResult data={data} />);
    expect(screen.getByText(/someField/)).toBeInTheDocument();
  });

  it('renders null data gracefully', () => {
    expect(() => render(<CommandResult data={null} />)).not.toThrow();
  });

  it('copy button triggers clipboard write', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
    });

    render(<CommandResult data="some output" />);
    const copyBtn = screen.getByTitle('Copy');
    await userEvent.click(copyBtn);
    expect(writeText).toHaveBeenCalledWith('some output');
  });
});

// ---------- HostList ----------

describe('HostList', () => {
  it('renders "No hosts found" for empty array', () => {
    render(<HostList data={[]} />);
    expect(screen.getByText('No hosts found')).toBeInTheDocument();
  });

  it('renders "No hosts found" for null', () => {
    render(<HostList data={null} />);
    expect(screen.getByText('No hosts found')).toBeInTheDocument();
  });

  it('renders host names from array', () => {
    const hosts = [
      { name: 'arrstack', ip: '192.168.0.103', status: 'running', node: 'media' },
      { name: 'plex', ip: '192.168.0.60', status: 'running', node: 'media' },
    ];
    render(<HostList data={hosts} />);
    expect(screen.getByText('arrstack')).toBeInTheDocument();
    expect(screen.getByText('plex')).toBeInTheDocument();
  });

  it('renders IP addresses', () => {
    render(<HostList data={[{ name: 'dns', ip: '192.168.0.53', status: 'running' }]} />);
    expect(screen.getByText('192.168.0.53')).toBeInTheDocument();
  });

  it('renders node label when present', () => {
    render(<HostList data={[{ name: 'dns', ip: '192.168.0.53', node: 'nas', status: 'running' }]} />);
    expect(screen.getByText('nas')).toBeInTheDocument();
  });

  it('handles {hosts: [...]} object shape', () => {
    render(<HostList data={{ hosts: [{ name: 'proxy', ip: '192.168.0.100' }] }} />);
    expect(screen.getByText('proxy')).toBeInTheDocument();
  });

  it('handles {nodes: [...]} object shape', () => {
    render(<HostList data={{ nodes: [{ name: 'nas', ip: '192.168.0.202' }] }} />);
    expect(screen.getByText('nas')).toBeInTheDocument();
  });

  it('shows green dot for running status', () => {
    const { container } = render(<HostList data={[{ name: 'x', status: 'running' }]} />);
    // jsdom normalizes hex colors to rgb — check for either format
    const dot = container.querySelector('[style*="rgb(34, 197, 94)"], [style*="22c55e"]');
    expect(dot).toBeInTheDocument();
  });

  it('shows red dot for stopped status', () => {
    const { container } = render(<HostList data={[{ name: 'x', status: 'stopped' }]} />);
    const dot = container.querySelector('[style*="rgb(239, 68, 68)"], [style*="ef4444"]');
    expect(dot).toBeInTheDocument();
  });

  it('shows "—" when host has no name field', () => {
    render(<HostList data={[{ ip: '10.0.0.1' }]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

// ---------- WidgetRenderer ----------

function makeEnvelope(
  overrides: Partial<ToolResultEnvelope> = {},
): ToolResultEnvelope {
  return {
    ok: true,
    widgetHint: { type: 'command_result' },
    summary: 'Test result',
    data: { output: 'test output', exitCode: 0 },
    ...overrides,
  };
}

describe('WidgetRenderer', () => {
  it('shows tool name in header', () => {
    render(<WidgetRenderer toolName="service_restart" result={makeEnvelope()} />);
    expect(screen.getByText('service_restart')).toBeInTheDocument();
  });

  it('shows ✓ OK when result.ok is true', () => {
    render(<WidgetRenderer toolName="tool" result={makeEnvelope({ ok: true })} />);
    // getAllByText handles multiple matches from the header + CommandResult ✓
    expect(screen.getAllByText('✓ OK').length).toBeGreaterThanOrEqual(1);
  });

  it('shows ✗ FAILED when result.ok is false', () => {
    render(<WidgetRenderer toolName="tool" result={makeEnvelope({ ok: false })} />);
    expect(screen.getByText('✗ FAILED')).toBeInTheDocument();
  });

  it('shows summary text', () => {
    render(<WidgetRenderer toolName="tool" result={makeEnvelope({ summary: 'Service restarted ok' })} />);
    expect(screen.getByText('Service restarted ok')).toBeInTheDocument();
  });

  it('shows durationMs when present', () => {
    render(<WidgetRenderer toolName="tool" result={makeEnvelope({ diagnostics: { durationMs: 1234 } })} />);
    expect(screen.getByText('1234ms')).toBeInTheDocument();
  });

  it('renders HostList for host_list hint', () => {
    const env = makeEnvelope({
      widgetHint: { type: 'host_list' },
      data: [{ name: 'arrstack-node', ip: '192.168.0.103', status: 'running' }],
    });
    render(<WidgetRenderer toolName="incus_list" result={env} />);
    expect(screen.getByText('arrstack-node')).toBeInTheDocument();
  });

  it('renders HostList for vm_list hint', () => {
    const env = makeEnvelope({
      widgetHint: { type: 'vm_list' },
      data: [{ name: 'plex-vm', ip: '192.168.0.60', status: 'running' }],
    });
    render(<WidgetRenderer toolName="incus_list" result={env} />);
    expect(screen.getByText('plex-vm')).toBeInTheDocument();
  });

  it('falls back to CommandResult for unknown/command_result hint', () => {
    const env = makeEnvelope({
      widgetHint: { type: 'command_result' },
      data: { output: 'unique-output-value', exitCode: 0 },
    });
    render(<WidgetRenderer toolName="ssh_exec" result={env} />);
    expect(screen.getByText(/unique-output-value/)).toBeInTheDocument();
  });
});
