import { NextResponse } from 'next/server';
import { execSsh } from '@/lib/agent/ssh-executor';
import { requireUser } from '@/lib/auth-server';

export async function GET() {
  const authResult = await requireUser();
  if (authResult instanceof NextResponse) return authResult;

  try {
    const result = await execSsh('192.168.0.109', 'cat /home/git/infrastructure/GEMINI.md');
    
    if (result.exitCode !== 0) {
      return NextResponse.json({ error: 'Failed to fetch documentation', details: result.stderr }, { status: 500 });
    }

    return NextResponse.json({ content: result.stdout });
  } catch (err) {
    console.error('Docs API Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
