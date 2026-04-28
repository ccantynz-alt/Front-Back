import { gzipSync } from "node:zlib";
import { resolve } from "node:path";
import { describe, expect, it } from "bun:test";

/**
 * Hard guard: the compiled beacon stays under 2 KB gzipped. If this test
 * starts failing, the beacon has bloated and either needs trimming or the
 * doctrine needs explicit Craig authorization to widen the budget.
 */
describe("beacon build budget", () => {
  it("compiles to under 2 KB gzipped", async () => {
    const result = await Bun.build({
      entrypoints: [resolve(import.meta.dir, "..", "src/beacon/index.ts")],
      target: "browser",
      format: "esm",
      minify: true,
    });
    expect(result.success).toBe(true);
    const artifact = result.outputs[0];
    if (!artifact) throw new Error("no output");
    const text = await artifact.text();
    const gz = gzipSync(text, { level: 9 });
    expect(gz.byteLength).toBeLessThanOrEqual(2048);
  });
});
