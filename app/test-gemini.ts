
import Perplexity from "@perplexity-ai/perplexity_ai";

const apiKey = process.env.PERPLEXITY_API_KEY;
if (!apiKey) {
  console.error("PERPLEXITY_API_KEY not found");
  process.exit(1);
}

const client = new Perplexity({ apiKey });

const model = "google/gemini-3.1-pro-preview";
const prompt = "What is the capital of France? Answer in exactly one word.";
type ResponseCreateParams = Parameters<typeof client.responses.create>[0];

async function runCase({ label, stream, includeSystem, includeTools }: { label: string; stream: boolean; includeSystem: boolean; includeTools: boolean }) {
  console.log(`--- ${label} ---`);
  const input = [];
  if (includeSystem) {
    input.push({
      type: "message",
      role: "system",
      content: [{ type: "input_text", text: "You are a helpful assistant." }],
    });
  }
  input.push({
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: prompt }],
  });

  try {
    const request: ResponseCreateParams = {
      model,
      input: input as ResponseCreateParams["input"],
      instructions: "Be concise.",
      stream,
      ...(includeTools ? { tools: [{ type: "web_search" }, { type: "fetch_url" }] } : {}),
    };

    const result = await client.responses.create(request);
    
    // Type guard for non-streaming response
    let outputText = "";
    if (result && "output_text" in result && typeof result.output_text === "string") {
      outputText = result.output_text;
    }
    
    console.log("Success");
    if (outputText) {
      console.log("Output:", outputText);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Failed:", message);
    if (error && typeof error === "object") {
      console.error("Error object:", JSON.stringify(error, null, 2));
    }
  }
}

async function run() {
  const cases = [
    { label: "non-streaming, no tools, system", stream: false, includeTools: false, includeSystem: true },
    { label: "non-streaming, no tools, no system", stream: false, includeTools: false, includeSystem: false },
    { label: "non-streaming, tools, system", stream: false, includeTools: true, includeSystem: true },
    { label: "non-streaming, tools, no system", stream: false, includeTools: true, includeSystem: false },
    { label: "streaming, no tools, system", stream: true, includeTools: false, includeSystem: true },
    { label: "streaming, no tools, no system", stream: true, includeTools: false, includeSystem: false },
    { label: "streaming, tools, system", stream: true, includeTools: true, includeSystem: true },
    { label: "streaming, tools, no system", stream: true, includeTools: true, includeSystem: false },
  ];

  for (const testCase of cases) {
    await runCase(testCase);
  }
}

run();
