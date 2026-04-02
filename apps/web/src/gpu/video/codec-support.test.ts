/**
 * Tests for WebCodecs feature detection and codec support querying.
 *
 * These tests run in a Node/Bun environment where WebCodecs globals are
 * absent, so they exercise the fallback / unavailable paths and verify
 * that the detection logic is structurally correct. Browser-based tests
 * (Playwright) would cover the happy path with real WebCodecs support.
 */

import { describe, expect, it, afterEach } from "bun:test";
import {
  isWebCodecsSupported,
  getSupportedCodecs,
  getBestCodec,
} from "./codec-support";

// ---------------------------------------------------------------------------
// Helpers — mock WebCodecs globals
// ---------------------------------------------------------------------------

function installMockVideoEncoder(
  isConfigSupported: (
    config: VideoEncoderConfig,
  ) => Promise<VideoEncoderSupport>,
): void {
  (globalThis as Record<string, unknown>).VideoEncoder = Object.assign(
    function VideoEncoder() {
      /* noop constructor */
    },
    { isConfigSupported },
  );
}

function removeMockVideoEncoder(): void {
  delete (globalThis as Record<string, unknown>).VideoEncoder;
}

// ---------------------------------------------------------------------------
// Tests: isWebCodecsSupported
// ---------------------------------------------------------------------------

describe("isWebCodecsSupported", () => {
  afterEach(() => {
    // Clean up any mocks.
    delete (globalThis as Record<string, unknown>).VideoEncoder;
    delete (globalThis as Record<string, unknown>).VideoDecoder;
    delete (globalThis as Record<string, unknown>).AudioEncoder;
    delete (globalThis as Record<string, unknown>).AudioDecoder;
  });

  it("returns all false when no WebCodecs globals exist", () => {
    const result = isWebCodecsSupported();
    expect(result.videoEncoder).toBe(false);
    expect(result.videoDecoder).toBe(false);
    expect(result.audioEncoder).toBe(false);
    expect(result.audioDecoder).toBe(false);
    expect(result.allSupported).toBe(false);
  });

  it("returns allSupported=true when all four globals exist", () => {
    const noop = function (): void {};
    (globalThis as Record<string, unknown>).VideoEncoder = noop;
    (globalThis as Record<string, unknown>).VideoDecoder = noop;
    (globalThis as Record<string, unknown>).AudioEncoder = noop;
    (globalThis as Record<string, unknown>).AudioDecoder = noop;

    const result = isWebCodecsSupported();
    expect(result.videoEncoder).toBe(true);
    expect(result.videoDecoder).toBe(true);
    expect(result.audioEncoder).toBe(true);
    expect(result.audioDecoder).toBe(true);
    expect(result.allSupported).toBe(true);
  });

  it("returns partial support when only some globals exist", () => {
    const noop = function (): void {};
    (globalThis as Record<string, unknown>).VideoEncoder = noop;
    (globalThis as Record<string, unknown>).VideoDecoder = noop;

    const result = isWebCodecsSupported();
    expect(result.videoEncoder).toBe(true);
    expect(result.videoDecoder).toBe(true);
    expect(result.audioEncoder).toBe(false);
    expect(result.audioDecoder).toBe(false);
    expect(result.allSupported).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: getSupportedCodecs
// ---------------------------------------------------------------------------

describe("getSupportedCodecs", () => {
  afterEach(() => {
    removeMockVideoEncoder();
  });

  it("returns empty results with no bestCodec when VideoEncoder is unavailable", async () => {
    removeMockVideoEncoder(); // ensure not present
    const report = await getSupportedCodecs();
    expect(report.results).toHaveLength(0);
    expect(report.bestCodec).toBeNull();
  });

  it("returns supported codecs in preference order (av1 > vp9 > h264)", async () => {
    installMockVideoEncoder(async (_config: VideoEncoderConfig) => ({
      supported: true,
      config: _config,
    }));

    const report = await getSupportedCodecs();
    expect(report.results.length).toBeGreaterThan(0);
    expect(report.results[0]?.codec).toBe("av1");
    expect(report.bestCodec).toBe("av1");
  });

  it("falls back to vp9 when av1 is not supported", async () => {
    installMockVideoEncoder(async (config: VideoEncoderConfig) => {
      const isAv1 = config.codec.startsWith("av01");
      return {
        supported: !isAv1,
        config,
      };
    });

    const report = await getSupportedCodecs();
    expect(report.bestCodec).toBe("vp9");
  });

  it("falls back to h264 when av1 and vp9 are not supported", async () => {
    installMockVideoEncoder(async (config: VideoEncoderConfig) => {
      const isH264 = config.codec.startsWith("avc1");
      return {
        supported: isH264,
        config,
      };
    });

    const report = await getSupportedCodecs();
    expect(report.bestCodec).toBe("h264");
  });

  it("returns null bestCodec when nothing is supported", async () => {
    installMockVideoEncoder(async (_config: VideoEncoderConfig) => ({
      supported: false,
      config: _config,
    }));

    const report = await getSupportedCodecs();
    expect(report.bestCodec).toBeNull();
    for (const r of report.results) {
      expect(r.supported).toBe(false);
    }
  });

  it("handles isConfigSupported throwing an error gracefully", async () => {
    installMockVideoEncoder(async () => {
      throw new Error("GPU driver crash");
    });

    const report = await getSupportedCodecs();
    // All codecs should show as unsupported (error caught internally).
    for (const r of report.results) {
      expect(r.supported).toBe(false);
    }
    expect(report.bestCodec).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: getBestCodec
// ---------------------------------------------------------------------------

describe("getBestCodec", () => {
  afterEach(() => {
    removeMockVideoEncoder();
  });

  it("returns null when VideoEncoder is unavailable", async () => {
    const best = await getBestCodec();
    expect(best).toBeNull();
  });

  it("returns the highest-preference supported codec", async () => {
    installMockVideoEncoder(async (config: VideoEncoderConfig) => {
      // Only VP9 supported.
      const isVp9 = config.codec.startsWith("vp09");
      return { supported: isVp9, config };
    });

    const best = await getBestCodec();
    expect(best).toBe("vp9");
  });
});
