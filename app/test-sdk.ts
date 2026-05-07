
import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import "dotenv/config";

async function test() {
  const result = streamText({
    model: anthropic("claude-3-haiku-20240307"),
    messages: [{ role: "user", content: "hi" }],
  });

  for await (const chunk of result.fullStream) {
    console.log("Chunk type:", chunk.type, "Keys:", Object.keys(chunk));
    if (chunk.type === "text-delta") {
      console.log("  textDelta:", (chunk as any).textDelta);
      console.log("  text:", (chunk as any).text);
      console.log("  delta:", (chunk as any).delta);
    }
  }
}

test().catch(console.error);
