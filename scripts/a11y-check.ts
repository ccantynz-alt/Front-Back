#!/usr/bin/env bun
/**
 * Accessibility checker: scans apps/web/src/routes/**.tsx for common a11y
 * violations. This is a static analysis tool -- it catches what can be caught
 * without rendering.
 *
 * Checks:
 * 1. <img> without alt attribute
 * 2. <button>/<Button> without accessible text (children, aria-label, aria-labelledby)
 * 3. <input>/<Input> without associated label (label prop, aria-label, aria-labelledby, id+htmlFor)
 * 4. <html> or root layout missing lang attribute
 * 5. onClick on non-interactive elements without role and keyboard handler
 * 6. <a>/<A> without href or with empty href
 * 7. <form> without aria-label or aria-labelledby
 * 8. heading hierarchy gaps (h1 -> h3 skipping h2)
 *
 * Writes GitHub Actions step summary when running in CI.
 */
import { appendFileSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const ROUTES_DIR = join(ROOT, "apps/web/src/routes");
const SRC_DIR = join(ROOT, "apps/web/src");

interface Violation {
  file: string;
  line: number;
  rule: string;
  severity: "error" | "warning";
  message: string;
}

function walk(dir: string, out: string[] = []): string[] {
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
    if (s.isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx") || p.endsWith(".jsx")) out.push(p);
  }
  return out;
}

function getLine(source: string, index: number): number {
  return source.slice(0, index).split("\n").length;
}

const violations: Violation[] = [];

function addViolation(
  file: string,
  source: string,
  index: number,
  rule: string,
  severity: "error" | "warning",
  message: string,
): void {
  violations.push({
    file: relative(ROOT, file),
    line: getLine(source, index),
    rule,
    severity,
    message,
  });
}

// --- Check 1: <img> without alt ---
function checkImgAlt(file: string, source: string): void {
  const imgRe = /<img\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(source))) {
    const attrs = m[1] ?? "";
    if (!/\balt\s*=/.test(attrs)) {
      addViolation(file, source, m.index, "img-alt", "error", "<img> missing alt attribute");
    }
  }
}

// --- Check 2: <button>/<Button> without accessible text ---
function checkButtonText(file: string, source: string): void {
  // Match self-closing buttons or buttons with very short content
  const selfClosingRe = /<(button|Button)\b([^>]*)\/>/gi;
  let m: RegExpExecArray | null;
  while ((m = selfClosingRe.exec(source))) {
    const attrs = m[2] ?? "";
    const hasLabel =
      /\baria-label\s*=/.test(attrs) ||
      /\baria-labelledby\s*=/.test(attrs) ||
      /\btitle\s*=/.test(attrs);
    if (!hasLabel) {
      addViolation(
        file,
        source,
        m.index,
        "button-a11y",
        "error",
        "Self-closing <button>/<Button> without aria-label, aria-labelledby, or title",
      );
    }
  }
}

