#!/usr/bin/env bun
/**
 * Zero-HTML checker — enforces CLAUDE.md §6.1 (Iron Rule: no raw HTML).
 *
 * Scans apps/web/src/**\/*.tsx for raw HTML elements that have a UI
 * primitive equivalent and:
 *
 *   1. Reads the per-file baseline from scripts/zero-html-baseline.json
 *   2. Fails if any existing file's count INCREASES (drift)
 *   3. Fails if any NEW .tsx file contains any raw element from the
 *      covered set (no new breach)
 *   4. Decreases are always allowed (migrations are welcome)
 *
 * Run --update to refresh the baseline (only after a migration commit).
 *
 * Covered (must use primitives):
 *   div, span, p, h1-h6, button, input, textarea, select, label,
 *   section, nav, header, footer, main, article, aside
 *
 * Allowlisted (no primitive yet — see Phase 2):
 *   a, ul, ol, li, form, table/tr/td/th/thead/tbody, img
 *
 * Permanently allowed (intentionally NOT components):
 *   svg, hr, br, meta, link
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "apps/web/src");
const BASELINE_PATH = join(ROOT, "scripts/zero-html-baseline.json");

const COVERED = [
  "div",
  "span",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "button",
  "input",
  "textarea",
  "select",
  "label",
  "section",
  "nav",
  "header",
  "footer",
  "main",
  "article",
  "aside",
] as const;

const COVERED_RE = new RegExp(`<(${COVERED.join("|")})(\\s|>|/)`, "g");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx") && !p.endsWith(".test.tsx")) out.push(p);
  }
  return out;
}

function countRawHtml(src: string): number {
  return (src.match(COVERED_RE) ?? []).length;
}

function buildCounts(): Record<string, number> {
  const files = walk(SRC);
  const counts: Record<string, number> = {};
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const n = countRawHtml(src);
    if (n > 0) counts[relative(ROOT, file)] = n;
  }
  return counts;
}

function readBaseline(): Record<string, number> {
  if (!existsSync(BASELINE_PATH)) return {};
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Record<string, number>;
}

function writeBaseline(counts: Record<string, number>): void {
  const sorted: Record<string, number> = {};
  for (const k of Object.keys(counts).sort()) sorted[k] = counts[k]!;
  writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
}

function main(): void {
  const args = new Set(process.argv.slice(2));
  const current = buildCounts();

  if (args.has("--update")) {
    writeBaseline(current);
    const total = Object.values(current).reduce((a, b) => a + b, 0);
    console.log(
      `[zero-html] Baseline updated: ${Object.keys(current).length} files, ${total} raw elements`,
    );
    process.exit(0);
  }

  const baseline = readBaseline();
  const violations: string[] = [];

  for (const [file, count] of Object.entries(current)) {
    const baseCount = baseline[file];
    if (baseCount === undefined) {
      violations.push(
        `❌ NEW FILE WITH RAW HTML: ${file} (${count} elements) — new files must use UI primitives only`,
      );
    } else if (count > baseCount) {
      violations.push(
        `❌ DRIFT: ${file} grew from ${baseCount} → ${count} raw elements (+${count - baseCount})`,
      );
    }
  }

  const totalCurrent = Object.values(current).reduce((a, b) => a + b, 0);
  const totalBase = Object.values(baseline).reduce((a, b) => a + b, 0);
  const filesCurrent = Object.keys(current).length;
  const filesBase = Object.keys(baseline).length;

  console.log("[zero-html] Wave 9 progress:");
  console.log(
    `  Files with raw HTML: ${filesCurrent} (baseline ${filesBase}, delta ${filesCurrent - filesBase})`,
  );
  console.log(
    `  Raw elements total: ${totalCurrent} (baseline ${totalBase}, delta ${totalCurrent - totalBase})`,
  );

  if (violations.length > 0) {
    console.error("\n[zero-html] FAILED — doctrine breach detected:\n");
    for (const v of violations) console.error(`  ${v}`);
    console.error("\nRemediation:");
    console.error("  1. Replace raw HTML with @back-to-the-future/ui primitives");
    console.error("  2. See CLAUDE.md §6.1 + §6.3 for the rule");
    console.error("  3. After a real migration, run: bun run check-zero-html --update");
    process.exit(1);
  }

  console.log("\n[zero-html] ✅ PASS — no drift, no new breaches");
}

main();
