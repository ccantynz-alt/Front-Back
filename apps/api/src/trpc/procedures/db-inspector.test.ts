// ── BLK-012 — db-inspector procedure tests ──────────────────────────
// Contract:
//   1. adminProcedure guard rejects non-admins (FORBIDDEN) and anons
//      (UNAUTHORIZED).
//   2. listTables returns the full Drizzle allow-list ordered by name
//      and carries the neonConfigured flag.
//   3. describeTable returns PRAGMA-derived column metadata, flags PKs,
//      marks secret columns, and refuses unknown tables (NOT_FOUND).
//   4. selectPage clamps pageSize at the Zod boundary AND in the body,
//      never returns more than MAX_TOTAL_ROWS even for huge offsets,
//      and masks secret-looking columns in every returned row.
//   5. Secret column heuristic matches the locked regex:
//      /password|secret|token|api_key|private_key/i.

import { describe, test, expect, afterEach } from "bun:test";
import { eq } from "drizzle-orm";
import { db, users, sessions, scopedDb } from "@back-to-the-future/db";
import { appRouter } from "../router";
import { createSession } from "../../auth/session";
import {
  __dbInspectorInternals,
  isSecretColumn,
  maskRow,
  SECRET_COLUMN_RE,
} from "./db-inspector";
import type { TRPCContext } from "../context";

function ctxFor(userId: string, sessionToken: string): TRPCContext {
  return {
    db,
    userId,
    sessionToken,
    csrfToken: null,
    scopedDb: scopedDb(db, userId),
  };
}

async function createUser(role: "admin" | "viewer"): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: `dbi-${role}-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}@example.com`,
    displayName: `DB Inspector Test ${role}`,
    role,
  });
  return id;
}

