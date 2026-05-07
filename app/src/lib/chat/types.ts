import type { UIMessage } from "ai";
import type Redis from "ioredis";
import type { ChatRoutingDecision } from "../chat-routing";

export type Citation = {
  url?: string;
  title?: string;
  snippet?: string;
};

export type CachedChatPayload = {
  text: string;
  citations: Citation[];
};

export interface ChatSession {
  requestId: string;
  userEmail: string;
  threadId: string;
  model: string;
  messages: UIMessage[];
  roleId?: string | null;
  webSearch?: boolean;
  webSearchExplicit?: boolean;
  trigger?: string;
  redis: Redis | null;
  routing?: ChatRoutingDecision;
}

export interface ThreadInfo {
  id: string;
  userId: string;
  roleId: string | null;
  memoryEnabled: boolean | null;
  roleInstructions: string;
  systemPrompt?: string | null;
  compareModels: string[] | null;
}
