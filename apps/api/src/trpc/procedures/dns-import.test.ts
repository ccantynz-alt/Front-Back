// BLK-023 — DNS import from Cloudflare.
//
// Exercises `importFromCloudflare` against the real drizzle test DB
// (apps/api/test/setup.ts wipes + re-migrates on preload) with a mocked
// Cloudflare fetch so we can assert the full import pipeline:
//   1. Happy path — zone row synthesised, records inserted, serial bumped.
//   2. Dedup — re-running the same import is a no-op.
//   3. Type skip — unsupported Cloudflare types (e.g. "WORKERS") are
//      counted in `skipped` rather than `imported`.
//   4. Auth failure — a 403 from Cloudflare surfaces as UNAUTHORIZED.
//
// Tests intentionally use the function-level entry point rather than the
// tRPC caller because the procedure is a thin wrapper around this
// function and exercising both surfaces the same defect.

import { describe, test, expect, beforeEach } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db, dnsZones, dnsRecords } from "@back-to-the-future/db";
import {
  importFromCloudflare,
  type CloudflareRecord,
} from "./dns-import";

// ── Helpers ─────────────────────────────────────────────────────────

async function resetDns(): Promise<void> {
  // dnsRecords has ON DELETE CASCADE, but we delete both to be explicit.
  await db.delete(dnsRecords);
  await db.delete(dnsZones);
}

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

interface FakeFetchOptions {
  zoneName: string;
  zoneId: string;
  records: CloudflareRecord[];
  /** When set, both Cloudflare endpoints return this HTTP status. */
  forceStatus?: number;
}

