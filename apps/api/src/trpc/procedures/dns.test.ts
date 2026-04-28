// ── DNS Procedure Tests (BLK-023) ───────────────────────────────────
// Validates the admin-only DNS router end-to-end against a real (but
// isolated) SQLite database. The test preload in `apps/api/test/setup.ts`
// wipes and re-migrates the local DB before the suite loads, so we can
// treat it as a fresh, mocked-DB equivalent for each run.
//
// Coverage contract (per the BLK-023 brief):
//   1. adminProcedure guard — non-admins are rejected.
//   2. createZone seeds default SOA + NS records.
//   3. A record content: IPv4 valid, non-IPv4 rejected.
//   4. MX without priority is rejected.
//   5. CNAME pointing at an IP is rejected.
//   6. Record create → update → delete each bump the zone serial.
//   7. bulkImport is all-or-nothing and bumps the serial exactly once.

import { afterEach, describe, expect, test } from "bun:test";
import { db, dnsRecords, dnsZones, scopedDb, sessions, users } from "@back-to-the-future/db";
import { eq } from "drizzle-orm";
import { createSession } from "../../auth/session";
import type { TRPCContext } from "../context";
import { appRouter } from "../router";

function ctxFor(userId: string, sessionToken: string): TRPCContext {
  return {
    db,
    userId,
    sessionToken,
    csrfToken: null,
    serviceKey: null,
    scopedDb: scopedDb(db, userId),
  };
}

async function createUser(role: "admin" | "viewer"): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: `dns-${role}-${Date.now()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 6)}@example.com`,
    displayName: `DNS Test ${role}`,
    role,
  });
  return id;
}

