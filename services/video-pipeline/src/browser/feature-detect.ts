// ── Browser Feature Detection ───────────────────────────────────────────
// We do NOT call WebGPU/WebCodecs at module load — detection is lazy &
// dependency-injected so unit tests can mock the navigator/globalThis.

import { isBrowserEncodable } from "../core/codec";
import {
  MAX_HEIGHT,
  MAX_WIDTH,
  type BrowserFallbackReason,
  type TargetSpec,
} from "../core/types";

/** Minimal duck-typed shape of the global APIs we sniff for. */
export interface BrowserCapabilitiesEnv {
  readonly hasWebCodecs: boolean;
  readonly hasWebGPU: boolean;
  readonly requestAdapter?: () => Promise<unknown>;
}

/** Build a capabilities env from the real `globalThis` / `navigator`. */
export function detectCapabilitiesFromGlobal(): BrowserCapabilitiesEnv {
  const g = globalThis as unknown as {
    VideoEncoder?: unknown;
    VideoDecoder?: unknown;
    navigator?: { gpu?: { requestAdapter: () => Promise<unknown> } };
  };
  const hasWebCodecs =
    typeof g.VideoEncoder === "function" && typeof g.VideoDecoder === "function";
  const gpu = g.navigator?.gpu;
  const hasWebGPU = typeof gpu?.requestAdapter === "function";
  return {
    hasWebCodecs,
    hasWebGPU,
    ...(gpu ? { requestAdapter: () => gpu.requestAdapter() } : {}),
  };
}

export interface CapabilityVerdict {
  readonly canBrowserHandle: boolean;
  readonly reason?: BrowserFallbackReason;
}

/**
 * Decide whether this browser can fully handle the requested target spec.
 * Returns a structured fallback reason when not — never throws.
 */
export function canBrowserHandle(
  env: BrowserCapabilitiesEnv,
  target: TargetSpec,
): CapabilityVerdict {
  if (!env.hasWebCodecs) {
    return { canBrowserHandle: false, reason: "no_webcodecs" };
  }
  if (!env.hasWebGPU) {
    return { canBrowserHandle: false, reason: "no_webgpu" };
  }
  if (!isBrowserEncodable(target.videoCodec)) {
    return { canBrowserHandle: false, reason: "unsupported_codec" };
  }
  if (target.container === "mov") {
    // MOV writing is not browser-friendly — always punt to server.
    return { canBrowserHandle: false, reason: "unsupported_container" };
  }
  if (target.width > MAX_WIDTH || target.height > MAX_HEIGHT) {
    return { canBrowserHandle: false, reason: "resolution_too_large" };
  }
  return { canBrowserHandle: true };
}