// --- Check 3: <input> without label ---
function checkInputLabel(file: string, source: string): void {
  // Match native <input> elements (not the custom <Input> component which has label prop)
  const inputRe = /<input\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(source))) {
    const attrs = m[1] ?? "";
    // Skip hidden inputs
    if (/type=["']hidden["']/.test(attrs)) continue;
    const hasLabel =
      /\baria-label\s*=/.test(attrs) ||
      /\baria-labelledby\s*=/.test(attrs) ||
      /\blabel\s*=/.test(attrs) ||
      /\bid\s*=/.test(attrs) ||
      /\btitle\s*=/.test(attrs) ||
      /\bplaceholder\s*=/.test(attrs);
    if (!hasLabel) {
      addViolation(
        file,
        source,
        m.index,
        "input-label",
        "warning",
        "<input> without aria-label, aria-labelledby, id, or placeholder",
      );
    }
  }
}

// --- Check 4: onClick on non-interactive elements (div, span) without role + keyboard ---
function checkClickHandlers(file: string, source: string): void {
  const divClickRe = /<(div|span|section|article|main|header|footer|nav)\b([^>]*\bonClick\b[^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = divClickRe.exec(source))) {
    const attrs = m[2] ?? "";
    const hasRole = /\brole\s*=/.test(attrs);
    const hasKeyboard = /\bonKeyDown\b/.test(attrs) || /\bonKeyPress\b/.test(attrs) || /\bonKeyUp\b/.test(attrs);
    const hasTabIndex = /\btabIndex\s*=/.test(attrs) || /\btabindex\s*=/.test(attrs);
    if (!hasRole) {
      addViolation(
        file,
        source,
        m.index,
        "click-role",
        "warning",
        `<${m[1]}> with onClick but no role attribute. Add role="button" or use a <button>.`,
      );
    }
    if (!hasKeyboard && !hasTabIndex) {
      addViolation(
        file,
        source,
        m.index,
        "click-keyboard",
        "warning",
        `<${m[1]}> with onClick but no keyboard handler (onKeyDown/onKeyPress) or tabIndex`,
      );
    }
  }
}

// --- Check 5: <a>/<A> with empty or missing href ---
function checkLinks(file: string, source: string): void {
  const linkRe = /<(a|A)\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(source))) {
    const attrs = m[2] ?? "";
    // Skip if it has href with a value
    if (/\bhref\s*=\s*["'][^"']+["']/.test(attrs)) continue;
    if (/\bhref\s*=\s*\{[^}]+\}/.test(attrs)) continue;
    // Has onClick? That is a button pretending to be a link
    if (/\bonClick\b/.test(attrs)) {
      addViolation(
        file,
        source,
        m.index,
        "link-button",
        "warning",
        `<${m[1]}> with onClick but no href. Use a <button> instead.`,
      );
    }
  }
}

// --- Check 6: Missing lang on html element ---
function checkLang(file: string, source: string): void {
  // Only check root layout or app files
  if (
    !file.includes("root") &&
    !file.includes("app.tsx") &&
    !file.includes("App.tsx") &&
    !file.includes("entry-server")
  ) {
    return;
  }
  const htmlRe = /<html\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = htmlRe.exec(source))) {
    const attrs = m[1] ?? "";
    if (!/\blang\s*=/.test(attrs)) {
      addViolation(
        file,
        source,
        m.index,
        "html-lang",
        "error",
        '<html> missing lang attribute. Add lang="en" or appropriate locale.',
      );
    }
  }
}

// --- Check 7: <form> without accessible name ---
function checkFormLabel(file: string, source: string): void {
  const formRe = /<form\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = formRe.exec(source))) {
    const attrs = m[1] ?? "";
    const hasLabel =
      /\baria-label\s*=/.test(attrs) ||
      /\baria-labelledby\s*=/.test(attrs) ||
      /\brole\s*=\s*["']search["']/.test(attrs);
    if (!hasLabel) {
      addViolation(
        file,
        source,
        m.index,
        "form-label",
        "warning",
        "<form> without aria-label or aria-labelledby. Screen readers cannot identify the form.",
      );
    }
  }
}

// --- Check 8: Heading hierarchy gaps (e.g. h1 -> h3 skipping h2) ---
function checkHeadingHierarchy(file: string, source: string): void {
  const headingRe = /<(h[1-6])\b/gi;
  const headings: Array<{ level: number; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(source))) {
    const level = Number.parseInt(m[1]![1]!, 10);
    headings.push({ level, index: m.index });
  }
  for (let i = 1; i < headings.length; i++) {
    const prev = headings[i - 1]!;
    const curr = headings[i]!;
    // A heading level can go deeper by at most 1 level (h2 -> h3 is OK, h2 -> h4 is not)
    if (curr.level > prev.level + 1) {
      addViolation(
        file,
        source,
        curr.index,
        "heading-order",
        "warning",
        `Heading level skipped: h${prev.level} -> h${curr.level}. Use h${prev.level + 1} instead.`,
      );
    }
  }
}

