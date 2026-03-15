import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

process.env.PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY ?? "test-perplexity-key";
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? "test-nextauth-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/postgres";
process.env.EMBEDDER_URL = process.env.EMBEDDER_URL ?? "http://embedder:8000";

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

// Mock global fetch
global.fetch = vi.fn().mockImplementation(() => 
  Promise.resolve({
    json: () => Promise.resolve({ models: [] }),
    ok: true,
  })
);
