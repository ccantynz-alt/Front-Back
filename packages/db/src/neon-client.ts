import { neon, neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleNeonHTTP } from "drizzle-orm/neon-http";
import { drizzle as drizzleNeonPool } from "drizzle-orm/neon-serverless";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./neon-schema";

export type NeonDatabase = NeonHttpDatabase<typeof schema>;

/**
 * Create a Neon HTTP-based Drizzle client (edge-compatible, stateless).
 *
 * Uses @neondatabase/serverless HTTP driver — perfect for Cloudflare Workers,
 * serverless functions, and edge environments where persistent connections
 * are not available.
 */
export function createNeonClient(
  connectionString: string = process.env["NEON_DATABASE_URL"] ?? "",
): NeonDatabase {
  if (!connectionString) {
    throw new Error(
      "NEON_DATABASE_URL environment variable is required for Neon connection.",
    );
  }

  const sql = neon(connectionString);
  return drizzleNeonHTTP(sql, { schema });
}

/**
 * Create a Neon WebSocket-pooled Drizzle client.
 *
 * Uses Neon's built-in connection pooler for long-lived server environments
 * (Bun/Node processes, Fly.io VMs). Supports transactions.
 */
export function createNeonPoolClient(
  connectionString: string = process.env["NEON_DATABASE_URL"] ?? "",
): ReturnType<typeof drizzleNeonPool<typeof schema>> {
  if (!connectionString) {
    throw new Error(
      "NEON_DATABASE_URL environment variable is required for Neon connection.",
    );
  }

  // Enable WebSocket connection pooling for serverless
  neonConfig.useSecureWebSocket = true;

  const pool = new Pool({ connectionString });
  return drizzleNeonPool(pool, { schema });
}

/** Default HTTP client instance — configured via NEON_DATABASE_URL env var. */
let _neonDb: NeonDatabase | undefined;

export function getNeonDb(): NeonDatabase {
  if (!_neonDb) {
    const url = process.env["NEON_DATABASE_URL"];
    if (!url) {
      // Return a proxy that throws on use, not on import
      return new Proxy({} as NeonDatabase, {
        get(_target, prop) {
          if (prop === "then" || prop === Symbol.toPrimitive || prop === Symbol.toStringTag) {
            return undefined;
          }
          throw new Error(
            `Neon database not configured. Set NEON_DATABASE_URL to use PostgreSQL features. Attempted to access: ${String(prop)}`,
          );
        },
      });
    }
    _neonDb = createNeonClient(url);
  }
  return _neonDb;
}
