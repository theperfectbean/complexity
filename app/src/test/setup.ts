import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

process.env.PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY ?? "test-perplexity-key";
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "test-nextauth-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/postgres";
process.env.EMBEDDER_URL = process.env.EMBEDDER_URL ?? "http://embedder:8000";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    media: query,
    matches: false,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

window.HTMLElement.prototype.scrollIntoView = function() {};
window.scrollTo = vi.fn();

// Mock global fetch
const runLive = process.env.RUN_AGENT_SMOKE === "1" || process.env.RUN_LIVE_CHAT_ROUTE === "1";

if (!runLive) {
  global.fetch = vi.fn().mockImplementation(() => 
    Promise.resolve({
      json: () => Promise.resolve({ models: [] }),
      headers: {
        get: () => null,
      },
      body: {
        getReader: () => ({
          read: () => Promise.resolve({ done: true, value: undefined }),
        }),
      },
      ok: true,
    })
  ) as unknown as typeof fetch;
}
