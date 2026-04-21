import 'dotenv/config';
import { AgentService } from '@/lib/agent/AgentService';
import { RedisAgentRunStore } from '@/lib/agent/run-store';
import { getRedisClient } from '@/lib/redis';
import { getLanguageModel } from '@/lib/llm';
import { CLUSTER_SYSTEM_PROMPT } from '@/lib/agent/cluster-context';
import { clusterTools } from '@/lib/agent/cluster-tools';
import { createId } from '@/lib/db/cuid';
import { getApiKeys } from '@/lib/settings';
import type { AgentStreamEvent } from '@/lib/agent/protocol';

async function main() {
  const redis = getRedisClient();
  const runStore = new RedisAgentRunStore(redis);
  
  // Create a promise that resolves when the run is completed or waiting
  let resolveDone!: (val: string) => void;
  const donePromise = new Promise<string>(resolve => { resolveDone = resolve; });

  const service = new AgentService({
    llm: { streamAgentResponse: (await import('@/lib/llm')).streamAgentResponse },
    tools: clusterTools,
    runStore,
    eventBus: {
      async emit(event) {
        console.log(`[EVENT ${event.type}]`, formatEventForLog(event));
        if (event.type === 'run_status' && event.status === 'completed') {
            resolveDone('completed');
        }
        if (event.type === 'run_status' && event.status === 'waiting_for_approval') {
            resolveDone('waiting_for_approval');
        }
        if (event.type === 'error') {
            resolveDone('error');
        }
      },
    },
  });

  const modelId = 'ollama/gemma4:e2b';
  const keys = await getApiKeys();
  const model = await getLanguageModel(modelId, keys);
  const runId = createId();
  const sessionId = createId();

  console.log('--- STARTING AGENT MISSION ---');
  // startRun triggers the loop in the background, but we need to keep the process alive
  await service.startRun({
    runId,
    sessionId,
    agentId: 'console-test',
    userMessage: 'Check disk space on pve02 staging mount and report any issues.',
    model,
    modelId,
    system: CLUSTER_SYSTEM_PROMPT,
    messages: [],
    actorId: 'test-user',
    autoApproveReadOnly: true,
    abortSignal: new AbortController().signal,
  });

  const result = await donePromise;
  console.log(`--- MISSION STATUS: ${result} ---`);

  if (result === 'waiting_for_approval') {
      console.log('Simulating auto-approval for the plan...');
      const state = await runStore.load(runId);
      await service.approveMissionPlan({
          runId,
          approved: true,
          reviewerId: 'test-user',
          comment: 'Auto-approving for e2e test'
      }, model);
      
      // Wait for completion again
      const finalResult = await new Promise(resolve => {
          const check = setInterval(async () => {
              const s = await runStore.load(runId);
              if (s?.messageHistory.some(m => m.role === 'assistant' && typeof m.content === 'string' && m.content.length > 50)) {
                  clearInterval(check);
                  resolve('completed');
              }
          }, 2000);
      });
      console.log(`--- FINAL MISSION STATUS: ${finalResult} ---`);
  }

  process.exit(0);
}

function formatEventForLog(event: AgentStreamEvent): string {
  if (event.type === 'assistant_message') {
    return event.message.text;
  }
  return JSON.stringify(event);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
