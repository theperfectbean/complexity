# Benchmarks

## Response Time Comparison (2026-03-13)

### Goal
Compare direct Anthropic Sonnet access vs. Perplexity Agent API for **Claude Sonnet 4.6** (flagship as of Feb 2026).

### Setup
- **Direct Anthropic**: `@ai-sdk/anthropic` (Vercel AI SDK), model: `claude-sonnet-4-6`
- **Perplexity Agent API**: `@perplexity-ai/perplexity_ai`, model: `anthropic/claude-sonnet-4-6`

### Findings

| Model (Provider) | TTFT | Total Duration | Chars/Sec | Success | Notes |
|-----------------|------|----------------|-----------|---------|-------|
| **Claude Sonnet 4.6 (Direct)** | **1283ms** | **6753ms** | 200.21 | ✅ | Superior TTFT and slightly faster total response. |
| **Sonnet 4.6 (Perplexity)** | 7064ms | 7064ms | ~190 | ✅ | Latency penalty due to agentic orchestration/grounding. |

### Conclusion
- **Direct Access Advantage**: Going direct to Anthropic for Sonnet 4.6 provides a ~5.8s faster Time to First Token (TTFT) compared to Perplexity's Agent API.
- **Perplexity Use Case**: While slower, Perplexity's Agent API is beneficial when automatic web-grounding or multi-step reasoning is required, as it orchestrates these steps before returning the final response.
- **Model Availability**: The latest Claude 4.6 family (Opus/Sonnet/Haiku) is fully supported by both providers as of March 2026.
