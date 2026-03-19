# Complexity — Feature Expansion & Improvement Plan

## Current State Summary

The project is a well-architected, self-hosted AI search/RAG workspace at a strong milestone:

**What's solid:**
- Multi-provider streaming chat (Anthropic, OpenAI, Google, xAI, Perplexity, Ollama, Local OpenAI)
- Roles/Spaces with background document processing (BullMQ), chunking & pgvector RAG
- Memory system with auto-extraction and semantic search
- Voice input (MediaRecorder → Whisper via embedder service)
- File attachments (PDF, DOCX, TXT, MD, images)
- Charts via `chart` code block interception (Recharts)
- Command palette (Cmd+K), keyboard shortcuts
- Admin console: provider keys, model management, user management
- Security: AES-256-GCM encrypted API keys, CSRF, nonce-based CSP, rate limiting
- Testing: 123+ unit tests + 17 Playwright E2E test files
- Observability: Pino structured logging
- Automated DB migrations on container start
- Data resilience: bind-mount persistence, 7-day pg_dump backups

---

## Opportunity Areas

### A. Chat & Conversation Quality
Gaps in conversation features compared to commercial tools.

1. **Message Editing** — Users can only regenerate, not edit a prior user message and re-run from there. This is a major missing QoL feature present in every competitor.
2. **Conversation Branching** — Editing a message could create a branch; or explicit "fork thread" from a message point.
3. **Thread Export** — Export full conversation as Markdown or PDF. Simple, high value.
4. **Per-Thread System Prompt Override** — Currently `ContextAssembler` uses the role instructions. Allow a user to add a free-form system prompt note per thread.
5. **Context Window Transparency** — No indicator of how many tokens have been consumed or how close the context limit is.
6. **Streaming Token Count** — Display estimated token count during/after streaming (from response metadata where available).
7. **Search Within Thread** — Ctrl+F-style search within a conversation (client-side).

### B. Roles / Spaces & RAG Quality
The RAG pipeline is functional but several quality improvements are documented (and not yet done).

