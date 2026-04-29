import { describe, expect, it } from "bun:test";
import { gzipSync } from "node:zlib";
import { resolve } from "node:path";

const BUDGET_BYTES = 1536;

describe("beacon size budget", () => {
  it("stays under the 1.5 KB gzipped budget", async () => {
    const result = await Bun.build({
      entrypoints: [resolve(import.meta.dir, "../src/beacon/index.ts")],
      target: "browser",
      format: "esm",
      minify: true,
      sourcemap: "none",
    });
    expect(result.success).toBe(true);
    const artifact = result.outputs[0];
    expect(artifact).toBeDefined();
    if (!artifact) throw new Error("no beacon artifact");
    const text = await artifact.text();
    const gzSize = gzipSync(text, { level: 9 }).byteLength;
    expect(gzSize).toBeLessThanOrEqual(BUDGET_BYTES);
  });
});
