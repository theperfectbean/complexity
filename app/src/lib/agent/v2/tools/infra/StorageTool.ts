import { sshExec } from '../base/SshTool';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function disk_usage(): Promise<object> {
  const [nas, media, ai] = await Promise.all([
    sshExec('node02',   'df -h / /data /mnt/disk3 2>/dev/null || df -h /'),
    sshExec('node01', 'df -h / /mnt/media 2>/dev/null || df -h /'),
    sshExec('node03',    'df -h / /data 2>/dev/null || df -h /'),
  ]);
  return {
    nas:   nas.stdout,
    media: media.stdout,
    ai:    ai.stdout,
  };
}

export async function disk_usage_path(params: { path: string }): Promise<object> {
  const path = params.path;
  const [nas, media, ai] = await Promise.all([
    sshExec('node02', `df -h ${shellQuote(path)} 2>/dev/null || true`),
    sshExec('node01', `df -h ${shellQuote(path)} 2>/dev/null || true`),
    sshExec('node03', `df -h ${shellQuote(path)} 2>/dev/null || true`),
  ]);

  const results = Object.fromEntries(
    Object.entries({
      nas: nas.stdout.trim(),
      media: media.stdout.trim(),
      ai: ai.stdout.trim(),
    }).filter(([, output]) => output.length > 0),
  );

  return { path, results };
}

export async function find_large_files(params: { path: string; top?: number }): Promise<object> {
  const node = params.path.includes('/mnt') || params.path.includes('/data') ? 'node02' : 'node03';
  const n = params.top ?? 20;
  const r = await sshExec(node, `du -sh ${params.path}/* 2>/dev/null | sort -rh | head -${n}`);
  return { path: params.path, files: r.stdout, exitCode: r.exitCode };
}

export async function storage_pool_status(): Promise<object> {
  const [nas, media, ai] = await Promise.all([
    sshExec('node02',   'pvesm status 2>/dev/null || echo "pvesm unavailable"'),
    sshExec('node01', 'pvesm status 2>/dev/null || echo "pvesm unavailable"'),
    sshExec('node03',    'pvesm status 2>/dev/null || echo "pvesm unavailable"'),
  ]);
  return { nas: nas.stdout, media: media.stdout, ai: ai.stdout };
}

export async function journal_disk_usage(): Promise<object> {
  const [nas, media, ai] = await Promise.all([
    sshExec('node02',   'journalctl --disk-usage 2>/dev/null'),
    sshExec('node01', 'journalctl --disk-usage 2>/dev/null'),
    sshExec('node03',    'journalctl --disk-usage 2>/dev/null'),
  ]);
  return { nas: nas.stdout, media: media.stdout, ai: ai.stdout };
}

export async function snapraid_status(): Promise<object> {
  const r = await sshExec('node02', 'snapraid status 2>&1 || echo "snapraid not configured"');
  return { output: r.stdout, exitCode: r.exitCode };
}

export async function truncate_logs(params: { path: string; maxMB?: number }): Promise<object> {
  const node = 'node02';
  const maxMB = params.maxMB ?? 50;
  const r = await sshExec(node, `find ${params.path} -name "*.log" -size +${maxMB}M -exec truncate -s 0 {} \\; -print 2>&1`);
  return { path: params.path, output: r.stdout, exitCode: r.exitCode };
}

export async function nfs_mount_status(): Promise<object> {
  const r = await sshExec('node01', 'mountpoint /mnt/media && df -h /mnt/media && showmount -e 192.168.0.202 2>/dev/null | head -5');
  return { output: r.stdout, exitCode: r.exitCode };
}
