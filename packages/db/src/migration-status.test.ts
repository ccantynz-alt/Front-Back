// ── Migration Status Tests (BLK-026) ────────────────────────────────
// Covers both the filesystem + DB readers in `migration-status.ts`
// and the SQL-linting logic in `scripts/db-validate.ts`. The test
// preload (`./test-setup.ts`) wipes and re-migrates the local DB
// before the suite runs, so `getMigrationStatus` against `db` is
// guaranteed to see every journal entry as `applied` on a clean run.

// Preload is normally wired via `packages/db/bunfig.toml` for
// `bun test` invocations run from within this package. When the suite
// is executed from the repo root (e.g. `bun test packages/db/src/...`)
// bun picks up the root bunfig, not the package one, so we explicitly
// pin DATABASE_URL to the absolute path that test-setup provisions
// before importing `./client` (which reads DATABASE_URL eagerly).
import { resolve as resolvePath } from "node:path";
process.env["DATABASE_URL"] = `file:${resolvePath(import.meta.dir, "..", "local.db")}`;
import "./test-setup";

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { db } from "./client";
import {
  DEFAULT_MIGRATIONS_FOLDER,
  getMigrationStatus,
  readAppliedMigrations,
  readFilesystemMigrations,
} from "./migration-status";

import { lintMigrationFile, type LintFinding } from "./migration-lint";

// ── Filesystem reader ───────────────────────────────────────────────

