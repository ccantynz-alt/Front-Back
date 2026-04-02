// ── WebGPU Detection & Capability Assessment ────────────────────────
// Full device capability assessment for the three-tier compute model.
// Determines what the client GPU can handle before falling back to edge/cloud.

// ── Types ────────────────────────────────────────────────────────────

export type GPUComputeTier = "high" | "medium" | "low" | "none";

export type GraphicsBackend = "webgpu" | "webgl2" | "webgl" | "canvas2d" | "none";

export interface GPUCapabilities {
  supported: boolean;
  backend: GraphicsBackend;
  adapterInfo: GPUAdapterInfo | null;
  maxBufferSize: number;
  maxComputeWorkgroupsPerDimension: number;
  maxComputeInvocationsPerWorkgroup: number;
  maxStorageBufferBindingSize: number;
  maxComputeWorkgroupStorageSize: number;
  preferredFormat: GPUTextureFormat | null;
  estimatedVRAMMB: number;
  maxTextureSize: number;
  supportsFloat16: boolean;
  supportsTimestampQuery: boolean;
}

export interface GPUAdapterInfo {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
}

// ── VRAM Estimation Heuristics ──────────────────────────────────────

function estimateVRAMFromAdapter(
  _adapter: GPUAdapter,
  limits: GPUSupportedLimits,
): number {
  // maxBufferSize is the best proxy for available VRAM
  const maxBufferMB = Number(limits.maxBufferSize) / (1024 * 1024);

  // Discrete GPUs typically expose large buffer sizes
  // Integrated GPUs share system memory, expose less
  if (maxBufferMB >= 4096) return 8192; // Likely 8GB+ discrete
  if (maxBufferMB >= 2048) return 4096; // Likely 4GB discrete
  if (maxBufferMB >= 1024) return 2048; // Likely 2GB integrated/discrete
  if (maxBufferMB >= 256) return 1024; // Basic integrated GPU
  return 512; // Minimal GPU
}

// ── WebGL Fallback Info ─────────────────────────────────────────────

function detectWebGLCapabilities(): {
  backend: GraphicsBackend;
  estimatedVRAMMB: number;
  maxTextureSize: number;
} {
  if (typeof document === "undefined") {
    return { backend: "none", estimatedVRAMMB: 0, maxTextureSize: 0 };
  }

  const canvas = document.createElement("canvas");

  // Try WebGL2 first
  const gl2 = canvas.getContext("webgl2");
  if (gl2) {
    const maxTexture = gl2.getParameter(gl2.MAX_TEXTURE_SIZE) as number;
    // Rough VRAM estimation from texture size and renderer info
    const estimatedVRAMMB = maxTexture >= 16384 ? 2048 : maxTexture >= 8192 ? 1024 : 512;
    canvas.remove();
    return { backend: "webgl2", estimatedVRAMMB, maxTextureSize: maxTexture };
  }

  // Try WebGL1
  const gl1 = canvas.getContext("webgl");
  if (gl1) {
    const maxTexture = gl1.getParameter(gl1.MAX_TEXTURE_SIZE) as number;
    const estimatedVRAMMB = maxTexture >= 8192 ? 1024 : 512;
    canvas.remove();
    return { backend: "webgl", estimatedVRAMMB, maxTextureSize: maxTexture };
  }

  // Try Canvas2D
  const ctx2d = canvas.getContext("2d");
  canvas.remove();
  if (ctx2d) {
    return { backend: "canvas2d", estimatedVRAMMB: 0, maxTextureSize: 0 };
  }

  return { backend: "none", estimatedVRAMMB: 0, maxTextureSize: 0 };
}

// ── Main Detection ──────────────────────────────────────────────────