1. **Token-Based Chunking** — Currently character-based. The `IMPROVEMENTS_PLAN.md` specifies switching to token-based chunking (gpt-tokenizer, 512–800 token window). This improves embedding quality significantly.
2. **Hybrid Search (BM25 + Vector)** — pgvector alone misses keyword-critical queries. Adding pg_trgm or a BM25 index (via `pg_bm25`/`paradedb`) would improve retrieval substantially.
3. **Re-ranking** — After top-K vector retrieval, apply a cross-encoder re-ranker (could call the embedder service) to reorder by relevance.
4. **URL / Web Scraping Ingestion** — Allow users to add a URL as a document source. Scrape → extract text → chunk → embed. High value for research roles.
5. **Document Preview & Chunk Viewer** — In the role detail page, let users see extracted text from a document and browse individual chunks. Helps debug poor RAG results.
6. **Document Update / Re-process** — Currently there's no way to update a document. Add a "re-process" action.
7. **Chunk Attribution in Responses** — When RAG context is used, show which document/chunk each citation came from (the source carousel shows URLs, but for local docs it's unclear).
8. **Role Sharing** — Allow sharing a role (with documents) between users, or making a role "public" within the instance.

### C. Memory System
Memory is auto-extracted but there's limited visibility and control.

1. **Memory Search in UI** — The memory page is a simple list. Add a search/filter bar.
2. **Memory Deduplication** — When auto-extracting, check cosine similarity against existing memories before storing. Prevent semantic duplicates.
3. **Memory Source Links** — When viewing a memory, link back to the thread it came from (`threadId` is stored but not exposed in UI).
4. **Memory Categories / Tags** — Let users tag memories. Useful for organizing many memories across different topics.
5. **Memory Visibility in Chat** — Show a small indicator in the chat UI when memories are being used (similar to how RAG context is shown).

### D. User Settings & Preferences
No per-user settings exist beyond memory on/off.

1. **Theme Persistence** — Dark/light/system preference is stored in localStorage (next-themes default), but not in the DB. If a user logs in on a new device, preference is lost.
2. **Default Model Preference** — Users should be able to set their own default model (saved to their profile), independently of admin's global ordering.
3. **Notification Preferences** — Choose whether to receive email notifications (e.g., for password resets, future webhooks).
4. **Display Name & Avatar** — The `users` table has `name` and `image` columns, but there's no UI to set them. A simple profile/settings page.
5. **API Access Tokens** — Power users should be able to generate personal API tokens to access the chat API programmatically (like OpenAI's API keys, but for this instance).

### E. Admin & Operations
The admin panel is good but can be extended.

1. **Health Dashboard** — Visualize service health (DB, Redis, embedder), recent error rates, active queue depth. Currently only `/api/health` exists as a JSON endpoint.
2. **Usage Analytics** — Per-user and global stats: message counts, model usage breakdown, token estimates, RAG query counts.
3. **Per-User Model Restrictions** — Admins should be able to limit which models specific users can access (useful for cost control in shared instances).
4. **Audit Log** — A log of admin actions (who changed what settings, when).
5. **Invitation System** — Instead of open registration, allow invite-only signup via tokenized invite links.
6. **Rate Limit Configuration via UI** — Currently rate limits are hardcoded. Expose them as admin settings.

### F. Security & Auth
Several auth hardening items remain.

1. **Email Verification** — The `emailVerified` column exists but is never checked. Enforce verification for new accounts.
2. **Password Policy Enforcement** — No minimum length or complexity rules on registration or reset. Add Zod validation with configurable policy.
3. **Two-Factor Authentication (2FA)** — TOTP-based 2FA would significantly improve security for a self-hosted tool.
4. **Session Management** — Users can't view or revoke their active sessions. With JWT sessions this is harder, but a token blacklist (Redis) could enable forced logout.
5. **OAuth / SSO Provider** — Add optional GitHub, Google, or generic OIDC provider support for organizations with SSO.

### G. Infrastructure & Developer Experience
1. **OpenAI-Compatible API Wrapper** — Expose `/v1/chat/completions` that proxies through Complexity's model routing. Allows using any OpenAI-compatible client (e.g., Cursor, Continue, Open WebUI) to use this instance.
2. **Webhooks** — Allow users to subscribe to thread events (new message, thread complete) via HTTP webhooks.
3. **Plugin / Tool System** — A structured way to add custom tools (function calls) beyond web search and RAG.
4. **Multi-Tenant / Teams** — Allow creating "organizations" that share roles, API keys, and model configs.
5. **Mobile App / PWA** — The app has mobile-responsive UI. Making it a PWA (service worker, manifest, offline support) is a small but high-UX step.

### H. Content & AI Capabilities
1. **Image Generation** — Add image generation support (via OpenAI DALL-E, Stability, or local Stable Diffusion via the embedder service). Render generated images inline.
2. **Web Search for Direct Providers** — Anthropic, OpenAI, Google all have tool-calling. Implement a `web_search` tool that uses a search API (SerpAPI, Tavily, Brave) so non-Perplexity models can also search the web.
3. **Code Execution Sandbox** — Run Python code snippets generated by the LLM in a sandboxed environment (e.g., Pyodide in-browser or an isolated container).
4. **Canvas / Artifact Mode** — When the LLM generates a self-contained HTML/React component, render it in an iframe sandbox (like Claude's Artifacts feature).
5. **OCR for Scanned PDFs** — Current `pdf-parse` only handles text-layer PDFs. Add Tesseract/OCR support via the embedder service for image-based/scanned PDFs.

### I. Performance & Scale
1. **Message Pagination** — Very long threads load all messages at once. Add cursor-based pagination to `GET /api/threads/[threadId]` and virtual scroll in `MessageList`.
2. **Streaming Request Cancellation** — No way to stop an in-progress generation. Add an AbortController-based cancel mechanism.
3. **Thread Pinning & Tagging** — Allow users to pin important threads and add custom tags/labels for organization.
4. **Conversation Templates** — Pre-built prompt templates for common tasks (summarize, translate, debug code, etc.) accessible from the home page.
5. **OpenTelemetry / Distributed Tracing** — Add OTEL instrumentation for tracing requests across Next.js, the embedder service, and external LLM calls.
6. **API Key Rotation** — Admins can rotate encrypted API keys without service interruption; old keys remain valid for a grace period.

---

## Priority Tiers

### Tier 1 — High Impact, Relatively Low Effort
- **A1: Message Editing** — Core UX gap
- **A3: Thread Export** — Simple, high user value
- **B1: Token-Based Chunking** — Already planned, clear improvement
- **C1: Memory Search in UI** — Simple UI addition
- **C2: Memory Deduplication** — One extra DB query at save time
- **D4: Profile Page (name/avatar)** — `name` & `image` columns already exist
- **E1: Health Dashboard** — `/api/health` exists, just need a UI page
- **F2: Password Policy Enforcement** — Just Zod schema changes

### Tier 2 — High Impact, Moderate Effort
- **B2: Hybrid Search** — Needs pg_trgm or pg_bm25 setup
- **B4: URL/Web Ingestion** — New ingest pipeline, fetchable via worker
- **C3: Memory Source Links** — `threadId` already stored, just need UI link
- **D2: Default Model Preference** — New `users` column, settings page
- **D5: API Access Tokens** — New table, token generation, middleware
- **E2: Usage Analytics** — Aggregate queries + new admin tab
- **F1: Email Verification** — Auth flow change, email sending already present
- **H2: Web Search for Direct Providers** — Tool-calling with search API

### Tier 3 — High Impact, High Effort
- **A2: Conversation Branching** — Complex data model changes
- **B3: Re-ranking** — New embedder endpoint, reranking logic
- **E3: Per-User Model Restrictions** — New permission model
- **F3: Two-Factor Authentication (2FA)** — Auth flow overhaul
- **F5: OAuth / SSO** — NextAuth provider addition
- **G1: OpenAI-Compatible API Wrapper** — New API surface
- **G3: Plugin / Tool System** — Architecture change
- **H4: Canvas / Artifact Mode** — New rendering pipeline

---

## Completed Work Log

The following items were implemented during the Claude/Codex work sessions that produced this plan:

- **A1: Message Editing** — Added edit-and-regenerate flow for prior user messages.
- **A3: Thread Export** — Added thread export support as a user-facing completion.
- **B1: Token-Based Chunking** — Switched chunking to token windows using `gpt-tokenizer`.
- **B2: Hybrid Search** — Added hybrid retrieval combining vector and keyword search.
- **B3: Re-ranking** — Added reranking logic on retrieved candidates.
- **B4: URL/Web Ingestion** — Added URL ingestion for role documents.
- **C1: Memory Search in UI** — Added search/filtering to the memory page.
- **C2: Memory Deduplication** — Added cosine-similarity deduplication for extracted memories.
- **C3: Memory Source Links** — Added links back to source threads from memories.
- **D1: Theme Persistence** — Persisted theme preference in the user profile.
- **D2: Default Model Preference** — Added per-user default model support.
- **D4: Profile Page** — Added a profile settings page for display name and avatar.
- **D5: API Access Tokens** — Added personal API token CRUD and bearer-token auth.
- **E1: Health Dashboard** — Added an admin health dashboard UI.
- **E2: Usage Analytics** — Added an admin analytics dashboard.
- **F1: Email Verification** — Enforced email verification during auth.
- **F2: Password Policy Enforcement** — Added password validation rules.
- **F3: Two-Factor Authentication** — Added TOTP 2FA support.
- **F5: OAuth / SSO Provider Support** — Added GitHub and Google provider support.
- **G1: OpenAI-Compatible API Wrapper** — Added `/api/v1/chat/completions`, `/api/v1/models`, and `/api/v1/responses`.
- **H2b: Image Generation** — Added image generation support and inline rendering.
- **H4: Canvas / Artifact Mode** — Added sandboxed artifact rendering support.
- **Documentation** — Added an API docs page and sidebar link for the new OpenAI-compatible endpoints.

---

## Immediate Next Steps (Suggested Starting Point)

Given the milestone reached, the most impactful quick wins would be:

1. **Message Editing** (A1) — Edit a user message and regenerate from that point
2. **Thread Export** (A3) — Download conversation as Markdown
3. **Token-Based Chunking** (B1) — Chunking quality upgrade (planned but unimplemented)
4. **Profile Settings Page** (D1+D4) — Theme persistence + display name/avatar
5. **Memory Search & Deduplication** (C1+C2) — Memory UX improvements
6. **Health Dashboard UI** (E1) — Visibility into system health
7. **Web Search for Direct Providers** (H2) — Closes major capability gap vs Perplexity presets
