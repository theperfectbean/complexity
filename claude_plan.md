# Complexity — Feature Expansion & Improvement Plan

## Current State Summary

The project is a well-architected, self-hosted AI search/RAG workspace at a strong milestone:

**What's solid:**
- Multi-provider streaming chat (Anthropic, OpenAI, Google, xAI, Perplexity, Ollama, Local OpenAI)
- Roles/Spaces with background document processing (BullMQ), chunking & pgvector RAG
- Memory system with auto-extraction and semantic search
- Voice input (MediaRecorder → Whisper via embedder service)
- File attachments (PDF, DOCX, TXT, MD, images)
- OCR for Scanned PDFs (Tesseract via embedder service)
- Charts via `chart` code block interception (Recharts)
- Command palette (Cmd+K), keyboard shortcuts
- Admin console: provider keys, model management, user management
- Security: AES-256-GCM encrypted API keys, CSRF, nonce-based CSP, rate limiting
- Testing: 123+ unit tests + 17 Playwright E2E test files
- Observability: Pino structured logging
- Automated DB migrations on container start
- Data resilience: bind-mount persistence, 7-day pg_dump backups
- Progressive Web App (PWA) support

---

## Opportunity Areas

### A. Chat & Conversation Quality
Gaps in conversation features compared to commercial tools.

1. **Message Editing** — Users can only regenerate, not edit a prior user message and re-run from there. (DONE)
2. **Conversation Branching** — Editing a message could create a branch; or explicit "fork thread" from a message point. (DONE)
3. **Thread Export** — Export full conversation as Markdown or PDF. (DONE)
4. **Per-Thread System Prompt Override** — Allow a user to add a free-form system prompt note per thread. (DONE)
5. **Context Window Transparency** — Indicator of how many tokens have been consumed. (DONE)
6. **Streaming Token Count** — Display estimated token count during/after streaming. (DONE)
7. **Search Within Thread** — Ctrl+F-style search within a conversation (client-side). (DONE)

### B. Roles / Spaces & RAG Quality
The RAG pipeline is functional but several quality improvements are documented (and not yet done).

1. **Token-Based Chunking** — Switched to token windows using `gpt-tokenizer`. (DONE)
2. **Hybrid Search (BM25 + Vector)** — Added hybrid retrieval combining vector and keyword search. (DONE)
3. **Re-ranking** — Added Cross-Encoder reranking on retrieved candidates. (DONE)
4. **URL / Web Scraping Ingestion** — Added URL ingestion for role documents. (DONE)
5. **Document Preview & Chunk Viewer** — Added chunk browser in the role detail page. (DONE)
6. **Document Update / Re-process** — Add a "re-process" action.
7. **Chunk Attribution in Responses** — When RAG context is used, show which document/chunk each citation came from.
8. **Role Sharing** — Allow sharing a role (with documents) between users, or making a role "public" within the instance.

### C. Memory System
Memory is auto-extracted but there's limited visibility and control.

1. **Memory Search in UI** — Added search/filtering to the memory page. (DONE)
2. **Memory Deduplication** — Added cosine-similarity deduplication for extracted memories. (DONE)
3. **Memory Source Links** — Added links back to source threads from memories. (DONE)
4. **Memory Categories / Tags** — Let users tag memories.
5. **Memory Visibility in Chat** — Show a small indicator in the chat UI when memories are being used.

### D. User Settings & Preferences
No per-user settings exist beyond memory on/off.

1. **Theme Persistence** — Persisted theme preference in the user profile. (DONE)
2. **Default Model Preference** — Added per-user default model support. (DONE)
3. **Notification Preferences** — Choose whether to receive email notifications.
4. **Display Name & Avatar** — Added profile settings page for display name and avatar. (DONE)
5. **API Access Tokens** — Added personal API token CRUD and bearer-token auth. (DONE)

### E. Admin & Operations
The admin panel is good but can be extended.

1. **Health Dashboard** — Added an admin health dashboard UI. (DONE)
2. **Usage Analytics** — Added an admin analytics dashboard. (DONE)
3. **Per-User Model Restrictions** — Admins should be able to limit which models specific users can access.
4. **Audit Log** — A log of admin actions (who changed what settings, when).
5. **Rate Limit Configuration via UI** — Currently rate limits are hardcoded. Expose them as admin settings.