describe("readFilesystemMigrations", () => {
  test("reads every journal entry with a stable hash", () => {
    const migrations = readFilesystemMigrations();
    expect(migrations.length).toBeGreaterThan(0);
    // Every journal entry has exactly one matching file + 64-hex sha256.
    for (const m of migrations) {
      expect(m.file).toBe(`${m.tag}.sql`);
      expect(m.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(m.appliedAt).toBeNull();
    }
    // Indices are contiguous, zero-based.
    for (let i = 0; i < migrations.length; i++) {
      expect(migrations[i]?.idx).toBe(i);
    }
  });

  test("throws when the journal is missing", () => {
    const empty = mkdtempSync(join(tmpdir(), "migrations-"));
    try {
      expect(() => readFilesystemMigrations(empty)).toThrow(/meta\/_journal\.json/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

// ── DB reader ───────────────────────────────────────────────────────

describe("readAppliedMigrations", () => {
  test("returns zero rows when __drizzle_migrations is absent", async () => {
    const stub = {
      all: async <T,>(query: ReturnType<typeof sql>): Promise<T[]> => {
        // Return an empty probe result for the sqlite_master lookup.
        // If the production code calls past the probe when it should
        // have short-circuited, the test fails loudly.
        const text = JSON.stringify(query);
        if (text.includes("sqlite_master")) {
          return [] as T[];
        }
        throw new Error("readAppliedMigrations probed past the sqlite_master check");
      },
    };
    const rows = await readAppliedMigrations(stub);
    expect(rows).toEqual([]);
  });

  test("reads hash + created_at from the live DB", async () => {
    const rows = await readAppliedMigrations(db);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(typeof row.created_at).toBe("number");
      expect(Number.isFinite(row.created_at)).toBe(true);
    }
  });
});

// ── End-to-end status ───────────────────────────────────────────────

describe("getMigrationStatus", () => {
  test("reports the live DB as fully in-sync after test-setup", async () => {
    const status = await getMigrationStatus(db);
    expect(status.migrationsFolder).toBe(DEFAULT_MIGRATIONS_FOLDER);
    expect(status.pending).toEqual([]);
    expect(status.driftOnFilesystem).toEqual([]);
    expect(status.driftInDatabase).toEqual([]);
    expect(status.inSync).toBe(true);
    expect(status.applied.length).toBeGreaterThan(0);
    expect(status.lastApplied).not.toBeNull();
    expect(status.lastApplied?.appliedAt).toBeGreaterThan(0);
  });

  test("flags DB rows with no filesystem match as driftInDatabase", async () => {
    const ghostHash = "0".repeat(64);
    const stub = {
      all: async <T,>(query: ReturnType<typeof sql>): Promise<T[]> => {
        const text = JSON.stringify(query);
        if (text.includes("sqlite_master")) {
          return [{ name: "__drizzle_migrations" }] as T[];
        }
        return [{ hash: ghostHash, created_at: 1_700_000_000_000 }] as T[];
      },
    };
    const status = await getMigrationStatus(stub);
    expect(status.driftInDatabase).toEqual([
      { hash: ghostHash, appliedAt: 1_700_000_000_000 },
    ]);
    expect(status.applied).toEqual([]);
    // Every filesystem migration is unapplied from the ghost DB's POV.
    expect(status.pending.length).toBe(status.driftOnFilesystem.length);
    expect(status.pending.length).toBeGreaterThan(0);
    expect(status.inSync).toBe(false);
  });

  test("reports pending migrations when the DB is empty", async () => {
    const stub = {
      all: async <T,>(): Promise<T[]> => [] as T[],
    };
    const status = await getMigrationStatus(stub);
    expect(status.applied).toEqual([]);
    expect(status.lastApplied).toBeNull();
    expect(status.pending.length).toBeGreaterThan(0);
    expect(status.driftOnFilesystem.length).toBe(status.pending.length);
    expect(status.driftInDatabase).toEqual([]);
    expect(status.inSync).toBe(false);
  });
});

// ── Static linter ──────────────────────────────────────────────────

describe("lintMigrationFile", () => {
  function findings(sqlText: string): LintFinding[] {
    return lintMigrationFile("test.sql", sqlText);
  }

  test("accepts a well-formed migration", () => {
    const ok = `CREATE TABLE IF NOT EXISTS foo (id text PRIMARY KEY);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS foo_idx ON foo (id);
`;
    expect(findings(ok)).toEqual([]);
  });

  test("flags missing --> statement-breakpoint", () => {
    const bad = `CREATE TABLE IF NOT EXISTS foo (id text PRIMARY KEY);
CREATE INDEX IF NOT EXISTS foo_idx ON foo (id);
`;
    const out = findings(bad);
    expect(out.some((f) => f.rule === "missing-breakpoint" && f.severity === "error")).toBe(
      true,
    );
  });

  test("flags CREATE TABLE without IF NOT EXISTS", () => {
    const bad = `CREATE TABLE foo (id text PRIMARY KEY);`;
    const out = findings(bad);
    expect(out.some((f) => f.rule === "missing-if-not-exists-table")).toBe(true);
  });

  test("flags CREATE INDEX without IF NOT EXISTS", () => {
    const bad = `CREATE INDEX foo_idx ON foo (id);`;
    const out = findings(bad);
    expect(out.some((f) => f.rule === "missing-if-not-exists-index")).toBe(true);
  });

  test("warns on destructive DROP TABLE without blocking", () => {
    const risky = `DROP TABLE foo;`;
    const out = findings(risky);
    const destructive = out.filter((f) => f.rule === "destructive-op");
    expect(destructive.length).toBeGreaterThan(0);
    // Destructive ops are warnings, never errors — they may be intentional.
    for (const f of destructive) {
      expect(f.severity).toBe("warn");
    }
  });

  test("warns on DROP COLUMN and ALTER COLUMN TYPE", () => {
    const risky = `ALTER TABLE foo DROP COLUMN bar;
--> statement-breakpoint
ALTER TABLE foo ALTER COLUMN baz TYPE text;
`;
    const out = findings(risky);
    const warns = out.filter((f) => f.rule === "destructive-op");
    expect(warns.length).toBeGreaterThanOrEqual(2);
  });

  test("ignores comments and blank lines when counting breakpoints", () => {
    const ok = `-- first statement
CREATE TABLE IF NOT EXISTS foo (id text PRIMARY KEY);
--> statement-breakpoint
-- second statement
CREATE TABLE IF NOT EXISTS bar (id text PRIMARY KEY);
`;
    expect(findings(ok)).toEqual([]);
  });
});

// ── CLI smoke (writes to temp, doesn't touch real files) ────────────

describe("lintMigrationFile over the real migrations directory", () => {
  test("every shipped migration is non-fatal (zero errors)", () => {
    const migrations = readFilesystemMigrations();
    // We do not assert "zero warnings" — destructive ops and other
    // advisory findings are allowed to exist in shipped migrations.
    // What we DO assert is that none of them break the hard rules
    // (missing breakpoint, CREATE TABLE without IF NOT EXISTS, etc).
    for (const m of migrations) {
      const path = join(DEFAULT_MIGRATIONS_FOLDER, m.file);
      const contents = Bun.file(path);
      // Bun.file returns a BunFile; sync read via readFileSync is fine too.
      // Using the filesystem reader for consistency:
      const text = require("node:fs").readFileSync(path, "utf8") as string;
      const errs = lintMigrationFile(m.file, text).filter((f) => f.severity === "error");
      if (errs.length > 0) {
        throw new Error(
          `Migration ${m.file} has ${errs.length} lint error(s): ${errs
            .map((e) => e.rule)
            .join(", ")}`,
        );
      }
      // Silence unused-variable linter if the BunFile reference is not used elsewhere.
      void contents;
    }
  });

  test("writing a deliberately-broken migration triggers errors", () => {
    const tmp = mkdtempSync(join(tmpdir(), "bad-migration-"));
    const broken = join(tmp, "9999_bad.sql");
    try {
      writeFileSync(
        broken,
        `CREATE TABLE foo (id text PRIMARY KEY);
CREATE INDEX foo_idx ON foo (id);
`,
      );
      const text = require("node:fs").readFileSync(broken, "utf8") as string;
      const out = lintMigrationFile(broken, text);
      const rules = new Set(out.map((f) => f.rule));
      expect(rules.has("missing-breakpoint")).toBe(true);
      expect(rules.has("missing-if-not-exists-table")).toBe(true);
      expect(rules.has("missing-if-not-exists-index")).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
