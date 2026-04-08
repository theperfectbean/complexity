import { 
  createListHostsTool, 
  createSshExecTool,
  createWriteFileTool,
  type AgentToolDefinition,
  type ListHostsInput,
  type ListHostsData,
  type SshExecInput,
  type SshExecData,
  type WriteFileInput,
  type WriteFileData,
  type ListHostsResult,
  type SshExecResult,
  type WriteFileResult,
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
        vmCount: h.type === 'vm' ? 1 : 0,
        tags: h.tags,
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

export const writeFile = createWriteFileTool(async (input, ctx): Promise<WriteFileResult> => {
  const host = HOST_REGISTRY.find(h => h.name === input.hostId || h.ip === input.hostId);
  if (!host) {
    return {
      ok: false,
      widgetHint: { type: 'diff' },
      summary: `Host ${input.hostId} not found`,
      data: { hostId: input.hostId, path: input.path, bytesWritten: 0 },
    };
  }

  // Escape single-quotes in content for heredoc safety
  const escaped = input.content.replace(/\\/g, '\\\\').replace(/'/g, "'\\''");
  const modeCmd = input.mode ? ` && chmod ${input.mode} '${input.path}'` : '';
  const command = `cat > '${input.path}' << 'COMPLEXITY_EOF'\n${escaped}\nCOMPLEXITY_EOF${modeCmd}`;

  const result = await execSsh(host.ip, command, {
    onStdout: ctx.onStdout,
    onStderr: ctx.onStderr,
    signal: ctx.signal,
  });

  return {
    ok: result.exitCode === 0,
    widgetHint: { type: 'diff' },
    summary: result.exitCode === 0
      ? `Wrote ${Buffer.byteLength(input.content, 'utf8')} bytes to ${input.path} on ${host.name}`
      : `Failed to write ${input.path}: ${result.stderr}`,
    data: {
      hostId: host.name,
      path: input.path,
      bytesWritten: result.exitCode === 0 ? Buffer.byteLength(input.content, 'utf8') : 0,
    },
  };
});

/**
 * Registry of all available agent tools.
 */
export const clusterTools: Record<string, AgentToolDefinition<unknown, unknown>> = {
  listHosts: listHosts as unknown as AgentToolDefinition<unknown, unknown>,
  sshExec: sshExec as unknown as AgentToolDefinition<unknown, unknown>,
  writeFile: writeFile as unknown as AgentToolDefinition<unknown, unknown>,
};