/** Write to GitHub Actions step summary if available */
function writeSummary(markdown: string): void {
  const summaryPath = process.env["GITHUB_STEP_SUMMARY"];
  if (summaryPath) {
    appendFileSync(summaryPath, markdown + "\n");
  }
}

// --- Run all checks ---

// Scan route files for a11y issues
const routeFiles = walk(ROUTES_DIR);

// Also scan components and other source files
const allSrcFiles = walk(SRC_DIR);

const filesToCheck = [...new Set([...routeFiles, ...allSrcFiles])];

for (const file of filesToCheck) {
  const source = readFileSync(file, "utf8");
  checkImgAlt(file, source);
  checkButtonText(file, source);
  checkInputLabel(file, source);
  checkClickHandlers(file, source);
  checkLinks(file, source);
  checkLang(file, source);
  checkFormLabel(file, source);
  checkHeadingHierarchy(file, source);
}

// Report
const errors = violations.filter((v) => v.severity === "error");
const warnings = violations.filter((v) => v.severity === "warning");

console.info("=== Accessibility Check ===\n");
console.info(`Scanned ${filesToCheck.length} files.`);
console.info(`Found ${errors.length} error(s) and ${warnings.length} warning(s).\n`);

if (errors.length > 0) {
  console.error("ERRORS (must fix):");
  for (const v of errors) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}] ${v.message}`);
  }
  console.error("");
}

if (warnings.length > 0) {
  console.info("WARNINGS (should fix):");
  for (const w of warnings) {
    console.info(`  ${w.file}:${w.line}  [${w.rule}] ${w.message}`);
  }
  console.info("");
}

if (errors.length === 0 && warnings.length === 0) {
  console.info("OK: No accessibility violations found.");
}

// --- GitHub Actions Step Summary ---
const summaryLines: string[] = [];
summaryLines.push("## Accessibility Check");
summaryLines.push("");
summaryLines.push(`Scanned **${filesToCheck.length}** files.`);
summaryLines.push("");

// Group violations by rule for summary table
const ruleCount = new Map<string, { errors: number; warnings: number }>();
for (const v of violations) {
  const entry = ruleCount.get(v.rule) ?? { errors: 0, warnings: 0 };
  if (v.severity === "error") entry.errors++;
  else entry.warnings++;
  ruleCount.set(v.rule, entry);
}

if (ruleCount.size > 0) {
  summaryLines.push("| Rule | Errors | Warnings |");
  summaryLines.push("|------|--------|----------|");
  for (const [rule, counts] of ruleCount) {
    summaryLines.push(`| \`${rule}\` | ${counts.errors} | ${counts.warnings} |`);
  }
  summaryLines.push("");
}

if (violations.length > 0) {
  summaryLines.push("<details><summary>All violations</summary>");
  summaryLines.push("");
  summaryLines.push("| Severity | File | Line | Rule | Message |");
  summaryLines.push("|----------|------|------|------|---------|");
  for (const v of violations.slice(0, 50)) {
    const icon = v.severity === "error" ? "ERROR" : "WARN";
    summaryLines.push(`| ${icon} | \`${v.file}\` | ${v.line} | \`${v.rule}\` | ${v.message} |`);
  }
  if (violations.length > 50) {
    summaryLines.push(`| ... | ... | ... | ... | ${violations.length - 50} more violations |`);
  }
  summaryLines.push("");
  summaryLines.push("</details>");
  summaryLines.push("");
}

if (errors.length > 0) {
  summaryLines.push(
    `> **FAIL:** ${errors.length} error(s) found. These must be fixed before merging.`,
  );
} else if (warnings.length > 0) {
  summaryLines.push(
    `> **PASS with warnings:** ${warnings.length} warning(s) found. Consider fixing.`,
  );
} else {
  summaryLines.push("> **PASS:** No accessibility violations found.");
}

writeSummary(summaryLines.join("\n"));

// Exit with error code only for critical violations
if (errors.length > 0) {
  process.exit(1);
}

process.exit(0);
