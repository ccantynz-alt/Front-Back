// ── Migration Status (BLK-026) ──────────────────────────────────────
// Programmatic view into Crontech's Drizzle migration state. Combines
// two sources of truth and reconciles them:
//   1. The filesystem migrations directory (`packages/db/migrations/`),
//      indexed by `meta/_journal.json` — this is what the current
//      codebase *expects* to be applied.
//   2. The `__drizzle_migrations` table inside the live database —
//      this is what has *actually* been applied on that DB so far.
//
// The Drizzle libsql migrator keys applied migrations by the SHA-256
// hash of the migration file's full text contents (see
// `drizzle-orm/migrator.js` → `readMigrationFiles()`). We mirror that
// hashing logic here so we can match filesystem entries to DB rows
// without touching Drizzle internals.
//
// Drift is reported in two directions:
//   * `driftOnFilesystem` — files referenced by the journal but
//     absent from the DB (i.e. pending migrations).
//   * `driftInDatabase`   — hashes present in the DB that no longer
//     match any file on disk (i.e. someone rewrote or deleted an
//     already-applied migration — a destructive doctrine breach).

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sql } from "drizzle-orm";

// ── Types ───────────────────────────────────────────────────────────

/**
 * One migration as seen through the dual filesystem + DB lens.
 *
 * `idx`, `tag`, `file`, and `hash` come from the filesystem journal.
 * `appliedAt` is populated from `__drizzle_migrations.created_at`
 * when the hash is present in the DB; `null` when the migration is
 * still pending.
 */
export interface Migration {
  /** Zero-based index from `meta/_journal.json`. */
  idx: number;
  /** Journal tag (e.g. `0001_tenant_projects`). */
  tag: string;
  /** Migration filename (e.g. `0001_tenant_projects.sql`). */
  file: string;
  /** SHA-256 of the migration file contents — matches Drizzle's hash. */
  hash: string;
  /** Unix-ms timestamp from the journal's `when` field. */
  journalWhen: number;
  /** Unix-ms timestamp when the DB row was written; `null` if pending. */
  appliedAt: number | null;
}

/** Orphan hash in the DB with no corresponding file on disk. */
export interface DbOnlyMigration {
  hash: string;
  appliedAt: number;
}

export interface MigrationStatus {
  /** Migrations present in both the journal and the DB, in journal order. */
  applied: Migration[];
  /** Migrations in the journal but not yet in the DB, in journal order. */
  pending: Migration[];
  /** Most recent applied migration (by `appliedAt`), or `null`. */
  lastApplied: Migration | null;
  /** Pending migrations — "filesystem ahead of DB". */
  driftOnFilesystem: Migration[];
  /** DB rows with no matching filesystem entry — "DB ahead of filesystem". */
  driftInDatabase: DbOnlyMigration[];
  /** True iff both drift lists are empty. */
  inSync: boolean;
  /** Absolute path to the migrations folder the status was read from. */
  migrationsFolder: string;
}

// ── Constants ───────────────────────────────────────────────────────

/**
 * Default migrations folder relative to this file.
 * `packages/db/src/migration-status.ts` → `packages/db/migrations`.
 */
