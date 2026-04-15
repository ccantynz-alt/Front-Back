import { createClient as createLibSQLClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

export function createClient(url: string, authToken?: string) {
  const clientConfig: Parameters<typeof createLibSQLClient>[0] = { url };
  if (authToken) {
    clientConfig.authToken = authToken;
  }
  const client = createLibSQLClient(clientConfig);

  return drizzle(client, { schema });
}

// Default client - lazily initialized on first use.
//
// Why a Proxy instead of `export const db = createClient(...)` at module scope:
// Cloudflare Workers runs the top-level of every module once during deploy-time
// validation. If we construct the libsql client eagerly, and DATABASE_URL is
// unset (as it is during deploy validation, since secrets aren't injected then
// and "file:local.db" isn't a valid URL scheme for the Workers-compatible
// libsql client), the deploy fails with URL_SCHEME_NOT_SUPPORTED before any
// request is even served.
//
// The Proxy defers the createClient() call until the first property access
// (e.g. `db.select(...)`, `db.insert(...)`, `db.query.users`). By then we're
// inside a real request and the env vars are actually bound. All 89+ call
// sites that use `db.X` continue to work unchanged.
type Db = ReturnType<typeof createClient>;
let _db: Db | null = null;

function getDb(): Db {
  if (_db) return _db;
  const url = process.env["DATABASE_URL"] ?? "file:local.db";
  const authToken = process.env["DATABASE_AUTH_TOKEN"];
  _db = createClient(url, authToken);
  return _db;
}

export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
  has(_target, prop) {
    return Reflect.has(getDb(), prop);
  },
});
