// ── Scoped Query Helper (Multi-Tenant Enforcement) ──────────────────
// Wraps a Drizzle client so every SELECT, INSERT, UPDATE, and DELETE
// automatically includes a tenant filter. This prevents data leaks
// caused by a forgotten WHERE clause.
//
// Usage:
//   const scoped = scopedDb(db, tenantId);
//   const rows = await scoped.select(sites);          // auto-filters by tenantId
//   await scoped.insert(sites, { name: "..." });      // auto-injects tenantId
//   await scoped.update(sites, { name: "..." });      // auto-scopes to tenant
//   await scoped.delete(sites);                       // auto-scopes to tenant
//
// The raw `db` is still available for admin procedures that need
// cross-tenant access (e.g., platform analytics, migrations).
//
// IMPORTANT: The scoped helper works with any table that has a column
// whose name matches the configured tenant column (default: "userId").
// Tables without that column are unsupported by the scoped helper —
// use the raw db for those.

import { eq, and, type SQL } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

// ── Types ───────────────────────────────────────────────────────────

export interface ScopedQueryClient {
  /** The tenant ID this client is scoped to. */
  readonly tenantId: string;

  /** The name of the column used for tenant filtering. */
  readonly tenantColumn: string;

  /**
   * SELECT from a table, auto-filtered by tenantId.
   * Returns a promise that resolves to the filtered rows.
   */
  select: (table: SQLiteTable) => Promise<unknown[]>;

  /**
   * INSERT into a table, auto-injecting tenantId into the values.
   */
  insert: (
    table: SQLiteTable,
    data: Record<string, unknown>,
  ) => Promise<unknown>;

  /**
   * UPDATE a table, auto-scoped by tenantId.
   */
  update: (
    table: SQLiteTable,
    data: Record<string, unknown>,
  ) => Promise<unknown>;

  /**
   * DELETE from a table, auto-scoped by tenantId.
   * Optionally pass additional WHERE conditions.
   */
  delete: (
    table: SQLiteTable,
    extraCondition?: SQL,
  ) => Promise<unknown>;
}

// ── Implementation ──────────────────────────────────────────────────

/**
 * Resolve the Drizzle column object from a table by JS property name.
 * Drizzle tables store columns as properties on the table object
 * (e.g., `sites.userId`). Returns the column or throws if not found.
 */
function getColumn(table: SQLiteTable, columnName: string): unknown {
  // biome-ignore lint/suspicious/noExplicitAny: Drizzle table column access by name
  const col = (table as any)[columnName];
  if (!col) {
    throw new Error(
      `[scoped-query] Table does not have a "${columnName}" column. ` +
        "Use the raw db client for tables without tenant scoping.",
    );
  }
  return col;
}

/**
 * Returns a tenant-scoped query client that automatically injects
 * tenant filtering into every operation. The underlying raw db client
 * is untouched — admin procedures can still use it directly.
 *
 * @param db           - The raw Drizzle client
 * @param tenantId     - The tenant identifier (usually userId)
 * @param tenantColumn - The column name to filter on (default: "userId")
 */
// biome-ignore lint/suspicious/noExplicitAny: Drizzle client type is intentionally loose to support both libsql and neon drivers
export function scopedDb(
  db: any,
  tenantId: string,
  tenantColumn: string = "userId",
): ScopedQueryClient {
  return {
    tenantId,
    tenantColumn,

    async select(table: SQLiteTable): Promise<unknown[]> {
      const col = getColumn(table, tenantColumn);
      // biome-ignore lint/suspicious/noExplicitAny: Drizzle column typing
      return db.select().from(table).where(eq(col as any, tenantId));
    },

    async insert(
      table: SQLiteTable,
      data: Record<string, unknown>,
    ): Promise<unknown> {
      const values = { ...data, [tenantColumn]: tenantId };
      return db.insert(table).values(values);
    },

    async update(
      table: SQLiteTable,
      data: Record<string, unknown>,
    ): Promise<unknown> {
      const col = getColumn(table, tenantColumn);
      // biome-ignore lint/suspicious/noExplicitAny: Drizzle column typing
      return db.update(table).set(data).where(eq(col as any, tenantId));
    },

    async delete(
      table: SQLiteTable,
      extraCondition?: SQL,
    ): Promise<unknown> {
      const col = getColumn(table, tenantColumn);
      // biome-ignore lint/suspicious/noExplicitAny: Drizzle column typing
      const tenantFilter = eq(col as any, tenantId);
      const condition = extraCondition
        ? and(tenantFilter, extraCondition)
        : tenantFilter;
      return db.delete(table).where(condition);
    },
  };
}
