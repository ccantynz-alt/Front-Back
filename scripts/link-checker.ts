#!/usr/bin/env bun
/**
 * Link checker: scans apps/web/src/routes/**.tsx for <A href> / <a href>
 * internal links and verifies each points to an existing route.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const ROUTES_DIR = join(ROOT, "apps/web/src/routes");
const SRC_DIR = join(ROOT, "apps/web/src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) out.push(p);
  }
  return out;
}

function routeFromFile(file: string): string {
  const rel = relative(ROUTES_DIR, file).replace(/\\/g, "/").replace(/\.tsx$/, "");
  if (rel === "index") return "/";
  if (rel.endsWith("/index")) return "/" + rel.slice(0, -"/index".length);
  // catch-all
  if (/\[\.\.\..*\]/.test(rel)) return "__catchall__";
  return "/" + rel;
}

const routeFiles = walk(ROUTES_DIR);
const routes = new Set<string>();
let hasCatchAll = false;
for (const f of routeFiles) {
  const r = routeFromFile(f);
  if (r === "__catchall__") hasCatchAll = true;
  else routes.add(r);
}

// Extract links from all src files
const srcFiles = walk(SRC_DIR);
const linkRe = /<(?:A|a)\s+[^>]*href=["'`]([^"'`]+)["'`]/g;

type Finding = { file: string; href: string };
const dead: Finding[] = [];
const seen = new Set<string>();

for (const file of srcFiles) {
  const src = readFileSync(file, "utf8");
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(src))) {
    const href = m[1];
    if (!href || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#") || href.startsWith("{")) continue;
    const path = href.split("?")[0].split("#")[0];
    const key = `${file}::${path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!routes.has(path)) {
      if (hasCatchAll) {
        // still flag — intent is existence of a real route
      }
      dead.push({ file: relative(ROOT, file), href: path });
    }
  }
}

console.info(`Scanned ${srcFiles.length} files. Found ${routes.size} routes.`);
if (dead.length === 0) {
  console.info("OK: no dead links.");
  process.exit(0);
}
console.error(`DEAD LINKS (${dead.length}):`);
for (const d of dead) console.error(`  ${d.file} -> ${d.href}`);
process.exit(1);
