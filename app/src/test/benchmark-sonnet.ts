import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import Perplexity from "@perplexity-ai/perplexity_ai";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from root or app
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

async function benchmarkAnthropic(prompt: string) {
  console.log("\n--- Starting Anthropic (Direct) ---");
  const modelId = "claude-sonnet-4-6";
  const startTime = Date.now();
  let firstTokenTime = 0;
  let totalChars = 0;

  try {
    const { textStream } = streamText({
      model: anthropic(modelId), 
      messages: [{ role: "user", content: prompt }],
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    for await (const text of textStream) {
      if (firstTokenTime === 0) {
        firstTokenTime = Date.now();
        console.log(`Time to first token (Anthropic - ${modelId}): ${firstTokenTime - startTime}ms`);
      }
      totalChars += text.length;
    }

    const endTime = Date.now();
    if (firstTokenTime === 0) throw new Error("No tokens received");

    console.log(`Total response time (Anthropic - ${modelId}): ${endTime - startTime}ms`);
    console.log(`Approximate chars/sec (Anthropic - ${modelId}): ${(totalChars / ((endTime - startTime) / 1000)).toFixed(2)}`);
    
    return {
      ttft: firstTokenTime - startTime,
      total: endTime - startTime,
      chars: totalChars,
      modelUsed: modelId
    };
  } catch (error: any) {
    console.error(`Anthropic benchmark failed with ${modelId}:`, error);
    return null;
  }
}

async function benchmarkPerplexity(prompt: string) {
  console.log("\n--- Starting Perplexity (Agent API) ---");
  const modelId = "anthropic/claude-sonnet-4-6";
  const startTime = Date.now();
  let firstTokenTime = 0;
  let totalChars = 0;

  try {
    const client = new Perplexity({ apiKey: process.env.PERPLEXITY_API_KEY });
    const stream = await client.responses.create({
      model: modelId, 
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: prompt }],
        },
      ],
      stream: true,
    });

    for await (const event of stream as any) {
      if (event.type === "response.output_text.delta") {
        if (firstTokenTime === 0) {
          firstTokenTime = Date.now();
          console.log(`Time to first token (Perplexity): ${firstTokenTime - startTime}ms`);
        }
        totalChars += (event.delta || "").length;
      } else if (event.type === "response.output_text.done") {
        if (event.text && totalChars === 0) {
          totalChars = event.text.length;
        }
      }
    }

    const endTime = Date.now();
    if (firstTokenTime === 0) {
       firstTokenTime = endTime; 
    }

    console.log(`Total response time (Perplexity): ${endTime - startTime}ms`);
    console.log(`Approximate chars/sec (Perplexity): ${(totalChars / ((endTime - startTime) / 1000)).toFixed(2)}`);

    return {
      ttft: firstTokenTime - startTime,
      total: endTime - startTime,
      chars: totalChars,
    };
  } catch (error: any) {
    console.error(`Perplexity benchmark failed with ${modelId}:`, error);
    return null;
  }
}

async function runBenchmark() {
  const prompt = "Explain quantum entanglement in 200 words.";
  
  console.log(`Prompt: "${prompt}"`);
  
  try {
    const anthropicResult = await benchmarkAnthropic(prompt);
    const perplexityResult = await benchmarkPerplexity(prompt);

    if (anthropicResult && perplexityResult) {
      console.log("\n--- Summary ---");
      console.log(`Anthropic (${anthropicResult.modelUsed}) TTFT: ${anthropicResult.ttft}ms, Total: ${anthropicResult.total}ms, Chars: ${anthropicResult.chars}`);
      console.log(`Perplexity (anthropic/claude-sonnet-4-6) TTFT: ${perplexityResult.ttft}ms, Total: ${perplexityResult.total}ms, Chars: ${perplexityResult.chars}`);
      
      const ttftDiff = (perplexityResult.ttft - anthropicResult.ttft).toFixed(0);
      const totalDiff = (perplexityResult.total - anthropicResult.total).toFixed(0);
      
      console.log(`\nPerplexity is ${ttftDiff}ms slower for first token.`);
      console.log(`Perplexity is ${totalDiff}ms slower for total response.`);
    } else {
      console.log("\nOne or both benchmarks failed.");
    }
  } catch (error) {
    console.error("Benchmark failed:", error);
  }
}

runBenchmark();
