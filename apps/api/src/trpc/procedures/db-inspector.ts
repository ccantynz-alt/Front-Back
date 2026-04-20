// ── BLK-012 — Database Inspector (read-only) ───────────────────────
// Admin-only tRPC router that lets operators browse every table in
// both primary data tiers:
//
//   • Turso (edge SQLite)  — primary data store
//   • Neon  (serverless PG) — complex queries, vector, embeddings
//
// v1: list + describe + paginated select. No mutations.
// v2 (out of scope): query builder + row edits.
//
// ── Safety doctrine (non-negotiable) ────────────────────────────────
//   1. No raw table/column identifier interpolation into Turso SQL.
//      Turso queries go through Drizzle's typed `select().from(table)`
//      pipeline. The allow-list is built ONCE at module load from the
//      Drizzle schema exports in `@back-to-the-future/db`.
//   2. Neon has no compiled schema — introspection goes through the
//      standard `information_schema` views with parameterised values.
//      Any time we DO need the identifier in the SQL text (there is no
//      other way to `SELECT` from a dynamic table in PG), we:
//        (a) validate the name matches /^[a-zA-Z_][a-zA-Z0-9_]*$/
//        (b) re-check the name against the server-returned allow-list
//        (c) identifier-quote it with double quotes
//      This is the standard pattern used by every well-known PG
//      introspection tool. We never accept user-supplied identifiers
//      that have not round-tripped through the allow-list first.
//   3. Pagination is clamped both at the Zod boundary (max 100 per
//      page, max 500 rows in total per call) AND inside the procedure
//      body (defence in depth).
//   4. Secret-looking columns are masked on display. Matching regex:
//      /password|secret|token|api_key|private_key/i. Masked output is
//      the literal string "[REDACTED]" and a single stderr warning is
//      logged per call containing the masked column names.
//
// ── Polite tone ──────────────────────────────────────────────────────
// No competitor names anywhere in user-facing messages.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { getTableName, is, sql as drizzleSql } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import { router, adminProcedure } from "../init";
import * as dbExports from "@back-to-the-future/db";
import { createNeonClient } from "@back-to-the-future/db";

// ── Allow-list built once from the Drizzle schema ───────────────────

interface TursoTableEntry {
  readonly name: string;
  readonly drizzleTable: SQLiteTable;
}

const TURSO_TABLES: ReadonlyMap<string, TursoTableEntry> = (() => {
  const map = new Map<string, TursoTableEntry>();
  for (const value of Object.values(dbExports as Record<string, unknown>)) {
    if (is(value, SQLiteTable)) {
      const table = value as SQLiteTable;
      const name = getTableName(table);
      map.set(name, { name, drizzleTable: table });
    }
  }
  return map;
})();

// ── Secret masking ──────────────────────────────────────────────────

export const SECRET_COLUMN_RE = /password|secret|token|api_key|private_key/i;

/**
 * True when a column name looks like it holds a credential. Checks both
 * the raw name AND the snake_cased form so camelCase keys coming out of
 * Drizzle (e.g. `apiKey` from a `api_key` column) are also caught.
 */
export function isSecretColumn(name: string): boolean {
  if (SECRET_COLUMN_RE.test(name)) return true;
  const snake = name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  return SECRET_COLUMN_RE.test(snake);
}

/**
 * Return a shallow clone of `row` with any secret-looking column value
 * replaced by the literal "[REDACTED]". Handles both snake_case (SQL)
 * and camelCase (Drizzle mapping) key forms.
 */
export function maskRow(
  row: Record<string, unknown>,
  secretKeys: ReadonlySet<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const key of Object.keys(out)) {
    if (secretKeys.has(key) || isSecretColumn(key)) {
      out[key] = "[REDACTED]";
    }
  }
  return out;
}

// ── Identifier validation for Neon dynamic queries ──────────────────

const PG_IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function assertPgIdent(name: string): void {
  if (!PG_IDENT_RE.test(name)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Table name must match the standard identifier pattern.",
    });
  }
}

// ── Zod schemas ─────────────────────────────────────────────────────

const DbKindSchema = z.enum(["turso", "neon"]);

const TableSummarySchema = z.object({
  name: z.string(),
  rowCount: z.number().int().nonnegative(),
});

const ListTablesOutputSchema = z.object({
  turso: z.array(TableSummarySchema),
  neon: z.array(TableSummarySchema),
  neonConfigured: z.boolean(),
});

const ColumnInfoSchema = z.object({
  name: z.string(),
  dataType: z.string(),
  nullable: z.boolean(),
  isPrimaryKey: z.boolean(),
  isSecret: z.boolean(),
});

const DescribeTableOutputSchema = z.object({
  db: DbKindSchema,
  table: z.string(),
  rowCount: z.number().int().nonnegative(),
  columns: z.array(ColumnInfoSchema),
});

