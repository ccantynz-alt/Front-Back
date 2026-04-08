#!/usr/bin/env bun
/**
 * Bundle size checker: scans apps/web build output for JS files and enforces
 * the performance budget from CLAUDE.md §6.6.
 *
 * - WARN at 50KB initial bundle (doctrine target)
 * - FAIL at 100KB initial bundle (hard gate)
 * - Reports all JS file sizes for visibility
 * - Writes GitHub Actions step summary when running in CI
 */
import { appendFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const WEB_OUTPUT = join(ROOT, "apps/web/.output");

const WARN_THRESHOLD_KB = 50;
const FAIL_THRESHOLD_KB = 100;

interface FileEntry {
  path: string;
  sizeBytes: number;
  sizeKB: number;
}

function walk(dir: string, out: FileEntry[] = []): FileEntry[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let s: ReturnType<typeof statSync>;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walk(p, out);
    } else if (p.endsWith(".js") || p.endsWith(".mjs")) {
      out.push({
        path: relative(ROOT, p),
        sizeBytes: s.size,
        sizeKB: Math.round((s.size / 1024) * 100) / 100,
      });
    }
  }
  return out;
}

function findClientDir(): string | null {
  // SolidStart/Vinxi outputs client assets under .output/public/ or .output/client/
  const candidates = [
    join(WEB_OUTPUT, "public"),
    join(WEB_OUTPUT, "client"),
    WEB_OUTPUT,
  ];
  for (const dir of candidates) {
    try {
      statSync(dir);
      return dir;
    } catch {
      // continue
    }
  }
  return null;
}

/** Write to GitHub Actions step summary if available */
function writeSummary(markdown: string): void {
  const summaryPath = process.env["GITHUB_STEP_SUMMARY"];
  if (summaryPath) {
    appendFileSync(summaryPath, markdown + "\n");
  }
}

// Check that the build output exists
try {
  statSync(WEB_OUTPUT);
} catch {
  console.error("ERROR: apps/web/.output not found. Run `bun run build` first.");
  process.exit(1);
}

const clientDir = findClientDir();
if (!clientDir) {
  console.error("ERROR: Could not find client build output directory.");
  process.exit(1);
}

const allJsFiles = walk(WEB_OUTPUT);
const clientJsFiles = walk(clientDir);

// Sort by size descending
allJsFiles.sort((a, b) => b.sizeBytes - a.sizeBytes);
clientJsFiles.sort((a, b) => b.sizeBytes - a.sizeBytes);

const totalSizeKB = allJsFiles.reduce((sum, f) => sum + f.sizeKB, 0);
const clientTotalKB = clientJsFiles.reduce((sum, f) => sum + f.sizeKB, 0);

// Find the largest single client JS file (likely the initial bundle/entry)
const largestClientFile = clientJsFiles[0];

// Report
console.log("=== Bundle Size Report ===\n");
console.log(
  `Total JS output: ${Math.round(totalSizeKB * 100) / 100} KB across ${allJsFiles.length} files`,
);
console.log(
  `Client JS total: ${Math.round(clientTotalKB * 100) / 100} KB across ${clientJsFiles.length} files`,
);
console.log("");

if (clientJsFiles.length > 0) {
  console.log("Top 10 largest JS files:");
  for (const f of allJsFiles.slice(0, 10)) {
    const marker =
      f.sizeKB > FAIL_THRESHOLD_KB ? " [FAIL]" : f.sizeKB > WARN_THRESHOLD_KB ? " [WARN]" : "";
    console.log(`  ${f.sizeKB.toFixed(2)} KB  ${f.path}${marker}`);
  }
  console.log("");
}

// Evaluate the initial bundle (largest client-side JS file)
if (largestClientFile) {
  console.log(
    `Largest client JS file: ${largestClientFile.sizeKB.toFixed(2)} KB (${largestClientFile.path})`,
  );
}

let exitCode = 0;

// Check individual client files against thresholds
const failingFiles = clientJsFiles.filter((f) => f.sizeKB > FAIL_THRESHOLD_KB);
const warningFiles = clientJsFiles.filter(
  (f) => f.sizeKB > WARN_THRESHOLD_KB && f.sizeKB <= FAIL_THRESHOLD_KB,
);

if (warningFiles.length > 0) {
  console.log(`\nWARNING: ${warningFiles.length} file(s) exceed ${WARN_THRESHOLD_KB}KB target:`);
  for (const f of warningFiles) {
    console.log(`  ${f.sizeKB.toFixed(2)} KB  ${f.path}`);
  }
}

if (failingFiles.length > 0) {
  console.error(
    `\nFAIL: ${failingFiles.length} file(s) exceed ${FAIL_THRESHOLD_KB}KB hard limit:`,
  );
  for (const f of failingFiles) {
    console.error(`  ${f.sizeKB.toFixed(2)} KB  ${f.path}`);
  }
  exitCode = 1;
}

if (exitCode === 0 && warningFiles.length === 0) {
  console.log("\nOK: All client JS files within budget.");
}

// --- GitHub Actions Step Summary ---
const summaryLines: string[] = [];
summaryLines.push("## Bundle Size Report");
summaryLines.push("");
summaryLines.push(`| Metric | Value |`);
summaryLines.push(`|--------|-------|`);
summaryLines.push(
  `| Total JS output | ${Math.round(totalSizeKB * 100) / 100} KB (${allJsFiles.length} files) |`,
);
summaryLines.push(
  `| Client JS total | ${Math.round(clientTotalKB * 100) / 100} KB (${clientJsFiles.length} files) |`,
);
if (largestClientFile) {
  summaryLines.push(
    `| Largest client file | ${largestClientFile.sizeKB.toFixed(2)} KB (\`${largestClientFile.path}\`) |`,
  );
}
summaryLines.push(
  `| Warn threshold | ${WARN_THRESHOLD_KB} KB |`,
);
summaryLines.push(
  `| Fail threshold | ${FAIL_THRESHOLD_KB} KB |`,
);
summaryLines.push("");

if (allJsFiles.length > 0) {
  summaryLines.push("<details><summary>Top 10 largest JS files</summary>");
  summaryLines.push("");
  summaryLines.push("| Size (KB) | File | Status |");
  summaryLines.push("|-----------|------|--------|");
  for (const f of allJsFiles.slice(0, 10)) {
    const status =
      f.sizeKB > FAIL_THRESHOLD_KB ? "FAIL" : f.sizeKB > WARN_THRESHOLD_KB ? "WARN" : "OK";
    summaryLines.push(`| ${f.sizeKB.toFixed(2)} | \`${f.path}\` | ${status} |`);
  }
  summaryLines.push("");
  summaryLines.push("</details>");
  summaryLines.push("");
}

if (failingFiles.length > 0) {
  summaryLines.push(
    `> **FAIL:** ${failingFiles.length} file(s) exceed the ${FAIL_THRESHOLD_KB}KB hard limit.`,
  );
} else if (warningFiles.length > 0) {
  summaryLines.push(
    `> **WARNING:** ${warningFiles.length} file(s) exceed the ${WARN_THRESHOLD_KB}KB target but are under ${FAIL_THRESHOLD_KB}KB.`,
  );
} else {
  summaryLines.push("> **PASS:** All client JS files within budget.");
}

writeSummary(summaryLines.join("\n"));

process.exit(exitCode);
