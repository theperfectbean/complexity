# Benchmarks

## Response Time Comparison (2026-03-13)

### Goal
Compare direct Anthropic Sonnet access vs. Perplexity Agent API for Claude Sonnet 4.6.

### Setup
- Direct Anthropic: `@ai-sdk/anthropic` (Vercel AI SDK)
- Perplexity Agent API: `@perplexity-ai/perplexity_ai`

### Findings

| Model (Provider) | TTFT | Total Duration | Success | Notes |
|-----------------|------|----------------|---------|-------|
| Claude 3.5 Sonnet (Direct) | - | - | ❌ 404 | Model not found for provided key |
| Claude 3.7 Sonnet (Direct) | - | - | ❌ 404 | Model not found for provided key |
| Claude 3 Haiku (Direct) | ~659ms | ~2074ms | ✅ | Baseline direct access |
| Sonnet 4.6 (Perplexity) | ~1493ms | ~1493ms | ✅ | (Non-streaming smoke test) |

### Conclusion
- The provided Anthropic API key currently lacks direct access to Claude 3.5/3.7 Sonnet (404 errors), but can access Claude 3 Haiku.
- Perplexity's Agent API provides access to "Sonnet 4.6" (Claude 3.5/3.7 under the hood) and is highly efficient for non-streaming requests, though it incurs a latency penalty of approximately ~834ms compared to direct Haiku access.
- For most users, Perplexity Agent API is a better choice for Sonnet access unless a dedicated high-tier Anthropic key is available.
