import { db } from '@/lib/db';
import { settings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getRedisClient } from '@/lib/redis';

async function main() {
  const modelList = [
    { id: 'google/gemini-2.0-flash', label: 'Gemini 2.0 Flash', category: 'Google', isPreset: false, capability: 'high' },
    { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', category: 'Google', isPreset: false, capability: 'high' },
    { id: 'ollama/llama3.2', label: 'Ollama: Llama 3.2', category: 'Local', isPreset: false, capability: 'medium' },
    { id: 'ollama/phi3:mini', label: 'Ollama: Phi-3 Mini', category: 'Local', isPreset: false, capability: 'medium' },
    { id: 'ollama/gemma4:e2b', label: 'Ollama: Gemma 4 e2b', category: 'Local', isPreset: false, capability: 'medium' },
    { id: 'ollama/gemma4:e4b', label: 'Ollama: Gemma 4 e4b', category: 'Local', isPreset: false, capability: 'medium' }
  ];

  console.log('Updating CUSTOM_MODEL_LIST in DB...');
  await db.insert(settings).values({
    key: 'CUSTOM_MODEL_LIST',
    value: JSON.stringify(modelList),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: settings.key,
    set: { value: JSON.stringify(modelList), updatedAt: new Date() }
  });

  const redis = getRedisClient();
  if (redis) {
    await redis.del('setting:CUSTOM_MODEL_LIST');
    console.log('Redis cache cleared.');
  }
  console.log('Settings updated successfully.');
  process.exit(0);
}
main();
