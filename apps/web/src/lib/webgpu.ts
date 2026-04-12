// ── WebGPU Detection & Capability Assessment ────────────────────────
// Detects device GPU capabilities for three-tier compute routing.
// Client GPU ($0/token) → Edge (sub-50ms) → Cloud (full power)

import type { DeviceCapabilities } from "@back-to-the-future/ai-core";

export interface WebGPUInfo {
  supported: boolean;
  adapterName?: string | undefined;
  vendor?: string | undefined;
  architecture?: string | undefined;
  maxBufferSize?: number | undefined;
  maxComputeWorkgroupsPerDimension?: number | undefined;
  estimatedVRAMMB: number;
}

/**
 * Probes the browser for WebGPU support and GPU capabilities.
 * Returns detailed info about the available GPU adapter.
 */
export async function detectWebGPU(): Promise<WebGPUInfo> {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    return { supported: false, estimatedVRAMMB: 0 };
  }

  try {
    const gpu = navigator.gpu as GPU;
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });

    if (!adapter) {
      return { supported: false, estimatedVRAMMB: 0 };
    }

    const info = adapter.info;
    const limits = adapter.limits;

    // Estimate VRAM from max buffer size (rough heuristic)
    const maxBufferSize = limits.maxBufferSize ?? 0;
    const estimatedVRAMMB = Math.round(maxBufferSize / (1024 * 1024));

    return {
      supported: true,
      adapterName: info.device || undefined,
      vendor: info.vendor || undefined,
      architecture: info.architecture || undefined,
      maxBufferSize,
      maxComputeWorkgroupsPerDimension: limits.maxComputeWorkgroupsPerDimension,
      estimatedVRAMMB: Math.max(estimatedVRAMMB, 512), // Minimum estimate
    };
  } catch {
    return { supported: false, estimatedVRAMMB: 0 };
  }
}

/**
 * Builds a DeviceCapabilities object for the compute tier router.
 * Combines WebGPU info with other device signals.
 */
export async function getDeviceCapabilities(): Promise<DeviceCapabilities> {
  const gpu = await detectWebGPU();

  // Detect connection type
  let connectionType: DeviceCapabilities["connectionType"] = "unknown";
  if (typeof navigator !== "undefined" && "connection" in navigator) {
    const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
    const type = conn?.effectiveType;
    if (type === "4g" || type === "3g" || type === "2g" || type === "slow-2g") {
      connectionType = type;
    }
  }

  // Detect memory
  const deviceMemoryGB =
    typeof navigator !== "undefined" && "deviceMemory" in navigator
      ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4
      : 4;

  return {
    hasWebGPU: gpu.supported,
    vramMB: gpu.estimatedVRAMMB,
    hardwareConcurrency:
      typeof navigator !== "undefined" ? navigator.hardwareConcurrency ?? 4 : 4,
    deviceMemoryGB,
    connectionType,
  };
}

/**
 * Determines whether a model can run client-side based on device capabilities.
 */
export function canRunLocally(
  capabilities: DeviceCapabilities,
  modelParamsBillion: number,
): boolean {
  if (!capabilities.hasWebGPU) return false;

  // Rough VRAM requirements per model size
  const requiredVRAMMB = modelParamsBillion * 1200; // ~1.2GB per billion params (quantized)
  if (capabilities.vramMB < requiredVRAMMB) return false;

  // Need at least 4 cores for decent inference
  if (capabilities.hardwareConcurrency < 4) return false;

  // Need at least 4GB device memory
  if (capabilities.deviceMemoryGB < 4) return false;

  return true;
}
