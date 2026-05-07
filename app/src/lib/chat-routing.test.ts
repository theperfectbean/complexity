import { describe, expect, it } from "vitest";

import { getChatRoutingDecision, shouldUseMemory, shouldUseRag, shouldUseWebSearch } from "./chat-routing";

describe("chat routing", () => {
  it("detects RAG prompts", () => {
    expect(shouldUseRag("According to the uploaded documents, summarize the findings")).toBe(true);
  });

  it("detects personalization prompts for memory lookup", () => {
    expect(shouldUseMemory("Remember that I prefer concise answers for my project updates")).toBe(true);
  });

  it("detects freshness prompts for web search", () => {
    expect(shouldUseWebSearch("What is the latest OpenAI news today?")).toBe(true);
  });

  it("prefers RAG over auto web search for role-grounded prompts", () => {
    expect(
      getChatRoutingDecision({
        userText: "Use the uploaded files to answer this",
        roleId: "role-1",
        memoryEnabled: true,
      }),
    ).toEqual({
      useRag: true,
      useMemory: false,
      allowWebSearch: false,
      route: "rag",
    });
  });

  it("honors explicit web-search disable", () => {
    expect(
      getChatRoutingDecision({
        userText: "What is the latest weather news today?",
        webSearchRequested: false,
        webSearchExplicit: true,
      }).allowWebSearch,
    ).toBe(false);
  });
});
