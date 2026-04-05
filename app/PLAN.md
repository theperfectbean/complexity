# Complexity v2 — Implementation Plan & Roadmap

This document outlines the upgrade path for the Complexity chat application on the Proxmox cluster (LXC 105).

## Status Tracker

### Tier 1: Core UX & Data Migration (COMPLETED)
- [x] **1.1 Thread Tagging & Filtering**
  - **Status:** COMPLETED (Schema updated, PATCH endpoint implemented, Sidebar tag chips + filter dropdown added).
- [x] **1.2 Image Generation Tool**
  - **Status:** COMPLETED (Integrated `createImageGenerationTool` in `llm.ts` with Dall-E/Flux support).
- [x] **1.3 Prompt Library**
  - **Status:** COMPLETED (CRUD API, `/settings/prompts` UI, `/prompt:` slash command with system-prompt update support).
- [x] **1.4 Conversation Import**
  - **Status:** COMPLETED (ChatGPT JSON mapping parser, batch insertion of threads/messages, UI at `/settings/import`).

---

### Tier 2: Organization & Intelligence (UPCOMING)

#### 2.1 Thread Folders
- **Objective:** Organize threads into hierarchical folders.
- **Tasks:**
  - Update schema with `folders` table (`id`, `name`, `parent_id`, `userId`).
  - Add `folder_id` to `threads` table.
  - Implement Folder CRUD API.
  - Update Sidebar with a folder tree view (expandable/collapsible).
  - Drag-and-drop thread organization.

#### 2.2 Advanced Search Providers
- **Objective:** Abstraction layer for search beyond Perplexity.
- **Tasks:**
  - Implement Brave Search provider.
  - Support SearxNG self-hosted backend.
  - UI to switch search providers per-thread.

#### 2.3 Server-Side Code Execution Sandbox
- **Objective:** AI can run Python/Javascript code in a safe sandbox.
- **Tasks:**
  - Create a Deno-based subprocess tool.
  - Sandbox filesystem access and network (optional).
  - Renderer for code execution outputs in the message list.

#### 2.4 Side-by-Side Model Comparison
- **Objective:** Evaluate different models for the same prompt.
- **Tasks:**
  - Create `/compare` page.
  - Concurrent streaming of responses from two selected models.
  - Result persistence (save comparison threads).

---

### Tier 3: Advanced Agents & Performance (UPCOMING)

#### 3.1 MCP Client Integration
- **Objective:** Support Model Context Protocol for external tools/backends.
- **Tasks:**
  - Core implementation of an MCP SDK client.
  - Dynamic discovery of nearby LXC-hosted MCP servers.

#### 3.2 Streaming Sysadmin Agent
- **Objective:** Real-time visibility into tool calls.
- **Tasks:**
  - Upgrade `sysadmin` tool to `streamText` (AI SDK).
  - Implement live terminal-style tool-call rendering.

---

## Infrastructure Context (LXC 105)
- **Node:** pve01
- **Path:** `/opt/complexity/app`
- **Stack:** Next.js (Standalone build), Drizzle ORM, PostgreSQL (node-pg), Anthropic/OpenAI SDKs.
- **Service:** `complexity-app.service`
- **DNS:** `complexity.internal.lan`

## Codebase Health Guidelines
- **Consistency:** Use `createId()` for CUIDs. Always check `session?.user?.email`.
- **Drizzle:** New tables/fields MUST include migrations (`npm run db:generate` followed by execution).
- **Perf:** Ensure large message lists are paginated (handled in `/api/threads/[threadId]`).

*Last Updated: 2026-04-04 02:50 UTC*
