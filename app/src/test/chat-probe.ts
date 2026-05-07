import { db } from '@/lib/db';
import { users, threads } from '@/lib/db/schema';
import { createId } from '@/lib/db/cuid';
import { ChatService } from '@/lib/chat-service';

async function main() {
  const [user] = await db.select().from(users).limit(1);
  if (!user) {
    console.error('No user found');
    process.exit(1);
  }

  const threadId = createId();
  const requestId = createId();
  
  await db.insert(threads).values({
    id: threadId,
    userId: user.id,
    title: 'Probe Thread',
    model: 'ollama/llama3.2',
  });

  console.log('Running ChatService for ollama/llama3.2...');
  
  const chatService = new ChatService({
    requestId,
    userEmail: user.email!,
    threadId,
    model: 'ollama/llama3.2',
    messages: [
      {
        id: createId(),
        role: 'user',
        content: 'hi',
        createdAt: new Date(),
      }
    ],
    webSearch: false,
    webSearchExplicit: false,
    redis: null,
    routing: { useMemory: false, useSearch: false, allowWebSearch: false, notices: [] },
  });

  const response = await chatService.execute();
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No reader');

  console.log('Streaming response:');
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = new TextDecoder().decode(value);
    process.stdout.write(chunk);
  }
  console.log('\nDone.');
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
