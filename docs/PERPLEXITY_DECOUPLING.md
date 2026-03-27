# Perplexity Integration Decoupling Plan & Implementation

## Overview

This document outlines the architectural changes implemented to move the "Complexity" application from a hardcoded dependency on Perplexity to a completely generic, multi-provider Agentic workspace, making Perplexity entirely optional.

## The Problem

Before this implementation, the codebase relied heavily on the `@perplexity-ai/perplexity_ai` SDK. Even though environmental toggles like `SEARCH_PROVIDER_TYPE` were introduced, the internal flow (specifically `chat-service.ts`, `search-agent.ts`, and `llm.ts`) still hard-imported Perplexity types (e.g., `Responses.InputItem[]`). 

This meant:
1. The SDK was a hard NPM dependency.
2. The core chat pipeline translated generic messages into Perplexity's proprietary format before routing, forcing all models (like Anthropic or OpenAI) through a Perplexity-branded payload structure.
3. Tests and agent instantiation required the presence of the SDK at runtime.

## Implementation Details

### 1. Unified Message Abstraction (`chat-service.ts` & `llm.ts`)
We removed the Perplexity SDK types (`Responses`) from the core chat sequence.
- `chat-service.ts` no longer maps the context window to `agentInput` (using `Responses.InputItem[]`). Instead, it keeps messages natively as `UIMessage[]` and passes them straight to the `runGeneration` router.
- `llm.ts` modified `GenerationOptions` to drop `agentInput` entirely. The router now forwards the generic `UIMessage[]` context directly to `runPerplexityAgent` if the provider dictates it.

### 2. Isolytic Search Agent (`search-agent.ts`)
The `search-agent.ts` file was overhauled completely to decouple the execution runtime from the proprietary SDK:
- **Native Types**: Updated `SearchAgentOptions` to accept `messages: UIMessage[]`. The file now parses `UIMessage[]` into the exact JSON structure Perplexity requires immediately before the HTTP request.
- **Removed SDK Dependency**: Removed the heavy `createAgentClient` wrapper. 
- **Fetch Fallback**: Originally, the streaming branch used raw `fetch` to handle Server-Sent Events (SSE), but the fallback for non-streaming errors bizarrely relied on `client.responses.create(...)` via the SDK. This fallback was rewritten to use standard `fetch`, allowing us to drop the SDK entirely.

### 3. Client Deprecation (`agent-client.ts`)
Because `search-agent.ts` now uses raw standard `fetch` APIs under the hood, `agent-client.ts`—which previously housed the global Perplexity client initialization—has been officially rendered obsolete and emptied.

### 4. Codebase Hygiene (`package.json` & Tests)
- **Dependencies**: `@perplexity-ai/perplexity_ai` was stripped completely from `package.json` `dependencies`.
- **Unit Tests**: `search-agent.test.ts` migrated to mocking `global.fetch` rather than spying on the SDK instance, ensuring tests reliably validate the updated REST semantics.
- **Obsolete Tests**: `agent-smoke.test.ts` and `model-prompts.test.ts` were gutted. Both previously relied on the direct `client.responses.create` SDK methods to smoke-test external remote endpoints, which is an anti-pattern for our test suite when the SDK is successfully decoupled.

## Conclusion

By standardizing around `UIMessage[]` and implementing generic `fetch` calls, the application is now truly provider-agnostic. The Perplexity Agent API functions identically to direct models (like Anthropic, OpenAI) as an optional plugin, while eliminating mandatory SDK bloat and tight architectural coupling.
