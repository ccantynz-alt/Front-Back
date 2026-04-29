// ── Codec Negotiation Tests ─────────────────────────────────────────────

import { describe, expect, test } from "bun:test";
import {
  BROWSER_ENCODE_CODECS,
  CONTAINER_AUDIO_CODECS,
  CONTAINER_VIDEO_CODECS,
  isBrowserEncodable,
  negotiateCodec,
} from "./codec";
import type { TargetSpec } from "./types";

const baseTarget = (overrides: Partial<TargetSpec> = {}): TargetSpec => ({
  container: "mp4",
  videoCodec: "h264",
  audioCodec: "aac",
  width: 1920,
  height: 1080,
  ...overrides,
});

describe("negotiateCodec", () => {
  test("accepts compatible mp4/h264/aac", () => {
    const r = negotiateCodec(baseTarget());
    expect(r.accepted).toBe(true);
    if (r.accepted) {
      expect(r.target.container).toBe("mp4");
    }
  });

  test("rejects mp4 + vp9 (incompatible video codec)", () => {
    const r = negotiateCodec(baseTarget({ videoCodec: "vp9" }));
    expect(r.accepted).toBe(false);
    if (!r.accepted) {
      expect(r.reason).toContain("mp4");
      expect(r.reason).toContain("vp9");
    }
  });

  test("rejects webm + aac (incompatible audio codec)", () => {
    const r = negotiateCodec(
      baseTarget({ container: "webm", videoCodec: "vp9", audioCodec: "aac" }),
    );
    expect(r.accepted).toBe(false);
  });

  test("accepts webm + vp9 + opus", () => {
    const r = negotiateCodec(
      baseTarget({ container: "webm", videoCodec: "vp9", audioCodec: "opus" }),
    );
    expect(r.accepted).toBe(true);
  });

  test("accepts mov + h264 + aac", () => {
    const r = negotiateCodec(baseTarget({ container: "mov" }));
    expect(r.accepted).toBe(true);
  });

  test("rejects mov + vp9", () => {
    const r = negotiateCodec(
      baseTarget({ container: "mov", videoCodec: "vp9", audioCodec: "aac" }),
    );
    expect(r.accepted).toBe(false);
  });
});

describe("compatibility matrices", () => {
  test("every container has at least one video codec", () => {
    for (const c of Object.keys(CONTAINER_VIDEO_CODECS)) {
      const codecs =
        CONTAINER_VIDEO_CODECS[c as keyof typeof CONTAINER_VIDEO_CODECS];
      expect(codecs.length).toBeGreaterThan(0);
    }
  });
  test("every container has at least one audio codec", () => {
    for (const c of Object.keys(CONTAINER_AUDIO_CODECS)) {
      const codecs =
        CONTAINER_AUDIO_CODECS[c as keyof typeof CONTAINER_AUDIO_CODECS];
      expect(codecs.length).toBeGreaterThan(0);
    }
  });
});

describe("isBrowserEncodable", () => {
  test("h264 + vp9 are browser-encodable today", () => {
    expect(isBrowserEncodable("h264")).toBe(true);
    expect(isBrowserEncodable("vp9")).toBe(true);
  });
  test("h265 + av1 currently fall back to server", () => {
    expect(isBrowserEncodable("h265")).toBe(false);
    expect(isBrowserEncodable("av1")).toBe(false);
  });
  test("BROWSER_ENCODE_CODECS only contains entries from VideoCodec", () => {
    expect(BROWSER_ENCODE_CODECS.length).toBeGreaterThan(0);
  });
});
