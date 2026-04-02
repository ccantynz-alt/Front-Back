import { describe, test, expect } from "bun:test";
import {
  computeTierRouter,
  type DeviceCapabilities,
  type ModelRequirements,
} from "./compute-tier";

// ── Helper factories ─────────────────────────────────────────────────

function makeDevice(overrides: Partial<DeviceCapabilities> = {}): DeviceCapabilities {
  return {
    hasWebGPU: true,
    vramMB: 4096,
    hardwareConcurrency: 8,
    deviceMemoryGB: 16,
    connectionType: "wifi",
    ...overrides,
  };
}

function makeModel(overrides: Partial<ModelRequirements> = {}): ModelRequirements {
  return {
    parametersBillion: 1,
    minVRAMMB: 2048,
    latencyMaxMs: 100,
    ...overrides,
  };
}

// ── Client tier selection ────────────────────────────────────────────

describe("computeTierRouter - client tier", () => {
  test("routes to client when device has WebGPU, enough VRAM, model <= 2B, latency >= 10ms", () => {
    const result = computeTierRouter(makeDevice(), makeModel());
    expect(result).toBe("client");
  });

  test("routes to client for small model (0.5B) with sufficient device", () => {
    const result = computeTierRouter(
      makeDevice({ vramMB: 1024 }),
      makeModel({ parametersBillion: 0.5, minVRAMMB: 512 }),
    );
    expect(result).toBe("client");
  });

  test("routes to client at exactly 2B parameters", () => {
    const result = computeTierRouter(
      makeDevice(),
      makeModel({ parametersBillion: 2 }),
    );
    expect(result).toBe("client");
  });

  test("routes to client at exactly 10ms latency requirement", () => {
    const result = computeTierRouter(
      makeDevice(),
      makeModel({ latencyMaxMs: 10 }),
    );
    expect(result).toBe("client");
  });

  test("routes to client when VRAM exactly meets minimum", () => {
    const result = computeTierRouter(
      makeDevice({ vramMB: 2048 }),
      makeModel({ minVRAMMB: 2048 }),
    );
    expect(result).toBe("client");
  });
});

// ── Edge tier selection ──────────────────────────────────────────────

describe("computeTierRouter - edge tier", () => {
  test("routes to edge when no WebGPU but model <= 7B and latency >= 50ms", () => {
    const result = computeTierRouter(
      makeDevice({ hasWebGPU: false }),
      makeModel({ parametersBillion: 3, latencyMaxMs: 100 }),
    );
    expect(result).toBe("edge");
  });

  test("routes to edge when not enough VRAM for client", () => {
    const result = computeTierRouter(
      makeDevice({ vramMB: 1024 }),
      makeModel({ parametersBillion: 1.5, minVRAMMB: 2048, latencyMaxMs: 100 }),
    );
    expect(result).toBe("edge");
  });

  test("routes to edge when model > 2B but <= 7B", () => {
    const result = computeTierRouter(
      makeDevice(),
      makeModel({ parametersBillion: 5, latencyMaxMs: 100 }),
    );
    expect(result).toBe("edge");
  });

  test("routes to edge at exactly 7B parameters with latency >= 50ms", () => {
    const result = computeTierRouter(
      makeDevice({ hasWebGPU: false }),
      makeModel({ parametersBillion: 7, latencyMaxMs: 50 }),
    );
    expect(result).toBe("edge");
  });

  test("routes to edge when latency < 10ms prevents client tier", () => {
    const result = computeTierRouter(
      makeDevice(),
      makeModel({ parametersBillion: 1, latencyMaxMs: 5 }),
    );
    // latencyMaxMs < 10 disqualifies client; latencyMaxMs < 50 also disqualifies edge
    // This actually falls to cloud because latencyMaxMs (5) < 50
    expect(result).toBe("cloud");
  });

  test("routes to edge when latency is exactly 50ms and model fits", () => {
    const result = computeTierRouter(
      makeDevice({ hasWebGPU: false }),
      makeModel({ parametersBillion: 3, latencyMaxMs: 50 }),
    );
    expect(result).toBe("edge");
  });
});

// ── Cloud tier selection ─────────────────────────────────────────────

describe("computeTierRouter - cloud tier", () => {
  test("routes to cloud for large models (> 7B)", () => {
    const result = computeTierRouter(
      makeDevice(),
      makeModel({ parametersBillion: 13, latencyMaxMs: 5000 }),
    );
    expect(result).toBe("cloud");
  });

  test("routes to cloud when model is 70B", () => {
    const result = computeTierRouter(
      makeDevice(),
      makeModel({ parametersBillion: 70, latencyMaxMs: 10000 }),
    );
    expect(result).toBe("cloud");
  });

  test("routes to cloud when latency requirement is too tight for edge", () => {
    const result = computeTierRouter(
      makeDevice({ hasWebGPU: false }),
      makeModel({ parametersBillion: 5, latencyMaxMs: 20 }),
    );
    // No WebGPU -> skip client; latencyMaxMs < 50 -> skip edge; -> cloud
    expect(result).toBe("cloud");
  });

  test("routes to cloud for model > 7B even with great device", () => {
    const result = computeTierRouter(
      makeDevice({ vramMB: 24000 }),
      makeModel({ parametersBillion: 8, minVRAMMB: 16000, latencyMaxMs: 5000 }),
    );
    expect(result).toBe("cloud");
  });

  test("routes to cloud as ultimate fallback with no WebGPU and tight latency", () => {
    const result = computeTierRouter(
      makeDevice({ hasWebGPU: false, vramMB: 0 }),
      makeModel({ parametersBillion: 0.5, minVRAMMB: 512, latencyMaxMs: 5 }),
    );
    expect(result).toBe("cloud");
  });
});

// ── Fallback chain behavior ──────────────────────────────────────────

describe("computeTierRouter - fallback chain", () => {
  test("client -> edge fallback when WebGPU missing", () => {
    const device = makeDevice({ hasWebGPU: false });
    const model = makeModel({ parametersBillion: 1, latencyMaxMs: 100 });
    expect(computeTierRouter(device, model)).toBe("edge");
  });

  test("client -> edge fallback when VRAM insufficient", () => {
    const device = makeDevice({ vramMB: 512 });
    const model = makeModel({ parametersBillion: 1, minVRAMMB: 2048, latencyMaxMs: 100 });
    expect(computeTierRouter(device, model)).toBe("edge");
  });

  test("client -> cloud fallback when model too large and latency too tight", () => {
    const device = makeDevice();
    const model = makeModel({ parametersBillion: 13, latencyMaxMs: 10 });
    expect(computeTierRouter(device, model)).toBe("cloud");
  });

  test("always returns a valid ComputeTier", () => {
    const tiers = ["client", "edge", "cloud"];
    const scenarios: [DeviceCapabilities, ModelRequirements][] = [
      [makeDevice(), makeModel()],
      [makeDevice({ hasWebGPU: false, vramMB: 0 }), makeModel({ parametersBillion: 100 })],
      [makeDevice(), makeModel({ latencyMaxMs: 1 })],
    ];
    for (const [device, model] of scenarios) {
      const result = computeTierRouter(device, model);
      expect(tiers).toContain(result);
    }
  });
});
