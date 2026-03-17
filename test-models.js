import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config({ path: "app/.env" });

async function testModel(modelId) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 10,
      messages: [{ role: "user", content: "hi" }]
    })
  });
  const data = await res.json();
  console.log(modelId, res.status, data.error ? data.error.message : "Success");
}

async function run() {
  await testModel("claude-4-5-sonnet-latest");
  await testModel("claude-4-6-sonnet-latest");
  await testModel("claude-4-sonnet-latest");
  await testModel("claude-4-5-sonnet-20251022");
  await testModel("claude-4-5-sonnet");
  await testModel("claude-4-sonnet");
}
run();
