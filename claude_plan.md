# Complexity — Feature Expansion & Improvement Plan

## Current State Summary

The project is a robust, self-hosted AI search/RAG workspace nearing feature-completeness for v1.0.

**Core Capabilities (v1.0 Baseline):**
- **Multi-Provider AI:** Anthropic, OpenAI, Google, xAI, Perplexity, Ollama, Local OpenAI.
- **Advanced RAG:** Hybrid search (BM25+Vector), Cross-Encoder reranking, Sliding window token chunking.
- **Collaboration:** Role/Space sharing, Public roles, Thread branching, Message editing.
- **Media & Ingestion:** File attachments, OCR for scanned PDFs, Image generation gallery, Voice input.
- **Automation:** Outgoing Webhooks (HMAC signed), BullMQ background processing.
- **Admin & Security:** Audit logs, 2FA (TOTP), encrypted API keys, personal API tokens, usage analytics.
- **UX Polish:** PWA support, Cmd+F conversation search, token context transparency, chart rendering, Artifact sandbox.

---

## Opportunity Areas & Timeframe

### Tier 1: Polish & Transparency (Short-term: Next 1-2 Weeks)
Focus on grounding and user feedback during the AI loop.

1.  **B7: Chunk Attribution** — Enhance the "Source Carousel" to show the specific snippet of text (the chunk) used for grounding, allowing users to verify AI claims without opening the full document.
2.  **C5: Memory Visibility** — Show a "Brain" icon or status indicator in the chat when specific memories are actively influencing the prompt.
3.  **B6: Document Re-processing** — Add a "Sync" button to clears/re-indexes all documents in a Role, useful if chunking or embedding models are changed globally.
4.  **C4: Memory Categorization** — Allow users to add tags or categories to memories for better semantic organization.

### Tier 2: Governance & Scalability (Mid-term: 1-2 Months)
Focus on managing multiple users and controlling costs.

1.  **G4: Multi-Tenant / Teams** — Group users into "Organizations" that share specific Roles, Webhooks, and API keys.
2.  **E6: Rate Limit UI** — Move hardcoded rate limits into the database and provide a slider in the Admin Console.
3.  **E3: Per-User Model Restrictions** — Allow admins to restrict expensive flagship models to specific power users.
4.  **G3: Plugin / Tool System** — A structured architecture for adding custom function-calling tools beyond web search.

### Tier 3: Operational Excellence (Long-term)
1.  **I5: OpenTelemetry** — Add OTEL instrumentation for tracing requests across the full stack.
2.  **I6: API Key Rotation** — Automated rotation of encrypted provider keys.

---

## Future Roadmap (Low Priority / Post-v1.0)
These features are recognized as useful but are currently deferred to maintain a simple, uncluttered UI.

*   **I4: Conversation Templates** — Pre-built prompt templates (clutter risk).
*   **F4: Session Management** — Detailed device/session tracking and remote logout.
*   **G2b: Inbound Webhooks** — Allowing external systems to trigger threads.

---

## Completed Work Log (Recent)

- **A1-A7: Chat Quality** — Editing, Branching, Export, System Prompt Override, Context Transparency, Streaming Cancellation, and Search Within Thread. (DONE)
- **B1-B5, B8: RAG & Roles** — Sliding window chunking, Hybrid search, Cross-Encoder reranking, URL ingestion, Chunk viewer, and Role sharing. (DONE)
- **C1-C3: Memory** — Search, Deduplication, and Source links. (DONE)
- **D1-D5: Settings** — Theme persistence, Default model, Profile (Name/Avatar), and API Tokens. (DONE)
- **E1-E2, E4: Admin** — Health dashboard, Enhanced analytics, and System audit log. (DONE)
- **F1-F3: Auth** — Email verification, Password policy, and 2FA (TOTP). (DONE)
- **G1, G2, G5: Infra** — OpenAI-compatible API, Outgoing Webhooks, and PWA support. (DONE)
- **H1-H5: Capabilities** — Image generation, Web search (Tavily), Python sandbox, Artifacts, and OCR. (DONE)
- **I1-I3: Scale** — Message pagination, Streaming stop, and Thread pinning/tagging. (DONE)
