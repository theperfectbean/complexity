import { vi } from "vitest";
import { db } from "@/lib/db";

/**
 * Mocks a Drizzle select query that returns a single result set.
 * Supports optional innerJoin.
 */
export function mockSelectResult(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const innerJoin = vi.fn(() => ({ where }));
  const from = vi.fn(() => ({ innerJoin, where }));
  vi.mocked(db.select).mockReturnValue({ from } as never);
}

/**
 * Mocks a sequence of Drizzle select queries.
 * When 2+ results are provided, automatically appends an exists-subquery stub
 * for the role-access check used by ChatSessionValidator and the roles GET route.
 */
export function mockSelectResults(results: unknown[]) {
  const selectMock = vi.mocked(db.select);
  selectMock.mockReset();

  for (const result of results) {
    const limit = vi.fn().mockResolvedValue(result);
    const where = vi.fn(() => ({ limit }));
    const innerJoin = vi.fn(() => ({ where }));
    const from = vi.fn(() => ({ innerJoin, where }));
    selectMock.mockReturnValueOnce({ from } as never);
  }

  if (results.length >= 2) {
    const existsWhere = vi.fn(() => ({}));
    const existsFrom = vi.fn(() => ({ where: existsWhere }));
    selectMock.mockReturnValueOnce({ from: existsFrom } as never);
  }
}

/**
 * Mocks Drizzle insert and update mutation chains.
 */
export function mockMutationChains() {
  const values = vi.fn().mockResolvedValue(undefined);
  vi.mocked(db.insert).mockReturnValue({ values } as never);

  const where = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where }));
  vi.mocked(db.update).mockReturnValue({ set } as never);

  return { values, set, where };
}

/**
 * Creates a ReadableStream that yields SSE events.
 */
export function createSSEStream(events: unknown[]) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
}

/**
 * Helper to create a POST Request with JSON body.
 */
export function createPostRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
