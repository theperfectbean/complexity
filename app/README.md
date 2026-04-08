# Complexity App (Next.js)

Self-hosted agentic AI chat application and cluster sysadmin console.

## Architecture & Stack

- **Framework**: Next.js 16 (Standalone output)
- **Auth**: Auth.js v5 (NextAuth) with Credentials provider and Drizzle adapter
- **Database**: PostgreSQL 17 + pgvector via Drizzle ORM
- **Cache/Events**: Redis (for settings cache and agent event streaming)
- **AI Integration**: Vercel AI SDK v6
- **Local Models**: Ollama integration via `ai-sdk-ollama`
- **Infrastructure**: Native systemd services

## Key Features

### 1. Cluster Agent Console
A dedicated interface (`/console`) for cluster management using agentic local LLMs.
- **Human-in-the-loop**: All cluster-impacting actions require a `draft_mission_plan` approval.
- **SSH Execution**: Agent can execute bounded commands (`df`, `uptime`, `systemctl`, etc.) across the Proxmox cluster nodes and containers.
- **Streaming UI**: Real-time terminal-style output from SSH tools and reasoning tokens from the model.

### 2. Local LLM Integration (Ollama)
Deep integration with Ollama running on optimized cluster nodes (e.g., `pve01` with iGPU passthrough).
- **Supported Models**: Llama 3.2, Phi-3 Mini, and Gemma 4 (e2b/e4b).
- **Auto-Discovery**: Dynamically fetches available models from the Ollama API.
- **Security**: Security policy enforces local-only models for infrastructure missions.

### 3. Search & RAG
- **Search Provider Abstraction**: Unified interface for Perplexity, Tavily, and Brave Search.
- **Memory**: Context-aware memory extraction and retrieval for personalized assistance.
- **RAG**: Optional local RAG context injection by `spaceId`.

## Implemented Model Support

Models are managed via a shared registry in `src/lib/models.ts` and configurable via the `CUSTOM_MODEL_LIST` database setting.

### Current Cluster Presets:
- **Local**: Ollama (Llama 3.2, Phi-3, Gemma 4)
- **Cloud**: Claude 4.6 Sonnet/Opus, Gemini 2.5 Flash, Grok 3

## Key Files & Directories

- `src/app/(console)`: Route group for the Agent Console.
- `src/lib/agent`: Core agent logic, protocol, and tool definitions.
- `src/lib/providers`: LLM provider implementations (Anthropic, Google, Ollama, etc.).
- `src/lib/db/schema.ts`: Drizzle database schema definitions.
- `e2e/`: Playwright end-to-end tests for critical flows (auth, agent, disk checks).

## Development

```bash
npm install
npm run dev    # Starts on http://localhost:3000
npm run lint
npm test       # Vitest unit/integration
npm run test:e2e # Playwright tests
```

## Deployment (Ops-Center Cluster)

Deployment is handled via SSH to node `CT 105`:

```bash
# Build
NODE_OPTIONS="--max-old-space-size=3072" npm run build

# Restart Service
systemctl restart complexity-app
```

## Notes

- **SSH Access**: The app requires an SSH key at `/home/complexity/.ssh/id_gemini_agent` for cluster management tools.
- **Environment**: Ensure `OLLAMA_BASE_URL` is set to the internal container IP (e.g., `http://192.168.0.114:11434`).
- **Permissions**: The app runs as the `complexity` user (UID 1000).
