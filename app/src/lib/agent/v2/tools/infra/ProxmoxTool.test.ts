import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock SshTool before importing ProxmoxTool
const mockSshExec = vi.fn();
const mockPveExec = vi.fn();

vi.mock('@/lib/agent/v2/tools/base/SshTool', () => ({
  sshExec: mockSshExec,
  pveExec: mockPveExec,
}));

function makeSsh(stdout: string, exitCode = 0, stderr = '') {
  return { stdout, stderr, exitCode };
}

describe('ProxmoxTool', () => {
  beforeEach(() => {
    mockSshExec.mockReset();
    mockPveExec.mockReset();
    vi.resetModules();
  });

  describe('resolveContainer', () => {
    it('resolves a known container by name (case-insensitive)', async () => {
      const { resolveContainer } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      const result = resolveContainer('dns');
      expect(result).toBeDefined();
      expect(result?.name.toLowerCase()).toBe('dns');
    });

    it('returns undefined for an unknown container', async () => {
      const { resolveContainer } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      expect(resolveContainer('nonexistent-xyz')).toBeUndefined();
    });

    it('resolves case-insensitively', async () => {
      const { resolveContainer } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      const lower = resolveContainer('plex');
      const upper = resolveContainer('PLEX');
      expect(lower).toBeDefined();
      expect(upper).toBeDefined();
      expect(lower?.vmid).toBe(upper?.vmid);
    });
  });

  describe('pve_list', () => {
    it('returns parsed JSON on success', async () => {
      const payload = [{ name: 'dns', status: 'running', vmid: 100 }];
      mockSshExec.mockResolvedValue(makeSsh(JSON.stringify(payload)));
      const { pve_list } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      const result = await pve_list();
      expect(result).toEqual(payload);
    });

    it('returns { error } on non-zero exit code', async () => {
      mockSshExec.mockResolvedValue(makeSsh('', 1, 'connection refused'));
      const { pve_list } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      const result = await pve_list() as { error: string };
      expect(result.error).toContain('connection refused');
    });

    it('returns { raw } when JSON parse fails', async () => {
      mockSshExec.mockResolvedValue(makeSsh('not json'));
      const { pve_list } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      const result = await pve_list() as { raw: string };
      expect(result.raw).toBe('not json');
    });
  });

  describe('pve_status', () => {
    it('returns structured error for unknown container', async () => {
      const { pve_status } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      const result = await pve_status({ container: 'nonexistent-xyz' }) as { error: string };
      expect(result.error).toMatch(/unknown container/i);
      expect(mockSshExec).not.toHaveBeenCalled();
    });

    it('calls sshExec with correct pvesh command for a known container', async () => {
      const payload = { status: 'running', cpus: 1 };
      mockSshExec.mockResolvedValue(makeSsh(JSON.stringify(payload)));
      const { pve_status } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      const result = await pve_status({ container: 'dns' });
      expect(result).toEqual(payload);
      expect(mockSshExec).toHaveBeenCalledOnce();
      const [, cmd] = mockSshExec.mock.calls[0];
      expect(cmd).toContain('pvesh get');
      expect(cmd).toContain('lxc');
    });
  });

  describe('pve_exec', () => {
    it('returns structured error for unknown container', async () => {
      const { pve_exec } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      const result = await pve_exec({ container: 'nonexistent-xyz', command: 'ls' }) as { error: string };
      expect(result.error).toMatch(/unknown container/i);
      expect(mockPveExec).not.toHaveBeenCalled();
    });

    it('calls pveExec (not sshExec) for command execution', async () => {
      mockPveExec.mockResolvedValue(makeSsh('/etc\n/var', 0));
      const { pve_exec } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      const result = await pve_exec({ container: 'proxy', command: 'ls /' }) as { stdout: string };
      expect(mockPveExec).toHaveBeenCalledOnce();
      expect(mockSshExec).not.toHaveBeenCalled();
      expect(result.stdout).toContain('/etc');
    });
  });

  describe('pve_logs', () => {
    it('fetches journal logs via pveExec', async () => {
      mockPveExec.mockResolvedValue(makeSsh('May 09 01:00 complexity-app started', 0));
      const { pve_logs } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      const result = await pve_logs({ container: 'proxy', lines: 50 }) as { logs: string };
      expect(result.logs).toContain('complexity-app');
      const [, , cmd] = mockPveExec.mock.calls[0];
      expect(cmd).toContain('journalctl');
      expect(cmd).toContain('50');
    });

    it('defaults to 100 lines when lines is not specified', async () => {
      mockPveExec.mockResolvedValue(makeSsh('log line'));
      const { pve_logs } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      await pve_logs({ container: 'dns' });
      const [, , cmd] = mockPveExec.mock.calls[0];
      expect(cmd).toContain('100');
    });
  });

  describe('pve_start / pve_stop / pve_restart / pve_delete', () => {
    it('pve_start returns structured error for unknown container', async () => {
      const { pve_start } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      const r = await pve_start({ container: 'nonexistent' }) as { error: string };
      expect(r.error).toMatch(/unknown container/i);
    });

    it('pve_stop returns structured error for unknown container', async () => {
      const { pve_stop } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      const r = await pve_stop({ container: 'nonexistent' }) as { error: string };
      expect(r.error).toMatch(/unknown container/i);
    });

    it('pve_start issues pct start command', async () => {
      mockSshExec.mockResolvedValue(makeSsh('started', 0));
      const { pve_start } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      await pve_start({ container: 'dns' });
      expect(mockSshExec).toHaveBeenCalledOnce();
      const [, cmd] = mockSshExec.mock.calls[0];
      expect(cmd).toContain('pct start');
    });

    it('pve_stop issues pct stop command', async () => {
      mockSshExec.mockResolvedValue(makeSsh('stopped', 0));
      const { pve_stop } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      await pve_stop({ container: 'dns' });
      const [, cmd] = mockSshExec.mock.calls[0];
      expect(cmd).toContain('pct stop');
    });
  });

  describe('pve_set_limit', () => {
    it('returns error when neither cpu nor memory specified', async () => {
      const { pve_set_limit } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      const r = await pve_set_limit({ container: 'plex' }) as { error: string };
      expect(r.error).toMatch(/cpu or memory/i);
      expect(mockSshExec).not.toHaveBeenCalled();
    });

    it('returns structured error for unknown container', async () => {
      const { pve_set_limit } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      const r = await pve_set_limit({ container: 'nonexistent', cpu: 2 }) as { error: string };
      expect(r.error).toMatch(/unknown container/i);
    });

    it('builds pct set command with cpu flag', async () => {
      mockSshExec.mockResolvedValue(makeSsh('', 0));
      const { pve_set_limit } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      await pve_set_limit({ container: 'plex', cpu: 4 });
      const [, cmd] = mockSshExec.mock.calls[0];
      expect(cmd).toContain('pct set');
      expect(cmd).toContain('-cores 4');
    });

    it('builds pct set command with memory flag', async () => {
      mockSshExec.mockResolvedValue(makeSsh('', 0));
      const { pve_set_limit } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      await pve_set_limit({ container: 'plex', memory: '4096' });
      const [, cmd] = mockSshExec.mock.calls[0];
      expect(cmd).toContain('-memory 4096');
    });
  });

  describe('pve_node_status', () => {
    it('returns structured error for unknown node', async () => {
      const { pve_node_status } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      const r = await pve_node_status({ node: 'node99' }) as { error: string };
      expect(r.error).toMatch(/unknown node/i);
      expect(mockSshExec).not.toHaveBeenCalled();
    });

    it('calls pvesh get status for a known node', async () => {
      mockSshExec.mockResolvedValue(makeSsh(JSON.stringify({ cpu: 0.12, memory: { used: 1000 } })));
      const { pve_node_status } = await import('@/lib/agent/v2/tools/infra/ProxmoxTool');
      await pve_node_status({ node: 'node01' });
      expect(mockSshExec).toHaveBeenCalledOnce();
      const [, cmd] = mockSshExec.mock.calls[0];
      expect(cmd).toContain('pvesh get');
      expect(cmd).toContain('status');
    });
  });
});
