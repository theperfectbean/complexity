import { describe, it, expect, vi } from 'vitest';
import { POST } from '@/app/api/chat/route';
import { db } from '@/lib/db';
import { users, threads, messages } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createId } from '@/lib/db/cuid';
import { createOllama } from 'ai-sdk-ollama';
import { generateText } from 'ai';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { auth } from '@/auth';

const maybeIt = process.env.RUN_OLLAMA_E2E === '1' ? it : it.skip;

describe('Ollama E2E', () => {
  maybeIt('direct provider probe (phi3:mini)', async () => {
    const ollama = createOllama({ baseURL: 'http://192.168.0.114:11434' });
    const { text } = await generateText({
      model: ollama('phi3:mini'),
      prompt: 'hi',
    });
    expect(text.length).toBeGreaterThan(0);
    console.log('Direct probe success:', text);
  });

  const models = ["ollama/llama3.2"]

  for (const modelId of models) {
      maybeIt(`generates a response via /api/chat using ${modelId}`, async () => {
      const [user] = await db.select().from(users).limit(1);
      if (!user) throw new Error('No user found');

      vi.mocked(auth).mockResolvedValue({
        user: { email: user.email },
      } as Awaited<ReturnType<typeof auth>>);

      const threadId = createId();
      await db.insert(threads).values({
        id: threadId,
        userId: user.id,
        title: `Ollama E2E - ${modelId}`,
        model: modelId,
      });

      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId,
          model: modelId,
          messages: [
            {
              role: 'user',
              parts: [{ type: 'text', text: 'hi' }],
            },
          ],
        }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
      
      await new Promise(r => setTimeout(r, 2000));

      const [assistantMsg] = await db
        .select()
        .from(messages)
        .where(and(eq(messages.threadId, threadId), eq(messages.role, 'assistant')))
        .limit(1);

      expect(assistantMsg).toBeDefined();
      expect(assistantMsg.content).not.toContain('Model request failed');
      console.log(`Chat route ${modelId} success: `, assistantMsg.content?.slice(0, 50));

      await db.delete(threads).where(eq(threads.id, threadId));
    }, 60000);
  }
});