export const DEFAULT_MIGRATIONS_FOLDER = resolve(import.meta.dir, "..", "migrations");

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface JournalFile {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

interface DrizzleMigrationRow {
  hash: string;
  created_at: number;
}

// ── Filesystem ──────────────────────────────────────────────────────

/**
 * Read `meta/_journal.json` and hash every referenced migration file
 * the same way Drizzle's libsql migrator does (SHA-256 of raw UTF-8
 * file contents). Throws if the journal is missing or references a
 * file that does not exist on disk.
 */
export function readFilesystemMigrations(
  migrationsFolder: string = DEFAULT_MIGRATIONS_FOLDER,
): Migration[] {
  const journalPath = resolve(migrationsFolder, "meta", "_journal.json");
  if (!existsSync(journalPath)) {
    throw new Error(`Cannot find meta/_journal.json at ${journalPath}`);
  }

  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as JournalFile;

  return journal.entries.map((entry) => {
    const file = `${entry.tag}.sql`;
    const sqlPath = resolve(migrationsFolder, file);
    if (!existsSync(sqlPath)) {
      throw new Error(`Journal references ${file} but file does not exist at ${sqlPath}`);
    }
    const contents = readFileSync(sqlPath, "utf8");
    const hash = createHash("sha256").update(contents).digest("hex");
    return {
      idx: entry.idx,
      tag: entry.tag,
      file,
      hash,
      journalWhen: entry.when,
      appliedAt: null,
    };
  });
}

// ── Database ────────────────────────────────────────────────────────

/**
 * Narrow shape of the Drizzle client that `getMigrationStatus` needs.
 * Accepting a structural type (instead of the concrete
 * `LibSQLDatabase`) keeps this module easy to mock in tests.
 *
 * Drizzle's `LibSQLDatabase.all<T>(sql)` returns the result rows as
 * `T[]` — we match that signature here.
 */
export interface MigrationStatusDb {
  all: <T = unknown>(query: ReturnType<typeof sql>) => Promise<T[]>;
}

/**
 * Query the `__drizzle_migrations` table directly. Returns an empty
 * array if the table does not exist yet (fresh DB, never migrated).
 */
export async function readAppliedMigrations(
  db: MigrationStatusDb,
): Promise<DrizzleMigrationRow[]> {
  // Probe for the table first so we don't log a scary error on fresh DBs.
  const probe = await db.all<{ name: string }>(
    sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'`,
  );
  if (probe.length === 0) {
    return [];
  }

  const rows = await db.all<Record<string, unknown>>(
    sql`SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at ASC`,
  );

  return rows.map((row) => {
    const hash = typeof row["hash"] === "string" ? row["hash"] : String(row["hash"]);
    const rawCreatedAt = row["created_at"];
    const createdAt =
      typeof rawCreatedAt === "number"
        ? rawCreatedAt
        : typeof rawCreatedAt === "bigint"
          ? Number(rawCreatedAt)
          : Number(rawCreatedAt);
    return { hash, created_at: createdAt };
  });
}

// ── Reconciliation ──────────────────────────────────────────────────

/**
 * Produce a full migration status report for the given Drizzle DB.
 *
 * Callers may pass a custom migrations folder — defaults to the
 * co-located `packages/db/migrations` directory.
 */
export async function getMigrationStatus(
  db: MigrationStatusDb,
  migrationsFolder: string = DEFAULT_MIGRATIONS_FOLDER,
): Promise<MigrationStatus> {
  const filesystem = readFilesystemMigrations(migrationsFolder);
  const dbRows = await readAppliedMigrations(db);

  const appliedByHash = new Map<string, DrizzleMigrationRow>();
  for (const row of dbRows) {
    appliedByHash.set(row.hash, row);
  }

  const applied: Migration[] = [];
  const pending: Migration[] = [];
  const fsHashes = new Set<string>();

  for (const fs of filesystem) {
    fsHashes.add(fs.hash);
    const match = appliedByHash.get(fs.hash);
    if (match) {
      applied.push({ ...fs, appliedAt: match.created_at });
    } else {
      pending.push(fs);
    }
  }

  const driftInDatabase: DbOnlyMigration[] = dbRows
    .filter((row) => !fsHashes.has(row.hash))
    .map((row) => ({ hash: row.hash, appliedAt: row.created_at }));

  const lastApplied =
    applied.length === 0
      ? null
      : applied.reduce((best, m) =>
          (m.appliedAt ?? 0) > (best.appliedAt ?? 0) ? m : best,
        );

  const driftOnFilesystem = pending;
  const inSync = driftOnFilesystem.length === 0 && driftInDatabase.length === 0;

  return {
    applied,
    pending,
    lastApplied,
    driftOnFilesystem,
    driftInDatabase,
    inSync,
    migrationsFolder,
  };
}
