// Test preload — wipes and recreates the local DB before tests run.
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { runMigrations } from "./migrate";

const DB_PATH = resolve(import.meta.dir, "..", "local.db");

if (existsSync(DB_PATH)) {
  rmSync(DB_PATH);
}

await runMigrations(`file:${DB_PATH}`);