export async function detectWebGPU(): Promise<GPUCapabilities> {
  // SSR guard
  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    const fallback = typeof document !== "undefined"
      ? detectWebGLCapabilities()
      : { backend: "none" as GraphicsBackend, estimatedVRAMMB: 0, maxTextureSize: 0 };

    return {
      supported: false,
      backend: fallback.backend,
      adapterInfo: null,
      maxBufferSize: 0,
      maxComputeWorkgroupsPerDimension: 0,
      maxComputeInvocationsPerWorkgroup: 0,
      maxStorageBufferBindingSize: 0,
      maxComputeWorkgroupStorageSize: 0,
      preferredFormat: null,
      estimatedVRAMMB: fallback.estimatedVRAMMB,
      maxTextureSize: fallback.maxTextureSize,
      supportsFloat16: false,
      supportsTimestampQuery: false,
    };
  }

  const gpu = navigator.gpu;

  try {
    const adapter = await gpu.requestAdapter({
      powerPreference: "high-performance",
    });

    if (!adapter) {
      const fallback = detectWebGLCapabilities();
      return {
        supported: false,
        backend: fallback.backend,
        adapterInfo: null,
        maxBufferSize: 0,
        maxComputeWorkgroupsPerDimension: 0,
        maxComputeInvocationsPerWorkgroup: 0,
        maxStorageBufferBindingSize: 0,
        maxComputeWorkgroupStorageSize: 0,
        preferredFormat: null,
        estimatedVRAMMB: fallback.estimatedVRAMMB,
        maxTextureSize: fallback.maxTextureSize,
        supportsFloat16: false,
        supportsTimestampQuery: false,
      };
    }

    const info = adapter.info;
    const limits = adapter.limits;
    const features = adapter.features;

    const adapterInfo: GPUAdapterInfo = {
      vendor: info.vendor,
      architecture: info.architecture,
      device: info.device,
      description: info.description,
    };

    const preferredFormat = gpu.getPreferredCanvasFormat();
    const estimatedVRAMMB = estimateVRAMFromAdapter(adapter, limits);

    return {
      supported: true,
      backend: "webgpu",
      adapterInfo,
      maxBufferSize: Number(limits.maxBufferSize),
      maxComputeWorkgroupsPerDimension: limits.maxComputeWorkgroupsPerDimension,
      maxComputeInvocationsPerWorkgroup: limits.maxComputeInvocationsPerWorkgroup,
      maxStorageBufferBindingSize: Number(limits.maxStorageBufferBindingSize),
      maxComputeWorkgroupStorageSize: limits.maxComputeWorkgroupStorageSize,
      preferredFormat,
      estimatedVRAMMB,
      maxTextureSize: limits.maxTextureDimension2D,
      supportsFloat16: features.has("shader-f16"),
      supportsTimestampQuery: features.has("timestamp-query"),
    };
  } catch {
    const fallback = detectWebGLCapabilities();
    return {
      supported: false,
      backend: fallback.backend,
      adapterInfo: null,
      maxBufferSize: 0,
      maxComputeWorkgroupsPerDimension: 0,
      maxComputeInvocationsPerWorkgroup: 0,
      maxStorageBufferBindingSize: 0,
      maxComputeWorkgroupStorageSize: 0,
      preferredFormat: null,
      estimatedVRAMMB: fallback.estimatedVRAMMB,
      maxTextureSize: fallback.maxTextureSize,
      supportsFloat16: false,
      supportsTimestampQuery: false,
    };
  }
}

// ── Compute Tier Mapping ────────────────────────────────────────────

export function getComputeTier(capabilities: GPUCapabilities): GPUComputeTier {
  if (!capabilities.supported) {
    return "none";
  }

  // High: Discrete GPU, 4GB+ VRAM, full compute support
  if (
    capabilities.estimatedVRAMMB >= 4096 &&
    capabilities.maxComputeWorkgroupsPerDimension >= 65535 &&
    capabilities.maxStorageBufferBindingSize >= 1024 * 1024 * 1024 // 1GB+
  ) {
    return "high";
  }

  // Medium: Integrated GPU, 2GB+ VRAM, decent compute
  if (
    capabilities.estimatedVRAMMB >= 2048 &&
    capabilities.maxComputeWorkgroupsPerDimension >= 256
  ) {
    return "medium";
  }

  // Low: Basic WebGPU support
  return "low";
}

// ── Fallback Chain Detection ────────────────────────────────────────

export function detectGraphicsBackend(): GraphicsBackend {
  if (typeof navigator === "undefined") return "none";

  if ("gpu" in navigator) return "webgpu";

  if (typeof document === "undefined") return "none";

  const canvas = document.createElement("canvas");

  if (canvas.getContext("webgl2")) {
    canvas.remove();
    return "webgl2";
  }

  if (canvas.getContext("webgl")) {
    canvas.remove();
    return "webgl";
  }

  if (canvas.getContext("2d")) {
    canvas.remove();
    return "canvas2d";
  }

  canvas.remove();
  return "none";
}
