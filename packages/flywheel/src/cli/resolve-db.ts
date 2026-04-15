// Ensures DATABASE_URL resolves to the repo-root local.db regardless of
// which CWD the CLI is launched from. MUST be imported before any import
// that touches `@back-to-the-future/db`, because the db client reads
// DATABASE_URL at module-load time.

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function findRepoRoot(start: string): string | null {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, "turbo.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

const existing = process.env["DATABASE_URL"];
if (!existing || existing === "file:local.db") {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = findRepoRoot(here);
  if (root) {
    process.env["DATABASE_URL"] = `file:${resolve(root, "local.db")}`;
  }
}
