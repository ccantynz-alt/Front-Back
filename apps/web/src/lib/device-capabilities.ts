// ── WebGPU Detection & Device Capability Assessment ──────────────────
// SSR-safe detection of client-side compute capabilities for AI tier routing.
// Returns a DeviceCapabilities object consumed by computeTierRouter().

import type { DeviceCapabilities } from "@back-to-the-future/ai-core";

/**
 * Map NetworkInformation.effectiveType and type to our connection categories.
 */
function resolveConnectionType(): DeviceCapabilities["connectionType"] {
  if (typeof navigator === "undefined") return "unknown";

  const conn = (navigator as NavigatorWithConnection).connection;
  if (!conn) return "unknown";

  // Prefer the physical connection type when available
  if (conn.type === "wifi") return "wifi";
  if (conn.type === "ethernet") return "ethernet";

  // Fall back to effective type (adaptive bitrate estimate)
  const effective = conn.effectiveType;
  if (effective === "4g") return "4g";
  if (effective === "3g") return "3g";
  if (effective === "2g") return "2g";
  if (effective === "slow-2g") return "slow-2g";

  return "unknown";
}

/**
 * Attempt to estimate available VRAM via the WebGPU adapter.
 * Returns 0 when WebGPU is unavailable or the adapter cannot be obtained.
 */
async function estimateVRAM(): Promise<{ hasWebGPU: boolean; vramMB: number }> {
  if (typeof navigator === "undefined") {
    return { hasWebGPU: false, vramMB: 0 };
  }

  const gpu = (navigator as NavigatorWithGPU).gpu;
  if (!gpu) {
    return { hasWebGPU: false, vramMB: 0 };
  }

  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      return { hasWebGPU: false, vramMB: 0 };
    }

    // maxBufferSize is the best public proxy for available VRAM.
    // It reports the largest single allocation, which on most devices
    // correlates well with total VRAM.
    const maxBuffer = adapter.limits.maxBufferSize;
    const vramMB = Math.round(maxBuffer / (1024 * 1024));

    return { hasWebGPU: true, vramMB };
  } catch {
    return { hasWebGPU: false, vramMB: 0 };
  }
}

/**
 * Detect all device capabilities relevant to AI compute tier routing.
 *
 * Safe to call during SSR -- returns conservative defaults when browser
 * APIs are unavailable.
 */
export async function detectDeviceCapabilities(): Promise<DeviceCapabilities> {
  // SSR guard: return conservative defaults on the server
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      hasWebGPU: false,
      vramMB: 0,
      hardwareConcurrency: 1,
      deviceMemoryGB: 2,
      connectionType: "unknown",
    };
  }

  const { hasWebGPU, vramMB } = await estimateVRAM();

  const hardwareConcurrency = navigator.hardwareConcurrency ?? 1;

  // navigator.deviceMemory is a rough bucket (0.25, 0.5, 1, 2, 4, 8)
  // and only available in some browsers.
  const deviceMemoryGB =
    (navigator as NavigatorWithDeviceMemory).deviceMemory ?? 2;

  const connectionType = resolveConnectionType();

  return {
    hasWebGPU,
    vramMB,
    hardwareConcurrency,
    deviceMemoryGB,
    connectionType,
  };
}

// ── Browser API type augmentations (not in standard lib) ─────────────

interface GPUAdapterLimits {
  maxBufferSize: number;
}

interface GPUAdapter {
  limits: GPUAdapterLimits;
}

interface GPUHandle {
  requestAdapter(): Promise<GPUAdapter | null>;
}

interface NavigatorWithGPU extends Navigator {
  gpu?: GPUHandle;
}

interface NavigatorWithDeviceMemory extends Navigator {
  deviceMemory?: number;
}

interface NetworkInformation {
  effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
  type?:
    | "bluetooth"
    | "cellular"
    | "ethernet"
    | "none"
    | "wifi"
    | "wimax"
    | "other"
    | "unknown";
}

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkInformation;
}
