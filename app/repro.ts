
import { ChatService, ChatSession } from "./src/lib/chat-service";
import { getRedisClient } from "./src/lib/redis";
import { UIMessage } from "ai";

async function test() {
  const redis = getRedisClient();
  const chatSession: ChatSession = {
    requestId: "test-request",
    userEmail: "gary@example.com",
    threadId: "test-thread",
    model: "anthropic/claude-4-5-haiku-latest",
    messages: [
      { id: "1", role: "user", content: "hi", parts: [{ type: "text", text: "hi" }] }
    ] as UIMessage[],
    webSearch: false,
    webSearchExplicit: false,
    redis,
    routing: { useRag: false, useMemory: false, allowWebSearch: false, route: "plain" }
  };

  const chatService = new ChatService(chatSession);
  const response = await chatService.execute();
  console.log("Response status:", response.status);
  
  const reader = response.body?.getReader();
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = new TextDecoder().decode(value);
      console.log("Chunk:", text);
    }
  }
}

test().catch(console.error);