### F. Security & Auth
Several auth hardening items remain.

1. **Email Verification** — Enforced email verification during auth. (DONE)
2. **Password Policy Enforcement** — Added password validation rules. (DONE)
3. **Two-Factor Authentication (2FA)** — Added TOTP 2FA support. (DONE)
4. **Session Management** — Token blacklist (Redis) could enable forced logout.
5. **OAuth / SSO Provider** — Added GitHub and Google provider support. (DONE)

### G. Infrastructure & Developer Experience
1. **OpenAI-Compatible API Wrapper** — Added `/api/v1/chat/completions`, `/api/v1/models`, and `/api/v1/responses`. (DONE)
2. **Webhooks** — Allow users to subscribe to thread events (new message, thread complete) via HTTP webhooks.
3. **Plugin / Tool System** — A structured way to add custom tools (function calls) beyond web search and RAG.
4. **Multi-Tenant / Teams** — Allow creating "organizations" that share roles, API keys, and model configs.
5. **Mobile App / PWA** — Integrated PWA support. (DONE)

### H. Content & AI Capabilities
1. **Image Generation** — Added image generation support and inline rendering. (DONE)
2. **Web Search for Direct Providers** — Integrated Tavily for web search on direct LLM providers. (DONE)
3. **Code Execution Sandbox** — Integrated Pyodide for client-side Python execution. (DONE)
4. **Canvas / Artifact Mode** — Added sandboxed artifact rendering support. (DONE)
5. **OCR for Scanned PDFs** — Integrated Tesseract OCR via the embedder service. (DONE)

### I. Performance & Scale
1. **Message Pagination** — Cursor-based pagination for `GET /api/threads/[threadId]`.
2. **Streaming Request Cancellation** — Integrated useChat's stop function. (DONE)
3. **Thread Pinning & Tagging** — Allow users to pin important threads and add custom tags/labels.
4. **Conversation Templates** — Pre-built prompt templates for common tasks.
5. **OpenTelemetry / Distributed Tracing** — Add OTEL instrumentation.
6. **API Key Rotation** — Admins can rotate encrypted API keys.

---

## Completed Work Log

The following items were implemented during the recent work sessions:

- **A1: Message Editing** — Added edit-and-regenerate flow for prior user messages.
- **A2: Conversation Branching** — Added support for thread branching and non-destructive edits.
- **A3: Thread Export** — Added thread export support as a user-facing completion.
- **A4: Per-Thread System Prompt Override** — Added custom instructions per thread.
- **A5/A6: Context Transparency** — Added token count estimation in thread settings.
- **A7: Search Within Thread** — Added client-side keyword search for conversations.
- **B1: Token-Based Chunking** — Switched to sliding window token chunking.
- **B2: Hybrid Search** — Added hybrid retrieval combining vector and keyword search.
- **B3: Re-ranking** — Added Cross-Encoder reranking on retrieved candidates.
- **B4: URL/Web Ingestion** — Added URL ingestion for role documents.
- **B5: Document Chunk Viewer** — Added visual browser for extracted chunks.
- **C1: Memory Search in UI** — Added search/filtering to the memory page.
- **C2: Memory Deduplication** — Added cosine-similarity deduplication for memories.
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
- **G1: OpenAI-Compatible API Wrapper** — Added OpenAI-compatible endpoints.
- **G5: PWA Support** — Integrated Progress Web App support.
- **H1: Image Generation** — Added image generation support and inline rendering.
- **H2: Web Search for Direct Providers** — Added Tavily web search integration.
- **H3: Code Execution Sandbox** — Added client-side Python sandbox.
- **H4: Canvas / Artifact Mode** — Added sandboxed artifact rendering.
- **H5: OCR for Scanned PDFs** — Added Tesseract OCR support.
- **I2: Streaming Request Cancellation** — Added ability to stop generations.
- **Documentation** — Synchronized GEMINI.md with all new features.
