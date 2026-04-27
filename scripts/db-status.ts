#!/usr/bin/env bun
// ── db:status — migration state CLI (BLK-026) ──────────────────────
// Prints a colorized table of every journal migration plus its
// applied/pending status, driven by `getMigrationStatus()`. Connects
// to the same database that `drizzle-kit` / `runMigrations()` would
// use (DATABASE_URL, falling back to the repo-local SQLite file).
//
// Exit codes:
//   0 — filesystem and DB agree (no drift, no pending migrations)
//   1 — drift detected in either direction, or pending migrations exist
//
// Usage:
//   bun run db:status
//   DATABASE_URL=file:./my.db bun run db:status

import { createClient } from "../packages/db/src/client";
import { getMigrationStatus, type Migration } from "../packages/db/src/migration-status";

// ── ANSI colors (no dependency) ────────────────────────────────────

const USE_COLOR = process.stdout.isTTY === true && process.env["NO_COLOR"] !== "1";
const esc = (code: string, text: string): string =>
  USE_COLOR ? `\x1b[${code}m${text}\x1b[0m` : text;
const green = (s: string) => esc("32", s);
const yellow = (s: string) => esc("33", s);
const red = (s: string) => esc("31", s);
const dim = (s: string) => esc("2", s);
const bold = (s: string) => esc("1", s);

// ── Formatting helpers ─────────────────────────────────────────────

function pad(input: string, width: number): string {
  if (input.length >= width) return input;
  return input + " ".repeat(width - input.length);
}

function formatDate(ms: number | null): string {
  if (ms === null) return dim("—");
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatRow(migration: Migration, applied: boolean): string {
  const idx = pad(String(migration.idx).padStart(2, "0"), 3);
  const file = pad(migration.file, 42);
  const status = applied
    ? green("\u2713 applied")
    : yellow("\u29D7 pending");
  const statusPadded = pad(status, USE_COLOR ? 20 : 10);
  const date = formatDate(migration.appliedAt);
  return `${idx} ${file} ${statusPadded} ${date}`;
}

// ── Entry point ────────────────────────────────────────────────────

async function main(): Promise<number> {
  const url = process.env["DATABASE_URL"] ?? "file:packages/db/local.db";
  const authToken = process.env["DATABASE_AUTH_TOKEN"];
  const db = createClient(url, authToken);

  const status = await getMigrationStatus(db);

  // ── Header ──────────────────────────────────────────────────────
  console.info(bold("Crontech migration status"));
  console.info(dim(`database: ${url}`));
  console.info(dim(`migrations: ${status.migrationsFolder}`));
  console.info();

  console.info(bold(`${pad("#", 3)} ${pad("file", 42)} ${pad("status", 10)} applied_at`));
  console.info(dim("-".repeat(80)));

  // ── Rows, in journal order ──────────────────────────────────────
  for (const m of status.applied) {
    console.info(formatRow(m, true));
  }
  for (const m of status.pending) {
    console.info(formatRow(m, false));
  }

  // ── Summary ─────────────────────────────────────────────────────
  console.info();
  console.info(
    `${bold("summary:")} ${green(`${status.applied.length} applied`)}, ${yellow(
      `${status.pending.length} pending`,
    )}`,
  );

  if (status.driftInDatabase.length > 0) {
    console.info();
    console.info(
      red(
        `DRIFT: ${status.driftInDatabase.length} migration(s) exist in the database with no matching file on disk.`,
      ),
    );
    console.info(
      dim(
        "  This means an already-applied migration has been rewritten or deleted — a destructive doctrine breach (CLAUDE.md §0.4.1).",
      ),
    );
    for (const orphan of status.driftInDatabase) {
      console.info(red(`  - hash=${orphan.hash.slice(0, 12)}… applied_at=${formatDate(orphan.appliedAt)}`));
    }
  }

  if (status.inSync) {
    console.info();
    console.info(green(bold("in sync")));
    return 0;
  }

  console.info();
  console.info(red(bold("drift detected")));
  return 1;
}

const code = await main().catch((err: unknown) => {
  console.error("[db:status] Failed:", err);
  return 1;
});
process.exit(code);
