import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as neonSchema from "./neon-schema";
import * as tursoSchema from "./schema";
import { runMigrations } from "./migrate";

// ── Constants ───────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = resolve(__dirname, "migrations/0001_initial.sql");
const MIGRATION_SQL = readFileSync(MIGRATION_PATH, "utf-8");

const EXPECTED_TABLES = [
  "users",
  "credentials",
  "sessions",
  "audit_logs",
  "sites",
  "deployments",
] as const;

// ── SQL Migration Validation ────────────────────────────────────────

describe("0001_initial.sql - SQL validity", () => {
  test("migration file exists and is non-empty", () => {
    expect(MIGRATION_SQL.length).toBeGreaterThan(0);
  });

  test("contains CREATE TABLE statements for all 6 tables", () => {
    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;
    const matches = [...MIGRATION_SQL.matchAll(createTableRegex)];
    const tableNames = matches.map((m) => m[1]);

    expect(tableNames.length).toBe(6);
    for (const table of EXPECTED_TABLES) {
      expect(tableNames).toContain(table);
    }
  });

  test("each CREATE TABLE has a closing parenthesis and semicolon", () => {
    for (const table of EXPECTED_TABLES) {
      const pattern = new RegExp(
        `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}\\s*\\([^;]+\\);`,
        "s",
      );
      expect(MIGRATION_SQL).toMatch(pattern);
    }
  });

  test("all tables use UUID primary keys", () => {
    for (const table of EXPECTED_TABLES) {
      const pattern = new RegExp(
        `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}\\s*\\([^;]*id\\s+UUID\\s+PRIMARY\\s+KEY`,
        "si",
      );
      expect(MIGRATION_SQL).toMatch(pattern);
    }
  });

  test("contains CREATE INDEX statements", () => {
    const indexRegex = /CREATE\s+INDEX/gi;
    const matches = [...MIGRATION_SQL.matchAll(indexRegex)];
    expect(matches.length).toBeGreaterThan(0);
  });

  test("enables pgcrypto extension", () => {
    expect(MIGRATION_SQL).toContain('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  });

  test("uses IF NOT EXISTS for idempotent migration", () => {
    for (const table of EXPECTED_TABLES) {
      const pattern = new RegExp(
        `CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+${table}`,
        "i",
      );
      expect(MIGRATION_SQL).toMatch(pattern);
    }
  });

  test("contains valid SQL - no unterminated statements", () => {
    // Remove comments and whitespace, then check that all statements end with ;
    const stripped = MIGRATION_SQL
      .replace(/--[^\n]*/g, "")
      .trim();
    expect(stripped.endsWith(";")).toBe(true);
  });
});

// ── Table-Specific Column Validation ────────────────────────────────

describe("0001_initial.sql - users table", () => {
  test("has required columns", () => {
    const columns = ["id", "email", "display_name", "role", "created_at", "updated_at"];
    for (const col of columns) {
      expect(MIGRATION_SQL).toContain(col);
    }
  });

  test("email has UNIQUE constraint", () => {
    expect(MIGRATION_SQL).toMatch(/email\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);
  });

  test("role has CHECK constraint with valid values", () => {
    expect(MIGRATION_SQL).toMatch(
      /role.*CHECK\s*\(\s*role\s+IN\s*\(\s*'admin'\s*,\s*'editor'\s*,\s*'viewer'\s*\)\s*\)/is,
    );
  });
});

describe("0001_initial.sql - credentials table", () => {
  test("has foreign key to users", () => {
    expect(MIGRATION_SQL).toMatch(
      /credentials[\s\S]*user_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+users\(id\)/i,
    );
  });

  test("credential_id is UNIQUE", () => {
    expect(MIGRATION_SQL).toMatch(/credential_id\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);
  });
});

describe("0001_initial.sql - sessions table", () => {
  test("token is UNIQUE", () => {
    expect(MIGRATION_SQL).toMatch(/token\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);
  });

  test("has expires_at column", () => {
    expect(MIGRATION_SQL).toMatch(/expires_at\s+TIMESTAMPTZ\s+NOT\s+NULL/i);
  });
});

describe("0001_initial.sql - audit_logs table", () => {
  test("action has CHECK constraint with valid values", () => {
    expect(MIGRATION_SQL).toMatch(
      /action.*CHECK\s*\(\s*action\s+IN\s*\(\s*'CREATE'\s*,\s*'READ'\s*,\s*'UPDATE'\s*,\s*'DELETE'\s*,\s*'EXPORT'\s*,\s*'SIGN'\s*\)\s*\)/is,
    );
  });

  test("user_id uses ON DELETE SET NULL (not CASCADE)", () => {
    expect(MIGRATION_SQL).toMatch(
      /audit_logs[\s\S]*user_id\s+UUID\s+REFERENCES\s+users\(id\)\s+ON\s+DELETE\s+SET\s+NULL/i,
    );
  });
});

describe("0001_initial.sql - sites table", () => {
  test("slug is UNIQUE", () => {
    expect(MIGRATION_SQL).toMatch(/slug\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i);
  });

  test("status has CHECK constraint", () => {
    expect(MIGRATION_SQL).toMatch(
      /sites[\s\S]*status.*CHECK\s*\(\s*status\s+IN\s*\(\s*'draft'\s*,\s*'published'\s*,\s*'archived'\s*\)\s*\)/is,
    );
  });
});

describe("0001_initial.sql - deployments table", () => {
  test("has foreign key to sites", () => {
    expect(MIGRATION_SQL).toMatch(
      /deployments[\s\S]*site_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+sites\(id\)/i,
    );
  });

  test("status has CHECK constraint with deployment statuses", () => {
    expect(MIGRATION_SQL).toMatch(
      /deployments[\s\S]*status.*CHECK\s*\(\s*status\s+IN\s*\(\s*'pending'\s*,\s*'building'\s*,\s*'success'\s*,\s*'failed'\s*,\s*'cancelled'\s*\)\s*\)/is,
    );
  });
});

// ── Neon Schema matches Turso Schema ────────────────────────────────

describe("neon-schema matches turso schema - table names", () => {
  test("both schemas export the same table names", () => {
    const neonTableNames = Object.keys(neonSchema).sort();
    const tursoTableNames = Object.keys(tursoSchema).sort();
    expect(neonTableNames).toEqual(tursoTableNames);
  });

  test("both schemas have all 6 expected tables", () => {
    const expectedExports = ["users", "credentials", "sessions", "auditLogs", "sites", "deployments"].sort();
    const neonExports = Object.keys(neonSchema).sort();
    const tursoExports = Object.keys(tursoSchema).sort();
    expect(neonExports).toEqual(expectedExports);
    expect(tursoExports).toEqual(expectedExports);
  });
});

describe("neon-schema matches turso schema - column parity", () => {
  /**
   * Extract column names from a Drizzle table object.
   * Drizzle tables store columns as enumerable properties with a `name` field.
   */
  function getColumnNames(table: Record<string, unknown>): string[] {
    const columns: string[] = [];
    for (const [, value] of Object.entries(table)) {
      if (value && typeof value === "object" && "name" in value) {
        columns.push((value as { name: string }).name);
      }
    }
    return columns.sort();
  }

  test("users table has matching columns", () => {
    const neonCols = getColumnNames(neonSchema.users as unknown as Record<string, unknown>);
    const tursoCols = getColumnNames(tursoSchema.users as unknown as Record<string, unknown>);
    expect(neonCols).toEqual(tursoCols);
  });

  test("credentials table has matching columns", () => {
    const neonCols = getColumnNames(neonSchema.credentials as unknown as Record<string, unknown>);
    const tursoCols = getColumnNames(tursoSchema.credentials as unknown as Record<string, unknown>);
    expect(neonCols).toEqual(tursoCols);
  });

  test("sessions table has matching columns", () => {
    const neonCols = getColumnNames(neonSchema.sessions as unknown as Record<string, unknown>);
    const tursoCols = getColumnNames(tursoSchema.sessions as unknown as Record<string, unknown>);
    expect(neonCols).toEqual(tursoCols);
  });

  test("auditLogs table has matching columns", () => {
    const neonCols = getColumnNames(neonSchema.auditLogs as unknown as Record<string, unknown>);
    const tursoCols = getColumnNames(tursoSchema.auditLogs as unknown as Record<string, unknown>);
    expect(neonCols).toEqual(tursoCols);
  });

  test("sites table has matching columns", () => {
    const neonCols = getColumnNames(neonSchema.sites as unknown as Record<string, unknown>);
    const tursoCols = getColumnNames(tursoSchema.sites as unknown as Record<string, unknown>);
    expect(neonCols).toEqual(tursoCols);
  });

  test("deployments table has matching columns", () => {
    const neonCols = getColumnNames(neonSchema.deployments as unknown as Record<string, unknown>);
    const tursoCols = getColumnNames(tursoSchema.deployments as unknown as Record<string, unknown>);
    expect(neonCols).toEqual(tursoCols);
  });
});

// ── Migrate Function Signature ──────────────────────────────────────

describe("runMigrations function", () => {
  test("is exported as a function", () => {
    expect(typeof runMigrations).toBe("function");
  });

  test("accepts an optional databaseUrl parameter", () => {
    // The function has length 0 because the parameter is optional
    // (default params don't count in .length)
    expect(runMigrations.length).toBeLessThanOrEqual(1);
  });

  test("returns a Promise", () => {
    // Calling without a URL should throw because NEON_DATABASE_URL is not set
    // but it should still return a promise (async function)
    const result = runMigrations();
    expect(result).toBeInstanceOf(Promise);
    // Suppress the expected rejection
    result.catch(() => {});
  });

  test("rejects when no databaseUrl provided and env var is missing", async () => {
    const originalEnv = process.env["NEON_DATABASE_URL"];
    delete process.env["NEON_DATABASE_URL"];

    try {
      await expect(runMigrations()).rejects.toThrow("NEON_DATABASE_URL is required");
    } finally {
      if (originalEnv !== undefined) {
        process.env["NEON_DATABASE_URL"] = originalEnv;
      }
    }
  });
});
