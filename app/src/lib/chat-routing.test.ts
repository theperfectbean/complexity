import { describe, expect, it } from "vitest";

import { getChatRoutingDecision, shouldUseMemory, shouldUseRag, shouldUseWebSearch } from "./chat-routing";

describe("chat routing", () => {
  it("detects RAG prompts", () => {
    expect(shouldUseRag("According to the uploaded documents, summarize the findings")).toBe(true);
  });

  it("detects personalization prompts for memory lookup", () => {
    expect(shouldUseMemory("Remember that I prefer concise answers for my project updates")).toBe(true);
  });

  it("triggers memory for short signals like 'again' or 'previous'", () => {
    expect(shouldUseMemory("Do it again like before")).toBe(true);
    expect(shouldUseMemory("As I said yesterday")).toBe(true);
  });

  it("ignores memory for messages that are clearly questions", () => {
    const longQuestion = "How do I calculate the standard deviation for this entire dataset in Python if I am using the pandas library and I want to output the result as a JSON object for the board meeting next week?";
    expect(shouldUseMemory(longQuestion)).toBe(false);
  });

  it("ignores memory for short messages (less than 25 words) without signals", () => {
    expect(shouldUseMemory("I think this is okay")).toBe(false);
    expect(shouldUseMemory("My car is blue")).toBe(false);
  });

  it("triggers memory for substantive personal messages (25+ words)", () => {
    const longMessage = "I have been working on this data science project for three months now and I really need help with the visualization part because I want it to be perfect for the board meeting next week.";
    expect(shouldUseMemory(longMessage)).toBe(true);
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
