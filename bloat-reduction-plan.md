# Bloat Reduction Plan

## Problem Statement
The codebase has several high-impact bloat hotspots that increase maintenance cost and cognitive load, especially in chat orchestration, the search input UI, memory handling, and provider routing. The goal is to reduce excessive module size, duplicated logic, and mixed responsibilities while preserving current behavior and streaming reliability.

## Proposed Approach
Use a phased, low-risk refactor strategy:
1. Land low-risk quick wins first (shared utilities and structural extraction without behavior changes).
2. Refactor high-impact modules behind existing interfaces to keep API/UI behavior stable.
3. Verify each phase with lint/tests and targeted regression checks for chat streaming, role uploads, and model routing.

## Todos
1. **Baseline & guardrails**
   - Capture baseline metrics: largest files, import counts, duplicate utility occurrences.
   - Define acceptance thresholds for post-refactor comparison.

2. **Extract shared text parsing utilities**
   - Consolidate duplicated text/object extraction helpers from:
     - `app/src/lib/memory.ts`
     - `app/src/lib/chat-utils.ts`
     - `app/src/lib/utils.ts`
   - Replace call sites with one shared implementation and keep tests green.

3. **SearchBar decomposition**
   - Split `app/src/components/search/SearchBar.tsx` into focused units:
     - voice input hook/component
     - file attachment/preview component
     - model selector component
   - Keep existing props behavior and UX intact.

4. **ChatService decomposition**
   - Break `app/src/lib/chat-service.ts` into narrower units:
     - session/thread validation
     - context assembly (RAG/memory/external data)
     - response persistence/cache handling
   - Keep route contract and streaming output unchanged.

5. **LLM provider routing simplification**
   - Refactor `app/src/lib/llm.ts` prefix parsing/provider creation into map-driven helpers.
   - Preserve existing provider behavior and aliases.

6. **Memory module separation**
   - Separate memory store/query/prompt responsibilities from extraction/parsing responsibilities in `app/src/lib/memory.ts`.
   - Reduce defensive parsing complexity where safe, preserving fallback behavior.

7. **Test bloat reduction for chat route**
   - Reduce repetitive mock setup and duplicated stream fixtures in `app/src/app/api/chat/route.test.ts`.
   - Keep equivalent functional coverage of major branches.

8. **Targeted API settings cleanup**
   - In `app/src/app/api/settings/route.ts`, extract repeated auth/admin/user lookup patterns into reusable helpers where practical.
   - Avoid broad route-wide rewrite; keep scope surgical.

9. **Validation phase**
   - Run repo lint/tests required for changed areas.
   - Re-run baseline metrics and compare against acceptance thresholds.
   - Confirm no regressions in chat streaming and model selection flows.

## Notes & Considerations
- Prioritize behavior-safe refactors in chat and streaming paths; avoid risky rewrites of Perplexity streaming internals unless required.
- Keep diffs reviewable by splitting work into small, coherent commits/PR-sized chunks.
- Defer cosmetic-only cleanups unless they reduce clear maintenance burden.