const SelectPageOutputSchema = z.object({
  db: DbKindSchema,
  table: z.string(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalRows: z.number().int().nonnegative(),
  maskedColumns: z.array(z.string()),
  rows: z.array(z.record(z.string(), z.unknown())),
});

const MAX_PAGE_SIZE = 100;
const MAX_TOTAL_ROWS = 500;

// ── Helpers ─────────────────────────────────────────────────────────

function requireTursoTable(name: string): TursoTableEntry {
  const entry = TURSO_TABLES.get(name);
  if (!entry) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That table is not available on the edge tier.",
    });
  }
  return entry;
}

function neonAvailable(): boolean {
  return Boolean(process.env["NEON_DATABASE_URL"]);
}

async function listNeonTableNames(): Promise<string[]> {
  if (!neonAvailable()) return [];
  const { sql } = createNeonClient();
  const rows = (await sql`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type = 'BASE TABLE'
     ORDER BY table_name
  `) as Array<{ table_name: string }>;
  return rows.map((r) => r.table_name);
}

async function neonRowCount(table: string): Promise<number> {
  assertPgIdent(table);
  const { sql } = createNeonClient();
  // Safe: identifier has been regex-validated AND is the value already
  // returned from information_schema (round-tripped allow-list).
  const rows = (await sql.query(
    `SELECT COUNT(*)::bigint AS c FROM "${table}"`,
  )) as Array<{ c: string | number }>;
  const first = rows[0];
  if (!first) return 0;
  return Number(first.c);
}

function warnMasked(db: "turso" | "neon", table: string, masked: string[]): void {
  if (masked.length === 0) return;
  // Single stderr warning per call — meets the safety-rules contract
  // without flooding logs for wide tables.
  console.warn(
    `[db-inspector] ${db}.${table}: masked ${masked.length} secret column(s): ${masked.join(", ")}`,
  );
}

// ── Router ──────────────────────────────────────────────────────────

