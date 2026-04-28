// ── Browser Feature Detection Tests ─────────────────────────────────────

import { describe, expect, test } from "bun:test";
import {
  type BrowserCapabilitiesEnv,
  canBrowserHandle,
} from "./feature-detect";
import type { TargetSpec } from "../core/types";

const fullCaps: BrowserCapabilitiesEnv = {
  hasWebCodecs: true,
  hasWebGPU: true,
  requestAdapter: async () => ({}),
};

const baseTarget: TargetSpec = {
  container: "mp4",
  videoCodec: "h264",
  audioCodec: "aac",
  width: 1920,
  height: 1080,
};

describe("canBrowserHandle", () => {
  test("happy path — full caps + h264 mp4 1080p", () => {
    const v = canBrowserHandle(fullCaps, baseTarget);
    expect(v.canBrowserHandle).toBe(true);
    expect(v.reason).toBeUndefined();
  });

  test("fails closed when WebCodecs is missing", () => {
    const v = canBrowserHandle(
      { hasWebCodecs: false, hasWebGPU: true },
      baseTarget,
    );
    expect(v.canBrowserHandle).toBe(false);
    expect(v.reason).toBe("no_webcodecs");
  });

  test("fails closed when WebGPU is missing", () => {
    const v = canBrowserHandle(
      { hasWebCodecs: true, hasWebGPU: false },
      baseTarget,
    );
    expect(v.canBrowserHandle).toBe(false);
    expect(v.reason).toBe("no_webgpu");
  });

  test("falls back for av1 (not browser-encodable)", () => {
    const v = canBrowserHandle(fullCaps, { ...baseTarget, videoCodec: "av1" });
    expect(v.canBrowserHandle).toBe(false);
    expect(v.reason).toBe("unsupported_codec");
  });

  test("falls back for mov container", () => {
    const v = canBrowserHandle(fullCaps, { ...baseTarget, container: "mov" });
    expect(v.canBrowserHandle).toBe(false);
    expect(v.reason).toBe("unsupported_container");
  });

  test("falls back for resolution above 4K", () => {
    const v = canBrowserHandle(fullCaps, {
      ...baseTarget,
      width: 7680,
      height: 4320,
    });
    expect(v.canBrowserHandle).toBe(false);
    expect(v.reason).toBe("resolution_too_large");
  });
});
