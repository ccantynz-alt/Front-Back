// ── ffmpeg Argument Construction Tests ──────────────────────────────────

import { describe, expect, test } from "bun:test";
import { buildFfmpegArgs } from "./ffmpeg";
import type { TargetSpec } from "./types";

const target = (overrides: Partial<TargetSpec> = {}): TargetSpec => ({
  container: "mp4",
  videoCodec: "h264",
  audioCodec: "aac",
  width: 1920,
  height: 1080,
  ...overrides,
});

describe("buildFfmpegArgs", () => {
  test("contains -i input -y -hide_banner and output path last", () => {
    const args = buildFfmpegArgs({
      inputPath: "/tmp/in.mov",
      outputPath: "/tmp/out.mp4",
      target: target(),
    });
    expect(args).toContain("-hide_banner");
    expect(args).toContain("-y");
    expect(args).toContain("/tmp/in.mov");
    expect(args[args.length - 1]).toBe("/tmp/out.mp4");
  });

  test("maps h264 to libx264", () => {
    const args = buildFfmpegArgs({
      inputPath: "in",
      outputPath: "out",
      target: target({ videoCodec: "h264" }),
    });
    const idx = args.indexOf("-c:v");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe("libx264");
  });

  test("maps vp9 to libvpx-vp9 for webm", () => {
    const args = buildFfmpegArgs({
      inputPath: "in",
      outputPath: "out",
      target: target({
        container: "webm",
        videoCodec: "vp9",
        audioCodec: "opus",
      }),
    });
    const idx = args.indexOf("-c:v");
    expect(args[idx + 1]).toBe("libvpx-vp9");
    const aIdx = args.indexOf("-c:a");
    expect(args[aIdx + 1]).toBe("libopus");
    const fIdx = args.indexOf("-f");
    expect(args[fIdx + 1]).toBe("webm");
  });

  test("clamps 8K to 4K in the scale filter", () => {
    const args = buildFfmpegArgs({
      inputPath: "in",
      outputPath: "out",
      target: target({ width: 7680, height: 4320 }),
    });
    const idx = args.indexOf("-vf");
    const scale = args[idx + 1] ?? "";
    expect(scale.startsWith("scale=")).toBe(true);
    const match = /scale=(\d+):(\d+)/.exec(scale);
    expect(match).not.toBeNull();
    if (match) {
      const w = Number(match[1]);
      const h = Number(match[2]);
      expect(w).toBeLessThanOrEqual(3840);
      expect(h).toBeLessThanOrEqual(2160);
    }
  });

  test("uses provided bitrate verbatim when supplied", () => {
    const args = buildFfmpegArgs({
      inputPath: "in",
      outputPath: "out",
      target: target({ bitrate: 5_000_000 }),
    });
    const idx = args.indexOf("-b:v");
    expect(args[idx + 1]).toBe("5000000");
  });

  test("default fps is 30 when not provided", () => {
    const args = buildFfmpegArgs({
      inputPath: "in",
      outputPath: "out",
      target: target(),
    });
    const idx = args.indexOf("-r");
    expect(args[idx + 1]).toBe("30");
  });
});
