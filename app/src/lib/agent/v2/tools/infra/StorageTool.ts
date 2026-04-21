import { sshExec } from '../base/SshTool';

export async function disk_usage(): Promise<object> {
  const [nas, media, ai] = await Promise.all([
    sshExec('nas',   'df -h / /data /mnt/disk3 2>/dev/null || df -h /'),
    sshExec('media', 'df -h / /mnt/media 2>/dev/null || df -h /'),
    sshExec('ai',    'df -h / /data 2>/dev/null || df -h /'),
  ]);
  return {
    nas:   nas.stdout,
    media: media.stdout,
    ai:    ai.stdout,
  };
}

export async function find_large_files(params: { path: string; top?: number }): Promise<object> {
  const node = params.path.includes('/mnt') || params.path.includes('/data') ? 'nas' : 'ai';
  const n = params.top ?? 20;
  const r = await sshExec(node, `du -sh ${params.path}/* 2>/dev/null | sort -rh | head -${n}`);
  return { path: params.path, files: r.stdout, exitCode: r.exitCode };
}

export async function storage_pool_status(): Promise<object> {
  const [nas, media, ai] = await Promise.all([
    sshExec('nas',   'incus storage list 2>/dev/null && incus storage info default 2>/dev/null'),
    sshExec('media', 'incus storage list 2>/dev/null && incus storage info default 2>/dev/null'),
    sshExec('ai',    'incus storage list 2>/dev/null && incus storage info default 2>/dev/null'),
  ]);
  return { nas: nas.stdout, media: media.stdout, ai: ai.stdout };
}

export async function journal_disk_usage(): Promise<object> {
  const [nas, media, ai] = await Promise.all([
    sshExec('nas',   'journalctl --disk-usage 2>/dev/null'),
    sshExec('media', 'journalctl --disk-usage 2>/dev/null'),
    sshExec('ai',    'journalctl --disk-usage 2>/dev/null'),
  ]);
  return { nas: nas.stdout, media: media.stdout, ai: ai.stdout };
}

export async function snapraid_status(): Promise<object> {
  const r = await sshExec('nas', 'snapraid status 2>&1 || echo "snapraid not configured"');
  return { output: r.stdout, exitCode: r.exitCode };
}

export async function truncate_logs(params: { path: string; maxMB?: number }): Promise<object> {
  const node = 'nas';
  const maxMB = params.maxMB ?? 50;
  const r = await sshExec(node, `find ${params.path} -name "*.log" -size +${maxMB}M -exec truncate -s 0 {} \\; -print 2>&1`);
  return { path: params.path, output: r.stdout, exitCode: r.exitCode };
}

export async function nfs_mount_status(): Promise<object> {
  const r = await sshExec('media', 'mountpoint /mnt/media && df -h /mnt/media && showmount -e 192.168.0.202 2>/dev/null | head -5');
  return { output: r.stdout, exitCode: r.exitCode };
}
