import { spawn } from 'node:child_process';

export interface SshResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ExecSshOptions {
  timeoutMs?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  signal?: AbortSignal;
}

function getSshOpts(): string[] {
  const sshKey = process.env.SSH_KEY_PATH ?? process.env.SSH_AGENT_KEY_PATH ?? '/root/.ssh/agent_id_ed25519';
  return [
    '-i', sshKey,
    '-o', 'BatchMode=yes',
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ConnectTimeout=10',
  ];
}

export async function execSsh(ip: string, command: string, options: ExecSshOptions = {}): Promise<SshResult> {
  const { timeoutMs = 30000, onStdout, onStderr, signal } = options;

  return new Promise((resolve) => {
    let stdoutData = '';
    let stderrData = '';

    const child = spawn('ssh', [...getSshOpts(), `root@${ip}`, command], {
      signal,
    });

    let timeout: NodeJS.Timeout;
    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        child.kill('SIGTERM');
      }, timeoutMs);
    }

    if (signal) {
      signal.addEventListener('abort', () => {
        child.kill('SIGINT');
      });
    }

    child.stdout.on('data', (chunk: Buffer) => {
      const str = chunk.toString('utf-8');
      stdoutData += str;
      if (onStdout) onStdout(str);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const str = chunk.toString('utf-8');
      stderrData += str;
      if (onStderr) onStderr(str);
    });

    child.on('error', (err: Error & { code?: string }) => {
      if (timeout) clearTimeout(timeout);
      resolve({
        exitCode: err.code === 'ABORT_ERR' ? 130 : (Number(err.code) || 1),
        stdout: stdoutData.trim(),
        stderr: (stderrData + '\n' + (err.message || 'Unknown error')).trim(),
      });
    });

    child.on('close', (code, signalString) => {
      if (timeout) clearTimeout(timeout);
      let finalCode = code ?? 1;
      if (signalString === 'SIGINT' || signalString === 'SIGTERM') finalCode = 130;
      resolve({
        exitCode: finalCode,
        stdout: stdoutData.trim(),
        stderr: stderrData.trim(),
      });
    });
  });
}