async function cleanupUser(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

describe("db-inspector — pure helpers", () => {
  test("SECRET_COLUMN_RE matches the full set of sensitive keywords", () => {
    // The raw regex is the locked contract from the safety rules.
    // It intentionally uses snake_case literals for api_key / private_key.
    expect(SECRET_COLUMN_RE.test("password")).toBe(true);
    expect(SECRET_COLUMN_RE.test("passwordHash")).toBe(true);
    expect(SECRET_COLUMN_RE.test("SECRET")).toBe(true);
    expect(SECRET_COLUMN_RE.test("session_token")).toBe(true);
    expect(SECRET_COLUMN_RE.test("api_key")).toBe(true);
    expect(SECRET_COLUMN_RE.test("private_key")).toBe(true);
    expect(SECRET_COLUMN_RE.test("MY_API_KEY")).toBe(true);
  });

  test("isSecretColumn catches camelCase keys Drizzle emits", () => {
    // Drizzle maps snake_case SQL columns to camelCase object keys, so
    // isSecretColumn must catch `apiKey` even though the raw regex
    // expects `api_key`.
    expect(isSecretColumn("apiKey")).toBe(true);
    expect(isSecretColumn("privateKey")).toBe(true);
    expect(isSecretColumn("passwordHash")).toBe(true);
    expect(isSecretColumn("SessionToken")).toBe(true);
  });

  test("SECRET_COLUMN_RE does NOT flag innocuous names", () => {
    expect(SECRET_COLUMN_RE.test("id")).toBe(false);
    expect(SECRET_COLUMN_RE.test("email")).toBe(false);
    expect(SECRET_COLUMN_RE.test("display_name")).toBe(false);
    expect(SECRET_COLUMN_RE.test("created_at")).toBe(false);
    expect(SECRET_COLUMN_RE.test("role")).toBe(false);
  });

  test("isSecretColumn also returns false for innocuous names", () => {
    expect(isSecretColumn("id")).toBe(false);
    expect(isSecretColumn("email")).toBe(false);
    expect(isSecretColumn("displayName")).toBe(false);
  });

  test("maskRow replaces all secret-looking keys with [REDACTED]", () => {
    const input = {
      id: "u1",
      email: "a@b.com",
      password_hash: "hashed",
      session_token: "abc",
      role: "admin",
    };
    const masked = maskRow(input, new Set(["password_hash", "session_token"]));
    expect(masked.id).toBe("u1");
    expect(masked.email).toBe("a@b.com");
    expect(masked.password_hash).toBe("[REDACTED]");
    expect(masked.session_token).toBe("[REDACTED]");
    expect(masked.role).toBe("admin");
  });

  test("maskRow also redacts camelCase keys via the regex fallback", () => {
    const input = {
      id: "u1",
      passwordHash: "hashed",
      apiKey: "live_key",
    };
    const masked = maskRow(input, new Set());
    expect(masked.id).toBe("u1");
    expect(masked.passwordHash).toBe("[REDACTED]");
    expect(masked.apiKey).toBe("[REDACTED]");
  });

  test("internals expose the caps the safety doctrine depends on", () => {
    expect(__dbInspectorInternals.MAX_PAGE_SIZE).toBe(100);
    expect(__dbInspectorInternals.MAX_TOTAL_ROWS).toBe(500);
    expect(__dbInspectorInternals.TURSO_TABLES.size).toBeGreaterThan(10);
    // users is in schema and must be in the allow-list.
    expect(__dbInspectorInternals.TURSO_TABLES.has("users")).toBe(true);
  });
});

describe("db-inspector — router guards", () => {
  const createdUsers: string[] = [];
  afterEach(async () => {
    for (const id of createdUsers.splice(0)) await cleanupUser(id);
  });

  test("unauthenticated callers get UNAUTHORIZED on listTables", async () => {
    const anon = appRouter.createCaller({
      db,
      userId: null,
      sessionToken: null,
      csrfToken: null,
      scopedDb: null,
    });
    let threw = false;
    try {
      await anon.dbInspector.listTables();
    } catch (err) {
      threw = true;
      expect((err as { code?: string }).code).toBe("UNAUTHORIZED");
    }
    expect(threw).toBe(true);
  });

  test("non-admin callers get FORBIDDEN on listTables", async () => {
    const userId = await createUser("viewer");
    createdUsers.push(userId);
    const token = await createSession(userId, db);
    const caller = appRouter.createCaller(ctxFor(userId, token));

    let threw = false;
    try {
      await caller.dbInspector.listTables();
    } catch (err) {
      threw = true;
      expect((err as { code?: string }).code).toBe("FORBIDDEN");
    }
    expect(threw).toBe(true);
  });

  test("non-admin callers get FORBIDDEN on describeTable", async () => {
    const userId = await createUser("viewer");
    createdUsers.push(userId);
    const token = await createSession(userId, db);
    const caller = appRouter.createCaller(ctxFor(userId, token));

    let threw = false;
    try {
      await caller.dbInspector.describeTable({ db: "turso", table: "users" });
    } catch (err) {
      threw = true;
      expect((err as { code?: string }).code).toBe("FORBIDDEN");
    }
    expect(threw).toBe(true);
  });

  test("non-admin callers get FORBIDDEN on selectPage", async () => {
    const userId = await createUser("viewer");
    createdUsers.push(userId);
    const token = await createSession(userId, db);
    const caller = appRouter.createCaller(ctxFor(userId, token));

    let threw = false;
    try {
      await caller.dbInspector.selectPage({
        db: "turso",
        table: "users",
        page: 1,
        pageSize: 10,
      });
    } catch (err) {
      threw = true;
      expect((err as { code?: string }).code).toBe("FORBIDDEN");
    }
    expect(threw).toBe(true);
  });
});

describe("db-inspector — admin behaviour (Turso)", () => {
  const createdUsers: string[] = [];
  afterEach(async () => {
    for (const id of createdUsers.splice(0)) await cleanupUser(id);
  });

  async function adminCaller(): Promise<ReturnType<typeof appRouter.createCaller>> {
    const userId = await createUser("admin");
    createdUsers.push(userId);
    const token = await createSession(userId, db);
    return appRouter.createCaller(ctxFor(userId, token));
  }

  test("listTables returns the full allow-list sorted by name", async () => {
    const caller = await adminCaller();
    const out = await caller.dbInspector.listTables();

    expect(Array.isArray(out.turso)).toBe(true);
    expect(out.turso.length).toBeGreaterThan(10);

    const names = out.turso.map((t) => t.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);

    // `users` must appear — we just created one.
    const usersRow = out.turso.find((t) => t.name === "users");
    expect(usersRow).toBeDefined();
    expect(usersRow?.rowCount).toBeGreaterThan(0);

    // neonConfigured mirrors env — absence => false, presence => true.
    expect(typeof out.neonConfigured).toBe("boolean");
  });

  test("describeTable returns column metadata with PK + secret flags", async () => {
    const caller = await adminCaller();
    const out = await caller.dbInspector.describeTable({
      db: "turso",
      table: "users",
    });

    expect(out.db).toBe("turso");
    expect(out.table).toBe("users");
    expect(out.rowCount).toBeGreaterThan(0);

    const idCol = out.columns.find((c) => c.name === "id");
    expect(idCol).toBeDefined();
    expect(idCol?.isPrimaryKey).toBe(true);

    const passwordCol = out.columns.find((c) => c.name === "password_hash");
    expect(passwordCol).toBeDefined();
    expect(passwordCol?.isSecret).toBe(true);
  });

  test("describeTable rejects an unknown table with NOT_FOUND", async () => {
    const caller = await adminCaller();
    let threw = false;
    try {
      await caller.dbInspector.describeTable({
        db: "turso",
        table: "definitely_not_a_real_table",
      });
    } catch (err) {
      threw = true;
      expect((err as { code?: string }).code).toBe("NOT_FOUND");
    }
    expect(threw).toBe(true);
  });

  test("describeTable rejects a SQL-injection-style table name", async () => {
    const caller = await adminCaller();
    let threw = false;
    try {
      await caller.dbInspector.describeTable({
        db: "turso",
        table: "users; DROP TABLE sessions;--",
      });
    } catch (err) {
      threw = true;
      expect((err as { code?: string }).code).toBe("NOT_FOUND");
    }
    expect(threw).toBe(true);
  });

  test("selectPage returns rows with secret columns masked", async () => {
    const caller = await adminCaller();
    const out = await caller.dbInspector.selectPage({
      db: "turso",
      table: "users",
      page: 1,
      pageSize: 10,
    });

    expect(out.db).toBe("turso");
    expect(out.table).toBe("users");
    expect(out.page).toBe(1);
    expect(out.pageSize).toBe(10);
    expect(out.totalRows).toBeGreaterThan(0);
    expect(Array.isArray(out.rows)).toBe(true);

    // If any row has a passwordHash / password_hash field, it MUST be
    // masked. At minimum the masked-columns list should reflect what
    // the row actually had.
    for (const row of out.rows) {
      for (const key of Object.keys(row)) {
        if (isSecretColumn(key)) {
          expect(row[key]).toBe("[REDACTED]");
        }
      }
    }
  });

  test("selectPage rejects Zod values over MAX_PAGE_SIZE", async () => {
    const caller = await adminCaller();
    let threw = false;
    try {
      await caller.dbInspector.selectPage({
        db: "turso",
        table: "users",
        page: 1,
        pageSize: 1000, // > MAX_PAGE_SIZE
      });
    } catch (err) {
      threw = true;
      // Zod validation failure surfaces as BAD_REQUEST in tRPC
      const code = (err as { code?: string }).code;
      expect(["BAD_REQUEST", "PARSE_ERROR"]).toContain(code ?? "");
    }
    expect(threw).toBe(true);
  });

  test("selectPage clamps huge offsets to the MAX_TOTAL_ROWS ceiling", async () => {
    const caller = await adminCaller();
    // page=10000 with pageSize=100 = offset 999,900 → clamped to 500.
    const out = await caller.dbInspector.selectPage({
      db: "turso",
      table: "users",
      page: 10_000,
      pageSize: 100,
    });
    // Either no rows (offset past end) or clamped limit — must never
    // exceed MAX_TOTAL_ROWS worth of rows in a single call.
    expect(out.rows.length).toBeLessThanOrEqual(500);
  });

  test("selectPage rejects unknown tables with NOT_FOUND", async () => {
    const caller = await adminCaller();
    let threw = false;
    try {
      await caller.dbInspector.selectPage({
        db: "turso",
        table: "not_a_real_table",
        page: 1,
        pageSize: 10,
      });
    } catch (err) {
      threw = true;
      expect((err as { code?: string }).code).toBe("NOT_FOUND");
    }
    expect(threw).toBe(true);
  });
});
