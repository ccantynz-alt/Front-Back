import { describe, expect, test } from "bun:test";
import { BuildArtefactSchema, FrameworkSchema } from "../src/schemas";

describe("BuildArtefactSchema", () => {
  test("accepts a well-formed artefact", () => {
    const ok = BuildArtefactSchema.safeParse({
      buildId: "b1",
      tenantId: "t",
      projectId: "p",
      sha: "abcdef0",
      framework: "solidstart",
      tarballPath: "/tmp/b.tar",
      sizeBytes: 100,
      sha256: "a".repeat(64),
      hostname: "h.test",
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.limits).toEqual({ cpuMs: 50, memoryMb: 128 });
    }
  });

  test("rejects malformed sha256", () => {
    const r = BuildArtefactSchema.safeParse({
      buildId: "b1",
      tenantId: "t",
      projectId: "p",
      sha: "abcdef0",
      framework: "solidstart",
      tarballPath: "/tmp/b.tar",
      sizeBytes: 100,
      sha256: "nothex",
      hostname: "h.test",
    });
    expect(r.success).toBe(false);
  });

  test("rejects unknown framework", () => {
    expect(FrameworkSchema.safeParse("php-laravel").success).toBe(false);
  });
});
