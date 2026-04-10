// Test preload — runs ONCE before any test file loads.
// Wipes and recreates apps/api/local.db via drizzle migrations so every
// test run starts from a known-good schema. Prevents stale-DB drift from
// breaking the suite.

import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { runMigrations } from "@back-to-the-future/db/migrate";

const DB_PATH = resolve(import.meta.dir, "..", "local.db");

if (existsSync(DB_PATH)) {
  rmSync(DB_PATH);
}

await runMigrations(`file:${DB_PATH}`);
