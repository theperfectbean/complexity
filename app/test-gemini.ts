
import Perplexity from "@perplexity-ai/perplexity_ai";

const apiKey = process.env.PERPLEXITY_API_KEY;
if (!apiKey) {
  console.error("PERPLEXITY_API_KEY not found");
  process.exit(1);
}

const client = new Perplexity({ apiKey });

const model = "google/gemini-3.1-pro-preview";

async function testWithSystemMessage() {
  console.log(`--- Testing ${model} with SYSTEM message in input ---`);
  const input = [
    {
      type: "message",
      role: "system",
      content: [{ type: "input_text", text: "You are a helpful assistant." }],
    },
    {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "Say hello." }],
    },
  ];
  try {
    await client.responses.create({
      model,
      input,
      instructions: "Be concise.",
      tools: [],
    } as unknown as { model: string; input: unknown[]; instructions: string; tools: unknown[] });
    console.log("Success with system message!");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed with system message:", message);
  }
}

async function testWithoutSystemMessage() {
  console.log(`--- Testing ${model} WITHOUT system message in input ---`);
  const input = [
    {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "Say hello." }],
    },
  ];
  try {
    await client.responses.create({
      model,
      input,
      instructions: "Be concise.",
      tools: [],
    } as unknown as { model: string; input: unknown[]; instructions: string; tools: unknown[] });
    console.log("Success without system message!");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed without system message:", message);
  }
}

async function run() {
  await testWithSystemMessage();
  await testWithoutSystemMessage();
}

run();
