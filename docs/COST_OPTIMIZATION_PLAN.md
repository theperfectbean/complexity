# Cost Optimization Plan

Last reviewed: 2026-03-27

## Problem Statement

Complexity was originally aiming to replicate the best parts of premium chat frontends such as Claude and Perplexity in a self-hosted product. In practice, the naive implementation path was too expensive because the application was paying for:

- web-grounded requests on too many turns
- embeddings and hybrid retrieval on prompts that did not need RAG
- frequent memory extraction and semantic memory lookup
- non-core AI calls such as title generation and instruction generation
- eager document ingestion for uploads that might never be queried
- expensive default model choices

The goal of this plan is not feature parity with premium hosted products. The goal is to deliver most of the value at materially lower operating cost through routing, guardrails, caching, and cheaper model usage.

## Strategy

The cost strategy for this codebase is:

1. Default to the cheapest path that can still answer correctly.
2. Only pay for search, RAG, memory, or premium models when the user turn actually needs them.
3. Prefer degradation over silent runaway spend.
4. Treat telemetry and budgets as first-class product features.
5. Keep search-native providers optional rather than foundational.

## Completed Work

### Phase 1: Cheaper Defaults

Implemented in:

- `app/src/app/api/chat/route.ts`
- `app/src/components/search/SearchBar.tsx`
- `app/src/app/page.tsx`
- `app/src/app/roles/[roleId]/page.tsx`
- `app/src/app/search/[threadId]/page.tsx`
- `app/src/app/api/threads/route.ts`
- `app/src/lib/config.ts`
- `app/src/lib/env.ts`

Changes:

- Web search is off by default.
- Thread title generation is off by default.
- New threads fall back to truncation for titles unless AI title generation is explicitly enabled.

Outcome:

- Fewer paid search/fetch calls.
- One less model call on thread creation.

### Phase 2: Retrieval and Memory Gating

Implemented in:

- `app/src/lib/chat/ContextAssembler.ts`
- `app/src/lib/memory/MemoryExtractor.ts`
- `app/src/lib/memory/MemoryStore.ts`

Changes:

- RAG retrieval only runs when the prompt contains document/file/role-grounding signals.
- Memory extraction now skips ephemeral turns and only runs on a reduced schedule.
- Semantic memory lookup is gated so short/simple turns do not pay an embedding cost.

Outcome:

- Reduced per-turn embedding spend.
- Reduced background memory extraction calls.

### Phase 3: Ingestion Cost Controls

Implemented in:

- `app/src/lib/worker.ts`
- `app/src/app/api/roles/[roleId]/ingest-url/route.ts`
- `app/src/lib/config.ts`
- `app/src/lib/env.ts`

Changes:

- Added hard caps on extracted text length and chunk count.
- URL ingestion now respects the configured upload size limit.

Outcome:

- Large uploads cannot explode embedding cost silently.

### Phase 4: Cost Visibility

Implemented in:

- `app/src/lib/cost-estimation.ts`
- `app/src/lib/chat-service.ts`
- `app/src/app/api/admin/analytics/route.ts`
- `app/src/components/admin/AnalyticsDashboard.tsx`

Changes:

- Added heuristic assistant cost estimation based on stored token/search/fetch usage.
- Added per-request estimated cost logging.
- Added approximate total assistant spend visibility in admin analytics.

Outcome:

- The application can now be tuned from observed usage instead of guesswork.

### Phase 5: Cheaper Implicit Model Defaults

Implemented in:

- `app/src/lib/models.ts`
- `app/src/lib/available-models.ts`

Changes:

- When no explicit user or environment default is configured, the app now prefers a cheaper non-preset model rather than a premium default.

Outcome:

- New chats start from a lower-cost baseline.

### Phase 6: Routing, Budgets, and Optional-Feature Downgrades

Implemented in:

- `app/src/lib/chat-routing.ts`
- `app/src/lib/chat-budget.ts`
- `app/src/app/api/chat/route.ts`
- `app/src/lib/chat-service.ts`
- `app/src/lib/chat/ContextAssembler.ts`
- `app/src/app/api/roles/generate-instructions/route.ts`

Changes:

- Added explicit routing decisions for `plain`, `memory`, `rag`, and `web`.
- Added daily budget tracking for input tokens, output tokens, searches, and fetches.
- Added graceful degradation:
  - disable web search when search budgets are exhausted
  - downgrade the model when token budgets are exhausted
- Added Redis-backed RAG query caching for repeated prompts.
- Switched role-instruction generation to a cheaper default model and added caching.

Outcome:

- Costly capabilities are now conditional and budget-aware rather than always available.

## Runtime Controls

The following environment variables now influence cost behavior:

