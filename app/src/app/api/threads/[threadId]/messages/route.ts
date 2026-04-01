import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { createId } from '@/lib/db/cuid';
import { messages, threads } from '@/lib/db/schema';
import { requireUserOrApiToken } from '@/lib/auth-server';

const schema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1),
  model: z.string().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const authResult = await requireUserOrApiToken(request);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { threadId } = await params;
  const body = await request.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Verify thread ownership
  const thread = await db.query.threads.findFirst({
    where: eq(threads.id, threadId),
  });

  if (!thread || thread.userId !== authResult.user.id) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
  }

  const id = createId();
  await db.insert(messages).values({
    id,
    threadId,
    role: parsed.data.role,
    content: parsed.data.content,
    model: parsed.data.model ?? null,
  });

  return NextResponse.json({ ok: true, id });
}
