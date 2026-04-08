import { NextResponse } from "next/server";
import { z } from "zod";

import { ApiResponse } from "@/lib/api-response";
import { requireUserOrApiToken } from "@/lib/auth-server";
import { createId } from "@/lib/db/cuid";
import { getApiKeys } from "@/lib/settings";
import { getLogger } from "@/lib/logger";
import { getLanguageModel } from "@/lib/llm";
import { getRedisClient } from "@/lib/redis";
import { AgentService, type AgentRunState } from "@/lib/agent/AgentService";
import { RedisAgentRunStore } from "@/lib/agent/run-store";
import { RedisAgentEventStore } from "@/lib/agent/event-store";
import type { AgentStreamEvent } from "@/lib/agent/protocol";


const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.unknown(),
  toolName: z.string().optional(),
  toolCallId: z.string().optional(),
});

const startSchema = z.object({
  action: z.literal("start"),
  runId: z.string().min(1).optional(),
  sessionId: z.string().min(1).optional(),
  agentId: z.string().min(1).default("console"),
  actorId: z.string().min(1),
  modelId: z.string().min(1),
  system: z.string().default(""),
  userMessage: z.string().min(1),
  messages: z.array(messageSchema).default([]),
});

const approveSchema = z.object({
  action: z.literal("approve"),
  runId: z.string().min(1),
  approved: z.boolean(),
  reviewerId: z.string().min(1),
  comment: z.string().optional(),
});

const replySchema = z.object({
  action: z.literal("reply"),
  runId: z.string().min(1),
  answer: z.string().min(1),
  actorId: z.string().min(1),
  modelId: z.string().min(1),
});

const requestSchema = z.discriminatedUnion("action", [startSchema, approveSchema, replySchema]);



async function buildService() {
  const redis = getRedisClient();
  const runStore = new RedisAgentRunStore(redis);
  const eventStore = new RedisAgentEventStore(redis);

  const service = new AgentService({
    llm: { streamAgentResponse: (await import("@/lib/llm")).streamAgentResponse },
    tools: (await import("@/lib/agent/cluster-tools")).clusterTools,
    runStore,
    eventBus: {
      async emit(event: AgentStreamEvent) {
        await eventStore.append(event.runId, event);
      },
    },
  });

  return { service, runStore, eventStore };
}

export async function POST(request: Request) {
  const authResult = await requireUserOrApiToken(request);
  if (authResult instanceof NextResponse) return authResult;
  const { service, runStore, eventStore } = await buildService();
  const log = getLogger(createId());
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return ApiResponse.badRequest("Invalid payload", parsed.error.format());
  }


  const abortController = new AbortController();
  const redis = getRedisClient();
  const subscriber = redis?.duplicate();
  let runIdForAbort: string | undefined;

  const subscribeToAbort = (id: string) => {
    runIdForAbort = id;
    if (subscriber) {
      subscriber.subscribe(`agent:abort:${id}`);
      subscriber.on("message", (channel, message) => {
        if (channel === `agent:abort:${id}` && message === "abort") {
          abortController.abort(new Error("Run cancelled by user"));
        }
      });
    }
  };

  const cleanupSubscription = () => {
    if (subscriber && runIdForAbort) {
      subscriber.unsubscribe(`agent:abort:${runIdForAbort}`);
      subscriber.quit();
    }
  };

  if (parsed.data.action === "start") {
    const keys = await getApiKeys();
    const runId = parsed.data.runId ?? createId();
    const sessionId = parsed.data.sessionId ?? parsed.data.runId ?? createId();
    const model = await getLanguageModel(parsed.data.modelId, keys);
    const messages = parsed.data.messages.map((message): AgentRunState["messageHistory"][number] => ({
      role: message.role,
      content: message.content,
      toolName: message.toolName,
      toolCallId: message.toolCallId,
    }));

    subscribeToAbort(runId);

    const userMessage = parsed.data.userMessage;
    try {
      await service.startRun({
        runId,
        sessionId,
        agentId: parsed.data.agentId,
        userMessage,
        model,
        modelId: parsed.data.modelId,
        system: parsed.data.system,
        messages,
        actorId: parsed.data.actorId,
        autoApproveReadOnly: authResult.user.autoApproveReadOnly ?? false,
        abortSignal: abortController.signal,
      });
    } catch (error) {
      log.error({ err: error }, "Agent run start failed");
      cleanupSubscription();
      return ApiResponse.error(error instanceof Error ? error.message : "Agent start failed", 500, error);
    }

    cleanupSubscription();
    return NextResponse.json({
      ok: true,
      runId,
      sessionId,
      state: await runStore.load(runId),
    });
  } else if (parsed.data.action === "reply") {
    const state = await runStore.load(parsed.data.runId);
    if (!state) {
      return ApiResponse.notFound("Run not found");
    }

    const keys = await getApiKeys();
    const model = await getLanguageModel(parsed.data.modelId || state.modelId, keys);
    
    subscribeToAbort(parsed.data.runId);

    try {
      await service.replyToQuestion(
        {
          runId: parsed.data.runId,
          answer: parsed.data.answer,
          actorId: parsed.data.actorId || state.actorId || "",
          abortSignal: abortController.signal,
        },
        model,
      );
    } catch (error) {
      log.error({ err: error }, "Agent reply failed");
      cleanupSubscription();
      return ApiResponse.error(error instanceof Error ? error.message : "Reply failed", 500, error);
    }

    cleanupSubscription();
    return NextResponse.json({
      ok: true,
      runId: parsed.data.runId,
      state: await runStore.load(parsed.data.runId),
    });
  }

  const state = await runStore.load(parsed.data.runId);
  if (!state) {
    return ApiResponse.notFound("Run not found");
  }

  const keys = await getApiKeys();
  const model = await getLanguageModel(state.modelId, keys);
  
  subscribeToAbort(parsed.data.runId);

  try {
    await service.approveMissionPlan(
      { ...parsed.data, abortSignal: abortController.signal },
      model,
      state.system ?? "",
      state.actorId ?? parsed.data.reviewerId,
    );
  } catch (error) {
    log.error({ err: error }, "Agent approval failed");
    cleanupSubscription();
    return ApiResponse.error(error instanceof Error ? error.message : "Approval failed", 500, error);
  }

  cleanupSubscription();
  return NextResponse.json({
    ok: true,
    runId: parsed.data.runId,
    state: await runStore.load(parsed.data.runId),
  });
}

export async function GET(request: Request) {
  const authResult = await requireUserOrApiToken(request);
  if (authResult instanceof NextResponse) return authResult;

  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");
  if (!runId) return ApiResponse.badRequest("runId is required");

  const runStore = new RedisAgentRunStore(getRedisClient());
  const state = await runStore.load(runId);
  if (!state) return ApiResponse.notFound("Run not found");

  return NextResponse.json({ ok: true, state });
}