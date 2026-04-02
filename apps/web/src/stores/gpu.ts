// ── GPU Capabilities Store ──────────────────────────────────────────
// Signal-based reactive store for GPU capabilities.
// Initializes after hydration, provides reactive access to GPU tier,
// full capabilities, and Chrome AI availability.

import {
  type Accessor,
  createSignal,
} from "solid-js";
import {
  type ChromeAICapabilities,
  type GPUCapabilities,
  type GPUComputeTier,
  type GraphicsBackend,
  detectWebGPU,
  getComputeTier,
  isChromeAIAvailable,
} from "~/gpu";

// ── Store Types ─────────────────────────────────────────────────────

export interface GPUStore {
  /** Detected GPU compute tier: high, medium, low, or none */
  gpuTier: Accessor<GPUComputeTier>;
  /** Full GPU capabilities object */
  gpuInfo: Accessor<GPUCapabilities | null>;
  /** Graphics backend in use: webgpu, webgl2, webgl, canvas2d, none */
  graphicsBackend: Accessor<GraphicsBackend>;
  /** Chrome built-in AI availability */
  chromeAIAvailable: Accessor<ChromeAICapabilities | null>;
  /** Whether detection has completed */
  isReady: Accessor<boolean>;
  /** Whether the client has any GPU compute capability */
  hasGPUCompute: Accessor<boolean>;
  /** Re-detect capabilities (e.g., after GPU device change) */
  redetect: () => Promise<void>;
}

// ── Store Implementation ────────────────────────────────────────────

export function useGPU(): GPUStore {
  const [gpuTier, setGpuTier] = createSignal<GPUComputeTier>("none");
  const [gpuInfo, setGpuInfo] = createSignal<GPUCapabilities | null>(null);
  const [graphicsBackend, setGraphicsBackend] = createSignal<GraphicsBackend>("none");
  const [chromeAIAvailable, setChromeAIAvailable] = createSignal<ChromeAICapabilities | null>(null);
  const [isReady, setIsReady] = createSignal(false);

  const hasGPUCompute: Accessor<boolean> = (): boolean => {
    const tier = gpuTier();
    return tier !== "none";
  };

  const detect = async (): Promise<void> => {
    try {
      // Run WebGPU detection and Chrome AI detection in parallel
      const [capabilities, chromeAI] = await Promise.all([
        detectWebGPU(),
        isChromeAIAvailable(),
      ]);

      setGpuInfo(capabilities);
      setGpuTier(getComputeTier(capabilities));
      setGraphicsBackend(capabilities.backend);
      setChromeAIAvailable(chromeAI);
    } catch (error) {
      console.error("GPU detection failed:", error);
      setGpuTier("none");
      setGraphicsBackend("none");
    } finally {
      setIsReady(true);
    }
  };

  // Initialize after hydration (client-side only)
  if (typeof window !== "undefined") {
    // Use queueMicrotask to run after SolidJS hydration completes
    queueMicrotask(() => {
      detect();
    });
  }

  return {
    gpuTier,
    gpuInfo,
    graphicsBackend,
    chromeAIAvailable,
    isReady,
    hasGPUCompute,
    redetect: detect,
  };
}
