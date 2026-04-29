// ── schema shape tests ────────────────────────────────────────────────

import { describe, expect, test } from "bun:test";
import {
  buildArtefactSchema,
  buildRequestSchema,
  frameworkSchema,
} from "../src/schemas";

describe("buildRequestSchema", () => {
  test("applies defaults for optional fields", () => {
    const parsed = buildRequestSchema.parse({
      buildId: "b1",
      tenantId: "t1",
      repo: "https://github.com/foo/bar.git",
      ref: "main",
      sha: "deadbeef",
    });
    expect(parsed.buildCommand).toBe("bun install && bun run build");
    expect(parsed.installCommand).toBe("bun install --frozen-lockfile");
    expect(parsed.outputDir).toBe("dist");
    expect(parsed.timeoutMs).toBe(10 * 60 * 1000);
    expect(parsed.memoryLimitBytes).toBe(4 * 1024 * 1024 * 1024);
    expect(parsed.env).toEqual({});
  });

  test("rejects bad sha (not hex)", () => {
    const result = buildRequestSchema.safeParse({
      buildId: "b1",
      tenantId: "t1",
      repo: "https://github.com/foo/bar.git",
      ref: "main",
      sha: "ZZZZ",
    });
    expect(result.success).toBe(false);
  });

  test("rejects bad repo URL", () => {
    const result = buildRequestSchema.safeParse({
      buildId: "b1",
      tenantId: "t1",
      repo: "not-a-url",
      ref: "main",
      sha: "deadbeef",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty buildId", () => {
    const result = buildRequestSchema.safeParse({
      buildId: "",
      tenantId: "t1",
      repo: "https://github.com/foo/bar.git",
      ref: "main",
      sha: "deadbeef",
    });
    expect(result.success).toBe(false);
  });
});

describe("buildArtefactSchema", () => {
  test("requires 64-char hex sha256", () => {
    const result = buildArtefactSchema.safeParse({
      buildId: "b1",
      tenantId: "t1",
      sha: "deadbeef",
      framework: "nextjs",
      tarballPath: "/tmp/x.tar.gz",
      sizeBytes: 100,
      sha256: "tooshort",
      durationMs: 500,
      exitCode: 0,
      cacheHit: false,
      outputDir: "dist",
      detectedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  test("validates a complete artefact", () => {
    const sha256 = "a".repeat(64);
    const result = buildArtefactSchema.safeParse({
      buildId: "b1",
      tenantId: "t1",
      sha: "deadbeef",
      framework: "solidstart",
      tarballPath: "/tmp/x.tar.gz",
      sizeBytes: 100,
      sha256,
      durationMs: 500,
      exitCode: 0,
      cacheHit: true,
      outputDir: "dist",
      detectedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });
});

describe("frameworkSchema", () => {
  test("accepts every known framework value", () => {
    const all = ["solidstart", "nextjs", "astro", "vite", "bun", "node", "static", "unknown"];
    for (const f of all) {
      const r = frameworkSchema.safeParse(f);
      expect(r.success).toBe(true);
    }
  });

  test("rejects unknown framework string", () => {
    expect(frameworkSchema.safeParse("svelte").success).toBe(false);
  });
});