export const dbInspectorRouter = router({
  /** List every Turso table + every Neon table with row counts. */
  listTables: adminProcedure
    .output(ListTablesOutputSchema)
    .query(async ({ ctx }) => {
      // Turso: count every known table via the typed Drizzle pipeline.
      const tursoSummaries: Array<{ name: string; rowCount: number }> = [];
      for (const entry of TURSO_TABLES.values()) {
        try {
          const rows = await ctx.db
            .select({ c: drizzleSql<number>`count(*)` })
            .from(entry.drizzleTable);
          const first = rows[0];
          tursoSummaries.push({
            name: entry.name,
            rowCount: Number(first?.c ?? 0),
          });
        } catch {
          // A missing physical table (e.g. migration drift) should not
          // kill the whole listing — surface a 0 row count so the UI
          // still renders and the operator can investigate.
          tursoSummaries.push({ name: entry.name, rowCount: 0 });
        }
      }
      tursoSummaries.sort((a, b) => a.name.localeCompare(b.name));

      // Neon: only attempt when NEON_DATABASE_URL is present.
      const neonSummaries: Array<{ name: string; rowCount: number }> = [];
      const configured = neonAvailable();
      if (configured) {
        try {
          const names = await listNeonTableNames();
          for (const name of names) {
            try {
              const count = await neonRowCount(name);
              neonSummaries.push({ name, rowCount: count });
            } catch {
              neonSummaries.push({ name, rowCount: 0 });
            }
          }
        } catch {
          // Introspection itself failed — fall through with an empty
          // list. The UI shows a polite empty state.
        }
      }

      return {
        turso: tursoSummaries,
        neon: neonSummaries,
        neonConfigured: configured,
      };
    }),

  /** Describe one table — columns, types, and row count. */
  describeTable: adminProcedure
    .input(
      z.object({
        db: DbKindSchema,
        table: z.string().min(1).max(128),
      }),
    )
    .output(DescribeTableOutputSchema)
    .query(async ({ ctx, input }) => {
      if (input.db === "turso") {
        const entry = requireTursoTable(input.table);

        // PRAGMA returns [{ cid, name, type, notnull, dflt_value, pk }]
        const pragmaRows = (await ctx.db.all(
          drizzleSql.raw(`PRAGMA table_info(${quoteSqlite(entry.name)})`),
        )) as Array<{
          name: string;
          type: string;
          notnull: number;
          pk: number;
        }>;
        const columns = pragmaRows.map((r) => ({
          name: r.name,
          dataType: r.type || "unknown",
          nullable: r.notnull === 0,
          isPrimaryKey: r.pk > 0,
          isSecret: isSecretColumn(r.name),
        }));

        const countRows = await ctx.db
          .select({ c: drizzleSql<number>`count(*)` })
          .from(entry.drizzleTable);
        const rowCount = Number(countRows[0]?.c ?? 0);

        return {
          db: "turso" as const,
          table: entry.name,
          rowCount,
          columns,
        };
      }

      // Neon branch.
      if (!neonAvailable()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The serverless PG tier is not configured on this instance.",
        });
      }
      // Round-trip validation: the table must appear in the Neon allow-list
      // returned by information_schema BEFORE we ever put it into a SQL
      // string. This is the core injection defence.
      const neonNames = await listNeonTableNames();
      if (!neonNames.includes(input.table)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That table is not available on the serverless PG tier.",
        });
      }
      assertPgIdent(input.table);

      const { sql } = createNeonClient();
      const colRows = (await sql`
        SELECT
          c.column_name,
          c.data_type,
          c.is_nullable,
          CASE WHEN kcu.column_name IS NOT NULL THEN true ELSE false END
            AS is_pk
          FROM information_schema.columns c
          LEFT JOIN information_schema.table_constraints tc
            ON tc.table_name = c.table_name
           AND tc.table_schema = c.table_schema
           AND tc.constraint_type = 'PRIMARY KEY'
          LEFT JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_name = tc.constraint_name
           AND kcu.column_name = c.column_name
         WHERE c.table_schema = 'public'
           AND c.table_name = ${input.table}
         ORDER BY c.ordinal_position
      `) as Array<{
        column_name: string;
        data_type: string;
        is_nullable: string;
        is_pk: boolean;
      }>;
      const columns = colRows.map((r) => ({
        name: r.column_name,
        dataType: r.data_type,
        nullable: r.is_nullable === "YES",
        isPrimaryKey: Boolean(r.is_pk),
        isSecret: isSecretColumn(r.column_name),
      }));

      const rowCount = await neonRowCount(input.table);

      return {
        db: "neon" as const,
        table: input.table,
        rowCount,
        columns,
      };
    }),

  /** Paginated row read. Secret-looking columns are masked. */
  selectPage: adminProcedure
    .input(
      z.object({
        db: DbKindSchema,
        table: z.string().min(1).max(128),
        page: z.number().int().positive().max(10_000).default(1),
        pageSize: z.number().int().positive().max(MAX_PAGE_SIZE).default(50),
      }),
    )
    .output(SelectPageOutputSchema)
    .query(async ({ ctx, input }) => {
      // Defence-in-depth clamp (Zod already caps these, but we belt-and-
      // brace in the body too — the safety doctrine calls for both).
      const pageSize = Math.min(
        Math.max(1, Math.floor(input.pageSize)),
        MAX_PAGE_SIZE,
      );
      const page = Math.max(1, Math.floor(input.page));
      const offset = Math.min((page - 1) * pageSize, MAX_TOTAL_ROWS);
      const effectiveLimit = Math.min(pageSize, MAX_TOTAL_ROWS - offset);
      if (effectiveLimit <= 0) {
        return {
          db: input.db,
          table: input.table,
          page,
          pageSize,
          totalRows: 0,
          maskedColumns: [],
          rows: [],
        };
      }

      if (input.db === "turso") {
        const entry = requireTursoTable(input.table);

        const rawRows = (await ctx.db
          .select()
          .from(entry.drizzleTable)
          .limit(effectiveLimit)
          .offset(offset)) as Array<Record<string, unknown>>;

        const secretKeys = new Set<string>();
        for (const row of rawRows) {
          for (const key of Object.keys(row)) {
            if (isSecretColumn(key)) secretKeys.add(key);
          }
        }
        const maskedColumns = [...secretKeys];
        warnMasked("turso", entry.name, maskedColumns);
        const rows = rawRows.map((r) => maskRow(r, secretKeys));

        const countRows = await ctx.db
          .select({ c: drizzleSql<number>`count(*)` })
          .from(entry.drizzleTable);
        const totalRows = Number(countRows[0]?.c ?? 0);

        return {
          db: "turso" as const,
          table: entry.name,
          page,
          pageSize,
          totalRows,
          maskedColumns,
          rows,
        };
      }

      // Neon branch.
      if (!neonAvailable()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "The serverless PG tier is not configured on this instance.",
        });
      }
      const neonNames = await listNeonTableNames();
      if (!neonNames.includes(input.table)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That table is not available on the serverless PG tier.",
        });
      }
      assertPgIdent(input.table);

      const { sql } = createNeonClient();
      // The identifier has been validated + round-tripped through the
      // information_schema allow-list above, so it is safe to quote and
      // interpolate. Values (limit/offset) go through parameterisation.
      const rawRows = (await sql.query(
        `SELECT * FROM "${input.table}" LIMIT $1 OFFSET $2`,
        [effectiveLimit, offset],
      )) as Array<Record<string, unknown>>;

      const secretKeys = new Set<string>();
      for (const row of rawRows) {
        for (const key of Object.keys(row)) {
          if (isSecretColumn(key)) secretKeys.add(key);
        }
      }
      const maskedColumns = [...secretKeys];
      warnMasked("neon", input.table, maskedColumns);
      const rows = rawRows.map((r) => maskRow(r, secretKeys));

      const totalRows = await neonRowCount(input.table);

      return {
        db: "neon" as const,
        table: input.table,
        page,
        pageSize,
        totalRows,
        maskedColumns,
        rows,
      };
    }),
});

// ── Test-only internals ─────────────────────────────────────────────
// Exported for the test file. NOT part of the public router surface.

export const __dbInspectorInternals = {
  TURSO_TABLES,
  SECRET_COLUMN_RE,
  isSecretColumn,
  maskRow,
  MAX_PAGE_SIZE,
  MAX_TOTAL_ROWS,
} as const;

// ── Private helpers ─────────────────────────────────────────────────

/** Quote a SQLite identifier with double quotes, escaping embedded ". */
function quoteSqlite(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
