#!/usr/bin/env bun
/**
 * Button checker: every <Button> / <button> must have onClick, type="submit",
 * be `as={A}` (link button), be disabled, or be inside a form with onSubmit.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "apps/web/src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const files = walk(SRC);
// Match opening <Button ...> or <button ...> up to its >
const btnRe = /<(Button|button)\b([^>]*)>/g;
const formRe = /<form\b([^>]*)>([\s\S]*?)<\/form>/g;

type Finding = { file: string; line: number; snippet: string };
const dead: Finding[] = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");

  // Collect <A href=...>...</A> and <a href=...>...</a> ranges — buttons inside are link buttons
  const linkRanges: Array<[number, number]> = [];
  const linkRe = /<(?:A|a)\s+[^>]*href=[^>]*>([\s\S]*?)<\/(?:A|a)>/g;
  let lm: RegExpExecArray | null;
  while ((lm = linkRe.exec(src))) {
    linkRanges.push([lm.index, lm.index + lm[0].length]);
  }

  // Collect form ranges with onSubmit
  const formRanges: Array<[number, number]> = [];
  let fm: RegExpExecArray | null;
  const formScan = new RegExp(formRe.source, "g");
  while ((fm = formScan.exec(src))) {
    if (/onSubmit/.test(fm[1] ?? "")) {
      formRanges.push([fm.index, fm.index + fm[0].length]);
    }
  }
  const inForm = (idx: number) => formRanges.some(([a, b]) => idx >= a && idx <= b);

  let m: RegExpExecArray | null;
  const scan = new RegExp(btnRe.source, "g");
  while ((m = scan.exec(src))) {
    const attrs = m[2] ?? "";
    const ok =
      /\bonClick\b/.test(attrs) ||
      /\bonclick\b/.test(attrs) ||
      /type=["']submit["']/.test(attrs) ||
      /\bdisabled\b/.test(attrs) ||
      /\bas=\{?A\}?/.test(attrs) ||
      /\bhref=/.test(attrs) ||
      /\{\.\.\./.test(attrs); // spread props
    if (ok) continue;
    if (inForm(m.index)) continue;
    if (linkRanges.some(([a, b]) => m!.index >= a && m!.index <= b)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    dead.push({ file: relative(ROOT, file), line, snippet: m[0].slice(0, 120) });
  }
}

console.log(`Scanned ${files.length} files.`);
if (dead.length === 0) {
  console.log("OK: no dead buttons.");
  process.exit(0);
}
console.error(`DEAD BUTTONS (${dead.length}):`);
for (const d of dead) console.error(`  ${d.file}:${d.line}  ${d.snippet}`);
process.exit(1);
