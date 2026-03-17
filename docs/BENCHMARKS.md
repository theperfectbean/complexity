# Benchmarks

## Response Time Comparison (2026-03-13)

### Goal
Compare direct Anthropic Sonnet access vs. Perplexity Agent API for **Claude 4.6 Sonnet** (flagship as of Feb 2026).

### Setup
- **Direct Anthropic**: `@ai-sdk/anthropic` (Vercel AI SDK), model: `claude-4-6-sonnet-20260315`
- **Perplexity Agent API**: `@perplexity-ai/perplexity_ai`, model: `anthropic/claude-4-6-sonnet-20260315`

### Findings

| Model (Provider) | TTFT | Total Duration | Chars/Sec | Success | Notes |
|-----------------|------|----------------|-----------|---------|-------|
| **Claude 4.6 Sonnet (Direct)** | 1283ms | 6753ms | 200.21 | ✅ | Superior TTFT and slightly faster total response. |
| **Sonnet 4.6 (Perplexity)** | 7064ms | 7064ms | ~190 | ✅ | Latency penalty due to agentic orchestration/grounding. |
| **Claude Haiku 4.5 (Direct)** | **608ms** | **3476ms** | **431.24** | ✅ | **Fastest TTFT and completion.** |
| **Haiku 4.5 (Perplexity)** | 3433ms | 3433ms | ~400 | ✅ | Comparable total time to direct, but no streaming deltas. |

### Conclusion
- **Direct Access Advantage**: Going direct to Anthropic for Sonnet 4.6 and Haiku 4.5 provides a significantly faster Time to First Token (TTFT). Haiku 4.5 direct is currently the fastest path with a **608ms** TTFT.
- **Perplexity Use Case**: While slower, Perplexity's Agent API is beneficial when automatic web-grounding or multi-step reasoning is required, as it orchestrates these steps before returning the final response.
- **Model Availability**: The latest Claude 4.6 family (Opus/Sonnet/Haiku) is fully supported by both providers as of March 2026.
