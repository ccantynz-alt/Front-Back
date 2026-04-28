#!/usr/bin/env bun
/**
 * Build the analytics beacon snippet and verify it fits inside the
 * 1.5 KB gzipped budget. Failing this script fails the build — the budget
 * is the entire point of a privacy-first analytics product.
 */
import { gzipSync } from "node:zlib";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const out = resolve(root, "dist/beacon");
mkdirSync(out, { recursive: true });

const BUDGET_BYTES = 1536; // 1.5 KB

const result = await Bun.build({
  entrypoints: [resolve(root, "src/beacon/index.ts")],
  target: "browser",
  format: "esm",
  minify: true,
  sourcemap: "none",
});

if (!result.success) {
  console.error("[analytics] beacon build failed");
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

const artifact = result.outputs[0];
if (!artifact) {
  console.error("[analytics] beacon build produced no artifact");
  process.exit(1);
}

const text = await artifact.text();
const minPath = resolve(out, "analytics.min.js");
writeFileSync(minPath, text);

const gzipped = gzipSync(text, { level: 9 });
const gzPath = resolve(out, "analytics.min.js.gz");
writeFileSync(gzPath, gzipped);

const minSize = statSync(minPath).size;
const gzSize = statSync(gzPath).size;

console.log(`[analytics] beacon minified: ${minSize} bytes`);
console.log(`[analytics] beacon gzipped : ${gzSize} bytes (budget ${BUDGET_BYTES})`);

if (gzSize > BUDGET_BYTES) {
  console.error(
    `[analytics] FAIL: beacon exceeds ${BUDGET_BYTES}-byte gzipped budget by ${gzSize - BUDGET_BYTES} bytes`,
  );
  process.exit(1);
}

writeFileSync(resolve(out, "size.json"), JSON.stringify({ minSize, gzSize, budget: BUDGET_BYTES }, null, 2));
console.log("[analytics] beacon size budget OK");
