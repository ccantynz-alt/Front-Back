// ── BLK-024 — Domain registrar procedure tests ────────────────────────
// Exercises the tRPC `domains` router against the test sqlite DB with a
// mocked OpenSRS client so we never hit the real registrar. Per the
// BLK-024 brief the coverage contract is:
//
//   1. Availability search — parallel fan-out, mixes available + taken
//      results across multiple TLDs.
//   2. Register happy path — wholesale is fetched, markup applied,
//      SW_REGISTER called, DB row written with correct cost/markup.
//   3. Failure from the registrar — SW_REGISTER failure bubbles up as
//      BAD_GATEWAY and no row is written.
//   4. Price markup math — retail = wholesale * (1 + markup%), within
//      microdollar precision.
//
// The mock implements the minimum surface of the OpenSRS client that
// the router consumes. We DO NOT mock the raw HTTP layer here — the
// XML encoding / decoding / signing is covered by its own unit tests
// (or would be if added). Here we mock at the client method level so
// the router logic is what's under test.

import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import {
  db,
  users,
  sessions,
  scopedDb,
  domainRegistrations,
} from "@back-to-the-future/db";
import { appRouter } from "../router";
import { createSession } from "../../auth/session";
import type { TRPCContext } from "../context";
import {
  __setDomainsTestHooks,
  __resetDomainsTestHooks,
} from "./domains";
import type { OpensrsClient } from "../../domains/opensrs-client";
import type {
  OpensrsLookupAttributes,
  OpensrsGetPriceAttributes,
  OpensrsRegisterAttributes,
  OpensrsRenewAttributes,
} from "../../domains/opensrs-types";

// ── Test harness ──────────────────────────────────────────────────────

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
    email: `dom-${role}-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').slice(0, 6)}@example.com`,
    displayName: `Domain Test ${role}`,
    role,
  });
  return id;
}

