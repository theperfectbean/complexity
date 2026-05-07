import { NextResponse } from 'next/server';
import { execSsh } from '@/lib/agent/ssh-executor';
import { requireUser } from '@/lib/auth-server';

interface ProxmoxNode {
  node?: string;
  status?: string;
  uptime?: number;
  cpu?: number;
  mem?: number;
  maxmem?: number;
}

export async function GET() {
  const authResult = await requireUser();
  if (authResult instanceof NextResponse) return authResult;

  try {
    // Single call to pve01 returns cluster-wide metrics
    const result = await execSsh('192.168.0.201', 'pvesh get /nodes --output-format=json');
    
    if (result.exitCode !== 0) {
      return NextResponse.json({ error: 'Failed to fetch Proxmox metrics', details: result.stderr }, { status: 500 });
    }

    const nodes = JSON.parse(result.stdout) as ProxmoxNode[];
    
    // Process nodes to match the expected schema
    const processedNodes = nodes.map((node) => ({
      name: node.node,
      status: node.status === 'online' ? 'online' : 'offline',
      uptime: node.uptime || 0,
      cpu: node.cpu || 0,
      mem: node.mem && node.maxmem ? node.mem / node.maxmem : 0,
    }));

    return NextResponse.json({ nodes: processedNodes });
  } catch (err) {
    console.error('Proxmox Health API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
