// ── Browser transcode() generator tests ─────────────────────────────────

import { describe, expect, test } from "bun:test";
import { BrowserTranscodeError, transcode } from "./index";
import type { BrowserCapabilitiesEnv } from "./feature-detect";
import type { ProgressEvent, SourceRef, TargetSpec } from "../core/types";

const fullCaps: BrowserCapabilitiesEnv = {
  hasWebCodecs: true,
  hasWebGPU: true,
  requestAdapter: async () => ({}),
};

const sampleSource: SourceRef = {
  kind: "blob",
  blob: new Blob([new Uint8Array(8)]),
};

const sampleTarget: TargetSpec = {
  container: "mp4",
  videoCodec: "h264",
  audioCodec: "aac",
  width: 1280,
  height: 720,
};

describe("transcode (browser)", () => {
  test("yields queued + running progress and returns done", async () => {
    const gen = transcode({
      source: sampleSource,
      target: sampleTarget,
      env: fullCaps,
    });

    const events: ProgressEvent[] = [];
    let final: ProgressEvent | undefined;
    while (true) {
      const next = await gen.next();
      if (next.done) {
        final = next.value;
        break;
      }
      events.push(next.value);
    }
    expect(events[0]?.state).toBe("queued");
    expect(events.some((e) => e.state === "running")).toBe(true);
    expect(final?.state).toBe("done");
    expect(final?.progress).toBe(1);
  });

  test("throws BrowserTranscodeError when WebGPU missing", async () => {
    const gen = transcode({
      source: sampleSource,
      target: sampleTarget,
      env: { hasWebCodecs: true, hasWebGPU: false },
    });
    try {
      await gen.next();
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(BrowserTranscodeError);
      if (err instanceof BrowserTranscodeError) {
        expect(err.code).toBe("no_webgpu");
      }
    }
  });

  test("throws BrowserTranscodeError on bad codec/container combo", async () => {
    // mp4 + vp9 is invalid — but caps would otherwise allow browser tier.
    const gen = transcode({
      source: sampleSource,
      target: { ...sampleTarget, videoCodec: "vp9" },
      env: fullCaps,
    });
    try {
      await gen.next();
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(BrowserTranscodeError);
    }
  });
});
