import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as tursoSchema from "./schema";

// ── Neon PostgreSQL Schema ───────────────────────────────────────────
// Neon is the secondary database for complex queries, full-text search,
// pgvector embeddings, and workloads that exceed SQLite capabilities.

// Re-export Turso schema types for reference
export { tursoSchema };

// ── Neon Client Factory ──────────────────────────────────────────────

export function createNeonClient(databaseUrl?: string) {
  const url = databaseUrl ?? process.env["NEON_DATABASE_URL"];
  if (!url) {
    throw new Error(
      "NEON_DATABASE_URL is required. Set it in your environment or pass it directly.",
    );
  }

  const sql = neon(url);
  const db = drizzle({ client: sql });

  return { db, sql };
}

// ── Neon Health Check ────────────────────────────────────────────────

export async function checkNeonHealth(databaseUrl?: string): Promise<{
  status: "ok" | "error";
  latencyMs: number;
  error?: string;
}> {
  const start = performance.now();
  try {
    const { sql } = createNeonClient(databaseUrl);
    await sql`SELECT 1 as health_check`;
    return {
      status: "ok",
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
