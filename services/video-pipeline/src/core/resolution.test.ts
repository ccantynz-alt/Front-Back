// ── Resolution + Bitrate Tests ──────────────────────────────────────────

import { describe, expect, test } from "bun:test";
import { calculateBitrate, clampResolution } from "./resolution";

describe("clampResolution", () => {
  test("passes through 1080p untouched", () => {
    const r = clampResolution({ width: 1920, height: 1080 });
    expect(r).toEqual({ width: 1920, height: 1080 });
  });

  test("clamps 8K down to 4K preserving aspect", () => {
    const r = clampResolution({ width: 7680, height: 4320 });
    expect(r.width).toBeLessThanOrEqual(3840);
    expect(r.height).toBeLessThanOrEqual(2160);
    // 16:9 aspect preserved within rounding tolerance
    expect(Math.abs(r.width / r.height - 16 / 9)).toBeLessThan(0.01);
  });

  test("forces even dimensions", () => {
    const r = clampResolution({ width: 1921, height: 1081 });
    expect(r.width % 2).toBe(0);
    expect(r.height % 2).toBe(0);
  });

  test("rejects zero / negative dimensions", () => {
    expect(() => clampResolution({ width: 0, height: 100 })).toThrow();
    expect(() => clampResolution({ width: 100, height: -1 })).toThrow();
  });

  test("clamps tall portrait video too", () => {
    const r = clampResolution({ width: 2160, height: 7680 });
    expect(r.width).toBeLessThanOrEqual(3840);
    expect(r.height).toBeLessThanOrEqual(2160);
  });
});

describe("calculateBitrate", () => {
  test("rejects zero / negative fps", () => {
    expect(() =>
      calculateBitrate({ width: 1920, height: 1080 }, 0, "h264"),
    ).toThrow();
  });

  test("h264 1080p30 lands inside [200kbps..100Mbps]", () => {
    const b = calculateBitrate({ width: 1920, height: 1080 }, 30, "h264");
    expect(b).toBeGreaterThanOrEqual(200_000);
    expect(b).toBeLessThanOrEqual(100_000_000);
  });

  test("av1 needs less bitrate than h264 at the same resolution", () => {
    const av1 = calculateBitrate({ width: 1920, height: 1080 }, 30, "av1");
    const h264 = calculateBitrate({ width: 1920, height: 1080 }, 30, "h264");
    expect(av1).toBeLessThan(h264);
  });

  test("higher resolution increases bitrate (when not clamped)", () => {
    const small = calculateBitrate({ width: 640, height: 360 }, 30, "h264");
    const big = calculateBitrate({ width: 1920, height: 1080 }, 30, "h264");
    expect(big).toBeGreaterThan(small);
  });
});