- `CHAT_DEFAULT_WEB_SEARCH`
- `CHAT_ENABLE_TITLE_GENERATION`
- `CHAT_TITLING_MODEL`
- `CHAT_ROLE_INSTRUCTION_MODEL`
- `CHAT_ROLE_INSTRUCTION_CACHE_TTL_SECONDS`
- `CHAT_DAILY_INPUT_TOKEN_BUDGET`
- `CHAT_DAILY_OUTPUT_TOKEN_BUDGET`
- `CHAT_DAILY_SEARCH_BUDGET`
- `CHAT_DAILY_FETCH_BUDGET`
- `RAG_QUERY_CACHE_TTL_SECONDS`
- `ROLE_UPLOAD_MAX_FILE_SIZE`
- `ROLE_UPLOAD_MAX_EXTRACTED_CHARS`
- `ROLE_UPLOAD_MAX_CHUNKS`

Defaults are intentionally conservative and should be adjusted after observing real usage in admin analytics.

## Current Architectural Position

The application should now be thought of as:

- a standard chat/RAG app first
- with optional web grounding
- with explicit cost routing
- with premium models as escalation paths, not defaults

This is a deliberate move away from “always-on Perplexity clone” behavior.

## Model Recommendations

### Principle

Do not pick one model family and use it for everything.

Use model routing:

- cheapest acceptable model for normal turns
- search-native or search-grounded path only when freshness is required
- premium frontier models only for escalation

### Recommended Model Tiers

For this app, the most promising structure is:

- Default chat and RAG:
  - strong cheap general model
  - examples: `google/gemini-2.5-flash`, a strong open model behind a local OpenAI-compatible endpoint, or `openai/gpt-5-mini`
- Helper and background tasks:
  - cheapest acceptable model
  - examples: `google/gemini-2.5-flash-lite`, `openai/gpt-5-mini`, or a small local/open model
- Search-grounded mode:
  - provider specialized for freshness and citations
- Premium escalation:
  - frontier reasoning model only when required

### Open Model Consideration

Open models are a major part of the cost strategy and should not be treated as an afterthought.

For this app, open models are attractive because they can serve:

- default chat
- RAG over uploaded documents
- rewrites and summarization
- helper/background tasks

Typical candidates worth evaluating for this product shape:

- Qwen-family instruct models
- Llama-family instruct models
- DeepSeek-family distilled models
- other strong OpenAI-compatible self-hosted instruct models

Open models only win economically if:

- they are deployed on hardware with good utilization
- they are routed correctly
- premium providers remain fallback paths instead of the default path

## Search Provider Decision

### Why Search-Native Providers Exist

Search-native providers are not just “a regular model with a search tool.” They package:

- query planning
- result grounding
- citation behavior
- freshness-oriented answer synthesis

### Recommendation For This App

The ranking for this codebase is:

1. cheap/open model plus the app’s own search tool
2. Brave AI Answers as an optional answer API
3. Perplexity Sonar as an optional premium search mode
4. Gemini plus Google Search grounding only if there is a specific Google-stack reason

Reasoning:

- The app already has its own routing, caching, and cost controls.
- That makes “general model plus search tool” the best control and economics path.
- Search-native providers should remain optional paths, not the center of the architecture.

### Brave vs Sonar vs In-House Search

Use in-house search plus a general model when:

- cost and control are the main priorities
- you want domain filtering, caching, and custom routing

Use Brave AI Answers when:

- you want a direct grounded-answer API without Perplexity
- you want search-native behavior without turning the whole app into a Sonar-first product

Use Sonar when:

- you want the best turnkey search-grounded UX
- you are willing to pay for it on the subset of turns where it matters

## Operating Guidance

### What To Watch In Analytics

Review:

- approximate cost by model
- search count and fetch count by model
- prompt/completion token distribution
- how often budgets trigger degradation

If budgets trigger too often:

- raise them only after checking whether the routing logic is too permissive
- do not solve a routing problem by simply increasing the spend ceiling

### What To Tune First

If cost remains too high, tune in this order:

1. default model choice
2. web-search routing threshold
3. RAG routing threshold
4. memory lookup threshold
5. daily budgets

### What Not To Do

Avoid:

- using a search-native provider as the default chat path
- using premium models for titles, extraction, or instruction generation
- embedding every prompt in a role thread
- assuming hosted premium UX can be replicated economically by default settings

## Suggested Next Follow-Up

The implementation work is largely done. The next work should be evaluation, not blind feature addition.

Recommended follow-up:

1. Run a real traffic sample through the new analytics.
2. Compare cheap/open defaults against current premium defaults on representative prompts.
3. Decide whether to:
   - keep Sonar as optional premium search mode
   - replace or supplement it with Brave AI Answers
   - move to an open-model-first default stack

## Related Source Files

- `app/src/lib/chat-service.ts`
- `app/src/lib/chat/ContextAssembler.ts`
- `app/src/lib/chat-routing.ts`
- `app/src/lib/chat-budget.ts`
- `app/src/lib/memory/MemoryExtractor.ts`
- `app/src/lib/memory/MemoryStore.ts`
- `app/src/lib/worker.ts`
- `app/src/lib/cost-estimation.ts`
- `app/src/lib/models.ts`
- `app/src/app/api/chat/route.ts`
- `app/src/app/api/threads/route.ts`
- `app/src/app/api/roles/generate-instructions/route.ts`
- `app/src/components/admin/AnalyticsDashboard.tsx`
