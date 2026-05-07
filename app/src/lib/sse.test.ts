import { describe, expect, it } from "vitest";

import { safeParseJsonLine } from "@/lib/sse";

describe("safeParseJsonLine", () => {
  it("returns null for invalid JSON", () => {
    expect(safeParseJsonLine("{not-json}")).toBeNull();
  });

  it("returns null for non-object JSON", () => {
    expect(safeParseJsonLine("\"hello\"")).toBeNull();
  });

  it("returns object for valid JSON objects", () => {
    expect(safeParseJsonLine("{\"type\":\"ok\"}")).toEqual({ type: "ok" });
  });
});
