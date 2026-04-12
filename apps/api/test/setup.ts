// Test preload — runs ONCE before any test file loads.
// Wipes and recreates the test DB via drizzle migrations so every test run
// starts from a known-good schema. We set DATABASE_URL to an absolute path
// BEFORE any module can import the db singleton, guaranteeing that the
// singleton, the migration, and all test code hit the same file.

import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { runMigrations } from "@back-to-the-future/db/migrate";

// Compute an absolute path and inject it so the db singleton (which reads
// DATABASE_URL at module evaluation time) points at our test DB.
const DB_PATH = resolve(import.meta.dir, "..", "local.db");
process.env["DATABASE_URL"] = `file:${DB_PATH}`;

if (existsSync(DB_PATH)) {
  rmSync(DB_PATH);
}

await runMigrations(`file:${DB_PATH}`);
