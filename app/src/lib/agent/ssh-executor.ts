import { spawn } from 'node:child_process';

const SSH_KEY = '/root/.ssh/id_gemini_agent';
const SSH_OPTS = [
  '-i', SSH_KEY,
  '-o', 'BatchMode=yes',
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'ConnectTimeout=10',
];

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

/**
 * Execute a command on a remote host via SSH with streaming support.
 * Commands are executed as root on target IPs.
 */
export async function execSsh(ip: string, command: string, options: ExecSshOptions = {}): Promise<SshResult> {
  const { timeoutMs = 30000, onStdout, onStderr, signal } = options;

  return new Promise((resolve) => {
    let stdoutData = '';
    let stderrData = '';
    
    // To send SIGINT instead of SIGTERM when aborting via signal, we need to handle it manually
    // or just let spawn kill it. Actually we want to send \x03 to stdin to interrupt the process.
    // But ssh with no pty might not forward \x03 properly. Alternatively, killing the ssh process
    // with SIGTERM might leave the remote process running unless we use -t. 
    // For simplicity, we just kill the local SSH process.

    const child = spawn('ssh', [...SSH_OPTS, `root@${ip}`, command], {
      signal, // Node 15+ supports AbortSignal natively for spawn
    });

    let timeout: NodeJS.Timeout;
    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        child.kill('SIGTERM');
      }, timeoutMs);
    }

    if (signal) {
      signal.addEventListener('abort', () => {
        // Send SIGINT to the ssh client to try to stop the remote command gracefully if possible,
        // though kill('SIGTERM') is the default.
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

    child.on('error', (err: Error & { code?: string; stdout?: string; stderr?: string }) => {
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