function makeFakeFetch(opts: FakeFetchOptions): {
  calls: FetchCall[];
  fn: typeof fetch;
} {
  const calls: FetchCall[] = [];
  const fn = (async (input: unknown, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : String(input);
    calls.push({ url, init });

    if (opts.forceStatus !== undefined) {
      return new Response("forbidden", { status: opts.forceStatus });
    }

    if (url.includes("/zones?name=")) {
      const body = {
        success: true,
        errors: [],
        result: [{ id: opts.zoneId, name: opts.zoneName }],
      };
      return new Response(JSON.stringify(body), { status: 200 });
    }
    if (url.includes(`/zones/${opts.zoneId}/dns_records`)) {
      const body = {
        success: true,
        errors: [],
        result: opts.records,
      };
      return new Response(JSON.stringify(body), { status: 200 });
    }

    return new Response("unexpected", { status: 404 });
  }) as unknown as typeof fetch;

  return { calls, fn };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("importFromCloudflare — happy path", () => {
  beforeEach(async () => {
    await resetDns();
  });

  test("creates the zone, inserts supported records, bumps the serial", async () => {
    const records: CloudflareRecord[] = [
      { type: "A", name: "crontech.ai", content: "203.0.113.10", ttl: 300 },
      { type: "A", name: "www.crontech.ai", content: "203.0.113.11", ttl: 300 },
      {
        type: "MX",
        name: "crontech.ai",
        content: "mx1.crontech.ai",
        ttl: 3600,
        priority: 10,
      },
      { type: "TXT", name: "crontech.ai", content: "v=spf1 -all", ttl: 300 },
    ];

    const fake = makeFakeFetch({
      zoneName: "crontech.ai",
      zoneId: "cf_zone_abc",
      records,
    });

    const summary = await importFromCloudflare(
      { apiToken: "cf_token_xyz", zoneName: "crontech.ai" },
      { fetchImpl: fake.fn, now: () => 1_700_000_000_000 },
    );

    expect(summary.imported).toBe(4);
    expect(summary.skipped).toBe(0);
    expect(summary.errors).toEqual([]);
    expect(summary.zoneName).toBe("crontech.ai");

    // Zone row exists, serial was bumped from 1 -> 2 at the end.
    const zoneRows = await db
      .select()
      .from(dnsZones)
      .where(eq(dnsZones.name, "crontech.ai"));
    expect(zoneRows.length).toBe(1);
    expect(zoneRows[0]!.serial).toBe(2);
    // Defaults were synthesised.
    expect(zoneRows[0]!.adminEmail.length).toBeGreaterThan(0);
    expect(zoneRows[0]!.primaryNs.length).toBeGreaterThan(0);

    // All four records landed with their Cloudflare fields intact.
    const rows = await db
      .select()
      .from(dnsRecords)
      .where(eq(dnsRecords.zoneId, summary.zoneId));
    expect(rows.length).toBe(4);

    const mx = rows.find((r) => r.type === "MX");
    expect(mx).toBeDefined();
    expect(mx!.priority).toBe(10);
    expect(mx!.content).toBe("mx1.crontech.ai");
    expect(mx!.ttl).toBe(3600);

    // First call should hit /zones?name=..., second /zones/<id>/dns_records
    expect(fake.calls.length).toBe(2);
    expect(fake.calls[0]!.url).toContain("/zones?name=crontech.ai");
    expect(fake.calls[1]!.url).toContain("/zones/cf_zone_abc/dns_records");
    // Bearer auth on every call.
    for (const call of fake.calls) {
      const headers = call.init?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer cf_token_xyz");
    }
  });
});

describe("importFromCloudflare — dedupe", () => {
  beforeEach(async () => {
    await resetDns();
  });

  test("second run with the same records imports nothing new", async () => {
    const records: CloudflareRecord[] = [
      { type: "A", name: "gluecron.com", content: "203.0.113.20", ttl: 300 },
      {
        type: "CNAME",
        name: "www.gluecron.com",
        content: "gluecron.com",
        ttl: 300,
      },
    ];
    const fake = makeFakeFetch({
      zoneName: "gluecron.com",
      zoneId: "cf_zone_glue",
      records,
    });

    const first = await importFromCloudflare(
      { apiToken: "tok", zoneName: "gluecron.com" },
      { fetchImpl: fake.fn },
    );
    expect(first.imported).toBe(2);
    expect(first.skipped).toBe(0);

    const second = await importFromCloudflare(
      { apiToken: "tok", zoneName: "gluecron.com" },
      { fetchImpl: fake.fn },
    );
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(2);
    expect(second.zoneId).toBe(first.zoneId);

    // Only the original 2 rows exist.
    const rows = await db
      .select()
      .from(dnsRecords)
      .where(eq(dnsRecords.zoneId, first.zoneId));
    expect(rows.length).toBe(2);

    // Serial bumped once for the first import (1 -> 2) and NOT again on
    // the second run because nothing was imported.
    const zoneRows = await db
      .select()
      .from(dnsZones)
      .where(eq(dnsZones.id, first.zoneId));
    expect(zoneRows[0]!.serial).toBe(2);
  });
});

describe("importFromCloudflare — unsupported types", () => {
  beforeEach(async () => {
    await resetDns();
  });

  test("skips Cloudflare-specific record types we don't support", async () => {
    const records: CloudflareRecord[] = [
      { type: "A", name: "alecrae.com", content: "203.0.113.30", ttl: 300 },
      // These are Cloudflare-internal pseudo-types the engine can't host.
      { type: "PAGERULE", name: "alecrae.com", content: "cache everything" },
      { type: "WORKERS", name: "api.alecrae.com", content: "some-worker" },
    ];
    const fake = makeFakeFetch({
      zoneName: "alecrae.com",
      zoneId: "cf_zone_alec",
      records,
    });

    const summary = await importFromCloudflare(
      { apiToken: "tok", zoneName: "alecrae.com" },
      { fetchImpl: fake.fn },
    );
    expect(summary.imported).toBe(1);
    expect(summary.skipped).toBe(2);

    const rows = await db
      .select()
      .from(dnsRecords)
      .where(
        and(
          eq(dnsRecords.zoneId, summary.zoneId),
          eq(dnsRecords.type, "A"),
        ),
      );
    expect(rows.length).toBe(1);
  });
});

describe("importFromCloudflare — auth failure", () => {
  beforeEach(async () => {
    await resetDns();
  });

  test("403 from Cloudflare surfaces as UNAUTHORIZED", async () => {
    const fake = makeFakeFetch({
      zoneName: "crontech.ai",
      zoneId: "irrelevant",
      records: [],
      forceStatus: 403,
    });

    let threw = false;
    try {
      await importFromCloudflare(
        { apiToken: "bad_token", zoneName: "crontech.ai" },
        { fetchImpl: fake.fn },
      );
    } catch (err) {
      threw = true;
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain("Cloudflare rejected the API token");
    }
    expect(threw).toBe(true);

    // No zone row was created on auth failure.
    const rows = await db.select().from(dnsZones);
    expect(rows.length).toBe(0);
  });
});

describe("importFromCloudflare — dry run", () => {
  beforeEach(async () => {
    await resetDns();
  });

  test("dryRun=true reports what would happen without writing", async () => {
    const records: CloudflareRecord[] = [
      { type: "A", name: "crontech.ai", content: "203.0.113.99", ttl: 300 },
    ];
    const fake = makeFakeFetch({
      zoneName: "crontech.ai",
      zoneId: "cf_zone_dry",
      records,
    });

    const summary = await importFromCloudflare(
      { apiToken: "tok", zoneName: "crontech.ai", dryRun: true },
      { fetchImpl: fake.fn },
    );
    expect(summary.imported).toBe(1);
    expect(summary.dryRun).toBe(true);

    const zones = await db.select().from(dnsZones);
    expect(zones.length).toBe(0);
    const rows = await db.select().from(dnsRecords);
    expect(rows.length).toBe(0);
  });
});
