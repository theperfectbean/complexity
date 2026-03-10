# Streaming UI Fix

## Issue Description
Users reported that after sending a prompt, the UI remained empty (no streaming text appeared). However, navigating away and back revealed the full response. This indicated that the response was being successfully generated and saved to the database on the server, but the client-side streaming logic was failing to render incoming tokens.

## Root Cause Analysis
The project uses `@ai-sdk/react` v3 and `ai` v6. These versions implement a protocol where streamed message content is accumulated into a `parts` array within the `UIMessage` object.

The frontend logic in `app/src/app/search/[threadId]/page.tsx` was primarily looking at the `content` property or a limited set of properties within `parts`. Specifically:
1.  The extraction logic was too strict with `.trim()`, potentially ignoring early whitespace tokens.
2.  It did not account for the various property names used for text deltas (`text`, `delta`, `textDelta`) across different protocol versions or internal SDK states.
3.  Citations were being saved to the database but were not included in the UI streaming protocol, leading to a "pop-in" effect only after a refresh.

## Implementation Details

### 1. Robust UI Text Extraction
The mapping function for `liveMessages` was refactored to be more resilient:
-   **Multi-step Fallback:** It now checks `msg.content` (string), then iterates through `msg.parts` checking for `text`, `textDelta`, or `delta`, and finally checks top-level `msg.text` or `msg.delta`.
-   **Type Safety:** Replaced `any` with `Record<string, unknown>` and proper type casting to satisfy linting rules and improve maintainability.
-   **Zero-Width Space Fallback:** Uses `\u200B` instead of empty strings to ensure the UI has a valid node to render during the "thinking" phase before the first token arrives.

### 2. Real-time Citation Streaming
The server-side route `/api/chat/route.ts` was updated to stream citations as soon as the Agent API completes:
-   **`source-url` Chunks:** After the Perplexity API returns, citations are extracted and written to the `UIMessageStream` using the `source-url` part type.
-   **Cache Support:** The cached response path was also updated to stream these citations immediately upon a cache hit.

### 3. Client-side Citation Parsing
The frontend now scans `msg.parts` for `source-url` and `source-document` types. When found, these are converted into `ChatCitation` objects and passed to the `MessageList` component, enabling source links to appear in real-time.

## Verification
-   **Manual Inspection:** Verified property names against AI SDK `UIMessageChunk` definitions.
-   **Linting:** `npm run lint` passes with no errors in the affected files.
-   **Build:** The extraction logic is robust against missing properties, preventing runtime crashes if the protocol changes.
