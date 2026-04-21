import { 
  createListHostsTool, 
  createSshExecTool,
  type AgentToolDefinition,
  type ListHostsInput,
  type ListHostsData,
  type SshExecInput,
  type SshExecData,
  type ListHostsResult,
  type SshExecResult,
} from './tools';
import { HOST_REGISTRY } from './host-registry';
import { execSsh } from './ssh-executor';

/**
 * Tool for listing cluster hosts and containers.
 */
export const listHosts = createListHostsTool(async (input): Promise<ListHostsResult> => {
  const hosts = HOST_REGISTRY.filter(_h => {
    if (input.includeOffline) return true;
    // For now we assume they are all online, but in a real app 
    // we would check a cache or the API.
    return true;
  });

  return {
    ok: true,
    widgetHint: { type: 'host_list' },
    summary: `Found ${hosts.length} hosts in cluster ${input.clusterId}`,
    data: {
      clusterId: input.clusterId,
      hosts: hosts.map(h => ({
        id: h.name,
        hostname: h.name,
        address: h.ip,
        status: 'online',
        cpuUsagePct: 0, // Mock
        memoryUsagePct: 0, // Mock
        vmCount: 0,
        tags: [],
      }))
    }
  };
});

/**
 * Tool for executing bounded SSH commands.
 */
export const sshExec = createSshExecTool(async (input, ctx): Promise<SshExecResult> => {
  const host = HOST_REGISTRY.find(h => h.name === input.hostId || h.ip === input.hostId);
  if (!host) {
    return {
      ok: false,
      widgetHint: { type: 'command_result' },
      summary: `Host ${input.hostId} not found`,
      data: { 
        hostId: input.hostId,
        commandId: input.commandId,
        executedCommand: { command: input.command, args: input.args || {} },
        exitCode: 1,
        rawSnippet: 'Host not found',
      }
    };
  }

  const result = await execSsh(host.ip, input.command, {
    timeoutMs: input.timeoutMs,
    onStdout: ctx.onStdout,
    onStderr: ctx.onStderr,
    signal: ctx.signal,
  });
  
  return {
    ok: result.exitCode === 0,
    widgetHint: { type: 'command_result' },
    summary: `Command ${input.command} finished with exit code ${result.exitCode}`,
    data: {
      hostId: host.name,
      commandId: input.commandId,
      executedCommand: {
        command: input.command,
        args: input.args || {},
      },
      exitCode: result.exitCode,
      rawSnippet: result.stdout || result.stderr,
    }
  };
});

/**
 * Registry of all available agent tools.
 */
export const clusterTools: Record<string, AgentToolDefinition<unknown, unknown>> = {
  listHosts: listHosts as unknown as AgentToolDefinition<unknown, unknown>,
  sshExec: sshExec as unknown as AgentToolDefinition<unknown, unknown>,
};
