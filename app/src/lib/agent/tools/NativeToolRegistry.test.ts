import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent/v2/tools/infra/ProxmoxTool", () => ({
  pve_list: vi.fn(),
  pve_stop: vi.fn(),
  resolveContainer: vi.fn(),
}));

import { pve_list, pve_stop, resolveContainer } from "@/lib/agent/v2/tools/infra/ProxmoxTool";
import { executeNativeToolEnvelope, getNativeToolManifest } from "./NativeToolRegistry";
import { executeLegacyToolEnvelope, getLegacyToolManifest } from "../v2/LegacyToolBridge";

describe("NativeToolRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes a native manifest for pve_list with table widget output", () => {
    expect(getNativeToolManifest("pve_list")).toMatchObject({
      name: "pve_list",
      riskTier: 0,
      readOnly: true,
      widgetHint: { type: "table" },
    });
  });

  it("exposes a native manifest for pve_stop with destructive approval metadata", () => {
    expect(getNativeToolManifest("pve_stop")).toMatchObject({
      name: "pve_stop",
      riskTier: 3,
      requiresApproval: true,
      readOnly: false,
    });
  });

  it("executes pve_list as a normalized native envelope with diagnostics", async () => {
    vi.mocked(pve_list).mockResolvedValue([
      { type: "lxc", name: "plex", node: "node01", status: "running", vmid: 104 },
    ] as never);

    const executed = await executeNativeToolEnvelope("pve_list", {}, { actorId: "user-1" });

    expect(executed.result).toMatchObject({
      ok: true,
      widgetHint: { type: "table" },
      data: {
        headers: ["type", "name", "node", "status", "vmid"],
        rows: [["lxc", "plex", "node01", "running", 104]],
      },
    });
    expect(executed.result.diagnostics?.durationMs).toBeTypeOf("number");
  });

  it("executes pve_stop as a normalized destructive envelope", async () => {
    vi.mocked(resolveContainer).mockReturnValue({ name: "plex", node: "node01", vmid: 104 } as never);
    vi.mocked(pve_stop).mockResolvedValue({ node: "node01", vmid: 104, exitCode: 0, output: "" } as never);

    const executed = await executeNativeToolEnvelope("pve_stop", { container: "plex" }, { actorId: "user-1" });

    expect(executed.result).toMatchObject({
      ok: true,
      widgetHint: { type: "command_result" },
      summary: "Stopped plex",
      data: { node: "node01", vmid: 104, exitCode: 0 },
    });
  });
});

describe("LegacyToolBridge native-tool compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("surfaces native manifests through the legacy bridge", () => {
    expect(getLegacyToolManifest("pve_list")).toMatchObject({
      name: "pve_list",
      widgetHint: { type: "table" },
      riskTier: 0,
    });
    expect(getLegacyToolManifest("pve_stop")).toMatchObject({
      name: "pve_stop",
      riskTier: 3,
      requiresApproval: true,
    });
  });

  it("executes native tools through the legacy bridge without double-normalizing", async () => {
    vi.mocked(pve_list).mockResolvedValue([
      { type: "lxc", name: "plex", node: "node01", status: "running", vmid: 104 },
    ] as never);

    const executed = await executeLegacyToolEnvelope("pve_list", {}, "user-1", false);

    expect(executed.result).toMatchObject({
      ok: true,
      widgetHint: { type: "table" },
    });
    expect(executed.manifest.widgetHint).toMatchObject({ type: "table" });
  });
});