async function cleanupUser(userId: string): Promise<void> {
  await db
    .delete(domainRegistrations)
    .where(eq(domainRegistrations.userId, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

// ── Fake OpenSRS client ───────────────────────────────────────────────
// We implement only the methods the router calls. The type assertion at
// the return site keeps this aligned with the real client shape without
// forcing us to stub methods we never touch.

interface FakeClientState {
  lookupResults: Map<string, OpensrsLookupAttributes>;
  priceResults: Map<string, OpensrsGetPriceAttributes>;
  registerResult:
    | { kind: "ok"; value: OpensrsRegisterAttributes }
    | { kind: "err"; error: Error }
    | null;
  renewResult:
    | { kind: "ok"; value: OpensrsRenewAttributes }
    | { kind: "err"; error: Error }
    | null;
  lookupCalls: string[];
  registerCalls: Array<{ domain: string; years: number }>;
}

function emptyState(): FakeClientState {
  return {
    lookupResults: new Map(),
    priceResults: new Map(),
    registerResult: null,
    renewResult: null,
    lookupCalls: [],
    registerCalls: [],
  };
}

function makeFakeClient(state: FakeClientState): OpensrsClient {
  const impl = {
    async lookup(domain: string): Promise<OpensrsLookupAttributes> {
      state.lookupCalls.push(domain);
      const v = state.lookupResults.get(domain);
      if (!v) {
        return { status: "unknown", domain };
      }
      return v;
    },
    async getPrice(domain: string): Promise<OpensrsGetPriceAttributes> {
      const v = state.priceResults.get(domain);
      if (!v) {
        return { price: "0.00", currency: "USD" };
      }
      return v;
    },
    async register(input: {
      domain: string;
      years: number;
    }): Promise<OpensrsRegisterAttributes> {
      state.registerCalls.push({ domain: input.domain, years: input.years });
      const r = state.registerResult;
      if (!r) return { order_id: "stub-order" };
      if (r.kind === "err") throw r.error;
      return r.value;
    },
    async renew(): Promise<OpensrsRenewAttributes> {
      const r = state.renewResult;
      if (!r) return { order_id: "stub-renew" };
      if (r.kind === "err") throw r.error;
      return r.value;
    },
  };
  return impl as unknown as OpensrsClient;
}

// ── Suite ─────────────────────────────────────────────────────────────

describe("domains router", () => {
  const createdUsers: string[] = [];
  let state: FakeClientState;

  beforeEach(() => {
    state = emptyState();
    __setDomainsTestHooks({
      clientFactory: () => makeFakeClient(state),
      markupPercent: 20,
    });
  });

  afterEach(async () => {
    __resetDomainsTestHooks();
    for (const id of createdUsers.splice(0)) await cleanupUser(id);
  });

  async function adminCaller(): Promise<ReturnType<typeof appRouter.createCaller>> {
    const userId = await createUser("admin");
    createdUsers.push(userId);
    const token = await createSession(userId, db);
    return appRouter.createCaller(ctxFor(userId, token));
  }

  // ── 1. Availability search ──────────────────────────────────────────

  test("search fans out across TLDs in parallel and mixes available + taken", async () => {
    state.lookupResults.set("crontech.com", { status: "taken", domain: "crontech.com" });
    state.lookupResults.set("crontech.ai", { status: "available", domain: "crontech.ai" });
    state.lookupResults.set("crontech.dev", { status: "available", domain: "crontech.dev" });

    const caller = appRouter.createCaller({
      db,
      userId: null,
      sessionToken: null,
      csrfToken: null,
      scopedDb: null,
    });

    const out = await caller.domains.search({
      query: "crontech",
      tlds: [".com", ".ai", ".dev"],
    });

    expect(out.results).toHaveLength(3);
    const byDomain = Object.fromEntries(out.results.map((r) => [r.domain, r]));
    expect(byDomain["crontech.com"]?.available).toBe(false);
    expect(byDomain["crontech.ai"]?.available).toBe(true);
    expect(byDomain["crontech.dev"]?.available).toBe(true);

    // All three calls should have been issued (parallel fan-out).
    expect(new Set(state.lookupCalls)).toEqual(
      new Set(["crontech.com", "crontech.ai", "crontech.dev"]),
    );
  });

  test("search accepts a fully-qualified input and prepends its TLD", async () => {
    state.lookupResults.set("acme.io", { status: "available", domain: "acme.io" });
    state.lookupResults.set("acme.com", { status: "taken", domain: "acme.com" });

    const caller = appRouter.createCaller({
      db,
      userId: null,
      sessionToken: null,
      csrfToken: null,
      scopedDb: null,
    });

    const out = await caller.domains.search({
      query: "acme.io",
      tlds: [".com"],
    });

    expect(out.results[0]?.domain).toBe("acme.io");
    expect(out.results[0]?.available).toBe(true);
    expect(out.results.some((r) => r.domain === "acme.com")).toBe(true);
  });

  // ── 2. Price markup math ────────────────────────────────────────────

  test("getPricing applies the configured markup to the wholesale price", async () => {
    state.priceResults.set("example.com", {
      price: "10.00",
      currency: "USD",
    });
    const caller = appRouter.createCaller({
      db,
      userId: null,
      sessionToken: null,
      csrfToken: null,
      scopedDb: null,
    });

    const out = await caller.domains.getPricing({ domain: "example.com" });

    // 10 USD = 10_000_000 microdollars. Markup 20% = 2_000_000. Retail = 12_000_000.
    expect(out.wholesaleMicrodollars).toBe(10_000_000);
    expect(out.markupMicrodollars).toBe(2_000_000);
    expect(out.retailMicrodollars).toBe(12_000_000);
    expect(out.markupPercent).toBe(20);
    expect(out.currency).toBe("USD");
  });

  test("getPricing honours a custom markup percent via the test hook", async () => {
    state.priceResults.set("example.com", { price: 8.99, currency: "USD" });
    __setDomainsTestHooks({
      clientFactory: () => makeFakeClient(state),
      markupPercent: 50,
    });
    const caller = appRouter.createCaller({
      db,
      userId: null,
      sessionToken: null,
      csrfToken: null,
      scopedDb: null,
    });

    const out = await caller.domains.getPricing({ domain: "example.com" });
    // 8.99 → 8_990_000 µ$. 50% markup = 4_495_000. Retail = 13_485_000.
    expect(out.wholesaleMicrodollars).toBe(8_990_000);
    expect(out.markupMicrodollars).toBe(4_495_000);
    expect(out.retailMicrodollars).toBe(13_485_000);
  });

  // ── 3. Register happy path ──────────────────────────────────────────

  test("register fetches the wholesale price, calls SW_REGISTER, and writes a row", async () => {
    state.priceResults.set("buyme.com", { price: "15.00", currency: "USD" });
    state.registerResult = {
      kind: "ok",
      value: {
        order_id: "order-123",
        registration_expiration_date: "2030-01-01T00:00:00Z",
      },
    };

    const caller = await adminCaller();
    const out = await caller.domains.register({
      domain: "buyme.com",
      years: 2,
      contactInfo: {
        firstName: "Craig",
        lastName: "Cantyn",
        address1: "1 Test St",
        city: "Auckland",
        state: "AKL",
        country: "NZ",
        postalCode: "1010",
        phone: "+64.211234567",
        email: "craig@crontech.ai",
      },
    });

    expect(out.opensrsHandle).toBe("order-123");
    expect(out.wholesaleMicrodollars).toBe(15_000_000);
    expect(out.retailMicrodollars).toBe(18_000_000);
    expect(out.markupMicrodollars).toBe(3_000_000);

    const rows = await db
      .select()
      .from(domainRegistrations)
      .where(eq(domainRegistrations.domain, "buyme.com"));
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.costMicrodollars).toBe(15_000_000);
    expect(row?.markupMicrodollars).toBe(3_000_000);
    expect(row?.tld).toBe(".com");
    expect(row?.status).toBe("active");
    expect(row?.opensrsHandle).toBe("order-123");
    expect(state.registerCalls).toHaveLength(1);
    expect(state.registerCalls[0]?.domain).toBe("buyme.com");
    expect(state.registerCalls[0]?.years).toBe(2);
  });

  // ── 4. Failure from the registrar ───────────────────────────────────

  test("register surfaces an OpenSRS failure as BAD_GATEWAY and writes no row", async () => {
    state.priceResults.set("fail.com", { price: "10.00", currency: "USD" });
    state.registerResult = {
      kind: "err",
      error: Object.assign(new Error("Domain already registered"), {
        name: "OpensrsError",
      }),
    };
    // Use a real OpensrsError so the translator hits the BAD_GATEWAY branch.
    const { OpensrsError } = await import("../../domains/opensrs-client");
    state.registerResult = {
      kind: "err",
      error: new OpensrsError(
        "Domain already registered to another reseller.",
        "SW_REGISTER",
        400,
      ),
    };

    const caller = await adminCaller();
    let caught: unknown;
    try {
      await caller.domains.register({
        domain: "fail.com",
        years: 1,
        contactInfo: {
          firstName: "Craig",
          lastName: "Cantyn",
          address1: "1 Test St",
          city: "Auckland",
          state: "AKL",
          country: "NZ",
          postalCode: "1010",
          phone: "+64.211234567",
          email: "craig@crontech.ai",
        },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    const code = (caught as { code?: string }).code;
    expect(code).toBe("BAD_GATEWAY");

    const rows = await db
      .select()
      .from(domainRegistrations)
      .where(eq(domainRegistrations.domain, "fail.com"));
    expect(rows).toHaveLength(0);
  });

  // ── 5. Auth gating ──────────────────────────────────────────────────

  test("register is admin-gated — viewers get FORBIDDEN", async () => {
    const userId = await createUser("viewer");
    createdUsers.push(userId);
    const token = await createSession(userId, db);
    const caller = appRouter.createCaller(ctxFor(userId, token));

    let caught: unknown;
    try {
      await caller.domains.register({
        domain: "nope.com",
        years: 1,
        contactInfo: {
          firstName: "Craig",
          lastName: "Cantyn",
          address1: "1 Test St",
          city: "Auckland",
          state: "AKL",
          country: "NZ",
          postalCode: "1010",
          phone: "+64.211234567",
          email: "craig@crontech.ai",
        },
      });
    } catch (err) {
      caught = err;
    }
    const code = (caught as { code?: string }).code;
    expect(code).toBe("FORBIDDEN");
  });

  // ── 6. listMyDomains ────────────────────────────────────────────────

  test("listMyDomains returns only the caller's registered domains", async () => {
    const caller = await adminCaller();
    state.priceResults.set("mine.com", { price: "10.00", currency: "USD" });
    state.registerResult = {
      kind: "ok",
      value: {
        order_id: "mine-1",
        registration_expiration_date: "2030-01-01T00:00:00Z",
      },
    };
    await caller.domains.register({
      domain: "mine.com",
      years: 1,
      contactInfo: {
        firstName: "Craig",
        lastName: "Cantyn",
        address1: "1 Test St",
        city: "Auckland",
        state: "AKL",
        country: "NZ",
        postalCode: "1010",
        phone: "+64.211234567",
        email: "craig@crontech.ai",
      },
    });

    const list = await caller.domains.listMyDomains();
    expect(list).toHaveLength(1);
    expect(list[0]?.domain).toBe("mine.com");
    expect(list[0]?.status).toBe("active");
  });
});