async function cleanupUser(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

async function getSerial(zoneId: string): Promise<number> {
  const rows = await db
    .select({ serial: dnsZones.serial })
    .from(dnsZones)
    .where(eq(dnsZones.id, zoneId))
    .limit(1);
  return rows[0]?.serial ?? -1;
}

describe("dns router", () => {
  const createdUsers: string[] = [];
  const createdZones: string[] = [];

  afterEach(async () => {
    for (const zoneId of createdZones.splice(0)) {
      await db.delete(dnsRecords).where(eq(dnsRecords.zoneId, zoneId));
      await db.delete(dnsZones).where(eq(dnsZones.id, zoneId));
    }
    for (const id of createdUsers.splice(0)) await cleanupUser(id);
  });

  // ── Auth guard ──────────────────────────────────────────────────

  test("non-admin callers get FORBIDDEN on listZones", async () => {
    const userId = await createUser("viewer");
    createdUsers.push(userId);
    const token = await createSession(userId, db);
    const caller = appRouter.createCaller(ctxFor(userId, token));

    let threw = false;
    try {
      await caller.dns.listZones();
    } catch (err) {
      threw = true;
      const code = (err as { code?: string }).code;
      expect(code).toBe("FORBIDDEN");
    }
    expect(threw).toBe(true);
  });

  test("unauthenticated callers get UNAUTHORIZED", async () => {
    const anon = appRouter.createCaller({
      db,
      userId: null,
      sessionToken: null,
      csrfToken: null,
      serviceKey: null,
      scopedDb: null,
    });
    let threw = false;
    try {
      await anon.dns.listZones();
    } catch (err) {
      threw = true;
      const code = (err as { code?: string }).code;
      expect(code).toBe("UNAUTHORIZED");
    }
    expect(threw).toBe(true);
  });

  // ── Shared admin setup ──────────────────────────────────────────

  async function adminCaller(): Promise<ReturnType<typeof appRouter.createCaller>> {
    const userId = await createUser("admin");
    createdUsers.push(userId);
    const token = await createSession(userId, db);
    return appRouter.createCaller(ctxFor(userId, token));
  }

  // ── createZone seeds defaults ───────────────────────────────────

  test("createZone seeds default SOA + NS records and lowercases the name", async () => {
    const caller = await adminCaller();
    const out = await caller.dns.createZone({
      name: "  ExAmPlE.Com  ",
      adminEmail: "admin@example.com",
      primaryNs: "NS1.Example.Com",
      secondaryNs: "ns2.example.com",
    });
    createdZones.push(out.id);

    expect(out.name).toBe("example.com");

    const zoneAndRecords = await caller.dns.getZone({ id: out.id });
    expect(zoneAndRecords.zone.name).toBe("example.com");
    expect(zoneAndRecords.zone.primaryNs).toBe("ns1.example.com");
    expect(zoneAndRecords.zone.secondaryNs).toBe("ns2.example.com");

    const types = zoneAndRecords.records.map((r) => r.type).sort();
    // SOA + 2 NS records
    expect(types).toEqual(["NS", "NS", "SOA"]);

    const soa = zoneAndRecords.records.find((r) => r.type === "SOA");
    expect(soa?.content).toContain("ns1.example.com");
  });

  test("createZone rejects an invalid zone name", async () => {
    const caller = await adminCaller();
    let threw = false;
    try {
      await caller.dns.createZone({
        name: "not a valid hostname!",
        adminEmail: "admin@example.com",
        primaryNs: "ns1.example.com",
      });
    } catch (err) {
      threw = true;
      expect((err as Error).message).toContain("hostname");
    }
    expect(threw).toBe(true);
  });

  // ── Record validation ──────────────────────────────────────────

  test("createRecord accepts a valid A record", async () => {
    const caller = await adminCaller();
    const zone = await caller.dns.createZone({
      name: "a-record.test",
      adminEmail: "admin@a-record.test",
      primaryNs: "ns1.a-record.test",
    });
    createdZones.push(zone.id);

    const rec = await caller.dns.createRecord({
      zoneId: zone.id,
      name: "www",
      type: "A",
      content: "203.0.113.42",
    });
    expect(rec.id).toBeTruthy();
  });

  test("createRecord rejects an A record with an invalid IP", async () => {
    const caller = await adminCaller();
    const zone = await caller.dns.createZone({
      name: "bad-a.test",
      adminEmail: "admin@bad-a.test",
      primaryNs: "ns1.bad-a.test",
    });
    createdZones.push(zone.id);

    let threw = false;
    try {
      await caller.dns.createRecord({
        zoneId: zone.id,
        name: "www",
        type: "A",
        content: "not-an-ip",
      });
    } catch (err) {
      threw = true;
      expect((err as Error).message).toContain("IPv4");
    }
    expect(threw).toBe(true);
  });

  test("createRecord rejects an A record given an IPv6 address", async () => {
    const caller = await adminCaller();
    const zone = await caller.dns.createZone({
      name: "mix-a.test",
      adminEmail: "admin@mix-a.test",
      primaryNs: "ns1.mix-a.test",
    });
    createdZones.push(zone.id);

    let threw = false;
    try {
      await caller.dns.createRecord({
        zoneId: zone.id,
        name: "www",
        type: "A",
        content: "2001:db8::1",
      });
    } catch (err) {
      threw = true;
      expect((err as Error).message).toContain("IPv4");
    }
    expect(threw).toBe(true);
  });

  test("createRecord accepts a valid AAAA record", async () => {
    const caller = await adminCaller();
    const zone = await caller.dns.createZone({
      name: "aaaa.test",
      adminEmail: "admin@aaaa.test",
      primaryNs: "ns1.aaaa.test",
    });
    createdZones.push(zone.id);

    const rec = await caller.dns.createRecord({
      zoneId: zone.id,
      name: "www",
      type: "AAAA",
      content: "2001:db8::1",
    });
    expect(rec.id).toBeTruthy();
  });

  test("createRecord rejects MX without priority", async () => {
    const caller = await adminCaller();
    const zone = await caller.dns.createZone({
      name: "mx-no-pri.test",
      adminEmail: "admin@mx-no-pri.test",
      primaryNs: "ns1.mx-no-pri.test",
    });
    createdZones.push(zone.id);

    let threw = false;
    try {
      await caller.dns.createRecord({
        zoneId: zone.id,
        name: "@",
        type: "MX",
        content: "mail.mx-no-pri.test",
      });
    } catch (err) {
      threw = true;
      expect((err as Error).message).toContain("priority");
    }
    expect(threw).toBe(true);
  });

  test("createRecord accepts MX with priority", async () => {
    const caller = await adminCaller();
    const zone = await caller.dns.createZone({
      name: "mx-ok.test",
      adminEmail: "admin@mx-ok.test",
      primaryNs: "ns1.mx-ok.test",
    });
    createdZones.push(zone.id);

    const rec = await caller.dns.createRecord({
      zoneId: zone.id,
      name: "@",
      type: "MX",
      content: "mail.mx-ok.test",
      priority: 10,
    });
    expect(rec.id).toBeTruthy();
  });

  test("createRecord rejects CNAME pointing at an IP", async () => {
    const caller = await adminCaller();
    const zone = await caller.dns.createZone({
      name: "cname.test",
      adminEmail: "admin@cname.test",
      primaryNs: "ns1.cname.test",
    });
    createdZones.push(zone.id);

    let threw = false;
    try {
      await caller.dns.createRecord({
        zoneId: zone.id,
        name: "alias",
        type: "CNAME",
        content: "203.0.113.42",
      });
    } catch (err) {
      threw = true;
      expect((err as Error).message).toContain("hostname");
    }
    expect(threw).toBe(true);
  });

  test("createRecord rejects TXT chunks longer than 255 chars", async () => {
    const caller = await adminCaller();
    const zone = await caller.dns.createZone({
      name: "txt.test",
      adminEmail: "admin@txt.test",
      primaryNs: "ns1.txt.test",
    });
    createdZones.push(zone.id);

    let threw = false;
    try {
      await caller.dns.createRecord({
        zoneId: zone.id,
        name: "long",
        type: "TXT",
        content: "x".repeat(256),
      });
    } catch (err) {
      threw = true;
      expect((err as Error).message).toContain("255");
    }
    expect(threw).toBe(true);
  });

  test("createRecord lowercases the record name", async () => {
    const caller = await adminCaller();
    const zone = await caller.dns.createZone({
      name: "lower.test",
      adminEmail: "admin@lower.test",
      primaryNs: "ns1.lower.test",
    });
    createdZones.push(zone.id);

    const rec = await caller.dns.createRecord({
      zoneId: zone.id,
      name: "  WwW  ",
      type: "A",
      content: "203.0.113.1",
    });

    const stored = await caller.dns.getRecord({ id: rec.id });
    expect(stored.name).toBe("www");
  });

  // ── Serial bump lifecycle ───────────────────────────────────────

  test("create → update → delete each bump the zone serial", async () => {
    const caller = await adminCaller();
    const zone = await caller.dns.createZone({
      name: "serial.test",
      adminEmail: "admin@serial.test",
      primaryNs: "ns1.serial.test",
    });
    createdZones.push(zone.id);

    // Baseline — SOA + NS seed records do NOT bump the serial (they
    // land at creation time), so the zone starts at serial = 1.
    const s0 = await getSerial(zone.id);
    expect(s0).toBe(1);

    // createRecord bumps once.
    const rec = await caller.dns.createRecord({
      zoneId: zone.id,
      name: "www",
      type: "A",
      content: "203.0.113.10",
    });
    const s1 = await getSerial(zone.id);
    expect(s1).toBe(s0 + 1);

    // updateRecord bumps again.
    await caller.dns.updateRecord({
      id: rec.id,
      content: "203.0.113.11",
    });
    const s2 = await getSerial(zone.id);
    expect(s2).toBe(s1 + 1);

    // deleteRecord bumps again.
    await caller.dns.deleteRecord({ id: rec.id });
    const s3 = await getSerial(zone.id);
    expect(s3).toBe(s2 + 1);
  });

  test("updateZone bumps the zone serial", async () => {
    const caller = await adminCaller();
    const zone = await caller.dns.createZone({
      name: "zone-serial.test",
      adminEmail: "admin@zone-serial.test",
      primaryNs: "ns1.zone-serial.test",
    });
    createdZones.push(zone.id);

    const s0 = await getSerial(zone.id);
    await caller.dns.updateZone({
      id: zone.id,
      adminEmail: "hostmaster@zone-serial.test",
    });
    const s1 = await getSerial(zone.id);
    expect(s1).toBe(s0 + 1);
  });

  // ── bulkImport ──────────────────────────────────────────────────

  test("bulkImport inserts every row and bumps the serial exactly once", async () => {
    const caller = await adminCaller();
    const zone = await caller.dns.createZone({
      name: "bulk.test",
      adminEmail: "admin@bulk.test",
      primaryNs: "ns1.bulk.test",
    });
    createdZones.push(zone.id);

    const s0 = await getSerial(zone.id);
    const out = await caller.dns.bulkImport({
      zoneId: zone.id,
      records: [
        { name: "a", type: "A", content: "203.0.113.1" },
        { name: "b", type: "A", content: "203.0.113.2" },
        { name: "c", type: "AAAA", content: "2001:db8::2" },
      ],
    });
    expect(out.inserted).toBe(3);
    expect(out.ids).toHaveLength(3);

    const s1 = await getSerial(zone.id);
    expect(s1).toBe(s0 + 1);

    const records = await caller.dns.listRecords({ zoneId: zone.id });
    // 3 inserted + the 1 NS + 1 SOA seeded at zone creation = 5 total.
    // (No secondary NS was provided to createZone.)
    expect(records.length).toBe(5);
  });

  test("bulkImport rejects the entire batch if any row is invalid", async () => {
    const caller = await adminCaller();
    const zone = await caller.dns.createZone({
      name: "bulk-bad.test",
      adminEmail: "admin@bulk-bad.test",
      primaryNs: "ns1.bulk-bad.test",
    });
    createdZones.push(zone.id);

    const s0 = await getSerial(zone.id);
    let threw = false;
    try {
      await caller.dns.bulkImport({
        zoneId: zone.id,
        records: [
          { name: "good", type: "A", content: "203.0.113.1" },
          { name: "bad", type: "A", content: "not-an-ip" },
        ],
      });
    } catch (err) {
      threw = true;
      expect((err as Error).message).toContain("IPv4");
    }
    expect(threw).toBe(true);

    // Serial must NOT have moved because the batch was rejected.
    const s1 = await getSerial(zone.id);
    expect(s1).toBe(s0);

    // Neither row should have landed.
    const records = await caller.dns.listRecords({ zoneId: zone.id });
    // Only the seed records remain (SOA + NS).
    expect(records.every((r) => r.type === "SOA" || r.type === "NS")).toBe(true);
  });

  // ── deleteZone cascade ─────────────────────────────────────────

  test("deleteZone removes all records and the zone", async () => {
    const caller = await adminCaller();
    const zone = await caller.dns.createZone({
      name: "delete.test",
      adminEmail: "admin@delete.test",
      primaryNs: "ns1.delete.test",
    });

    await caller.dns.createRecord({
      zoneId: zone.id,
      name: "www",
      type: "A",
      content: "203.0.113.9",
    });

    await caller.dns.deleteZone({ id: zone.id });

    let threw = false;
    try {
      await caller.dns.getZone({ id: zone.id });
    } catch (err) {
      threw = true;
      expect((err as { code?: string }).code).toBe("NOT_FOUND");
    }
    expect(threw).toBe(true);

    const remaining = await db.select().from(dnsRecords).where(eq(dnsRecords.zoneId, zone.id));
    expect(remaining.length).toBe(0);
  });

  // ── supportedTypes convenience ─────────────────────────────────

  test("supportedTypes returns the expected set", async () => {
    const caller = await adminCaller();
    const types = await caller.dns.supportedTypes();
    expect(types).toEqual(["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SOA", "SRV", "CAA"]);
  });
});
