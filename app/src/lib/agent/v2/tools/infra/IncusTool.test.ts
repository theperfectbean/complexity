import { describe, expect, it } from "vitest";

import { resolveFleetContainerName } from "./IncusTool";

describe("resolveFleetContainerName", () => {
  it("accepts exact container names", () => {
    expect(resolveFleetContainerName("plex")).toBe("plex");
    expect(resolveFleetContainerName("ingestion-stack")).toBe("ingestion-stack");
  });

  it("maps service names to their owning containers", () => {
    expect(resolveFleetContainerName("qbittorrent")).toBe("ingestion-stack");
    expect(resolveFleetContainerName("qBittorrent")).toBe("ingestion-stack");
    expect(resolveFleetContainerName("sonarr")).toBe("arrstack");
    expect(resolveFleetContainerName("audiobookshelf")).toBe("audio-stack");
  });

  it("rejects unknown resources", () => {
    expect(() => resolveFleetContainerName("totally-made-up")).toThrow(
      "Unknown or invalid container: totally-made-up",
    );
  });
});
