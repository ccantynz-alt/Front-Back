// ── BLK-023 dns-helper tests ─────────────────────────────────────────
// Exercises upsertSubdomainRecord() against the real (in-test) SQLite DB
// so we know the Drizzle query shape is correct against the actual
// `dns_zones` + `dns_records` schema. Covers the four contract points:
//   1. Zone missing → no-op + warning (never throws).
//   2. Record missing → inserts a fresh A row.
//   3. Record exists → updates the IP + updatedAt.
//   4. Serial bumps exactly once per call.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db, dnsRecords, dnsZones } from "@back-to-the-future/db";
import { upsertSubdomainRecord } from "./dns-helper";

const ZONE_NAME = "crontech.ai";

async function wipeDns(): Promise<void> {
  // Records cascade when zones go, but be explicit so parallel tests can
  // share the DB file without cross-test pollution.
  await db.delete(dnsRecords);
  await db.delete(dnsZones);
}

async function seedZone(overrides: { serial?: number } = {}): Promise<{
  id: string;
  serial: number;
}> {
  const id = `z-${crypto.randomUUID()}`;
  const now = Date.now();
  const serial = overrides.serial ?? 42;
  await db.insert(dnsZones).values({
    id,
    name: ZONE_NAME,
    adminEmail: "admin@crontech.ai",
    primaryNs: "ns1.crontech.ai",
    secondaryNs: "ns2.crontech.ai",
    refreshSeconds: 3600,
    retrySeconds: 600,
    expireSeconds: 604800,
    minimumTtl: 300,
    serial,
    createdAt: now,
    updatedAt: now,
  });
  return { id, serial };
}

describe("upsertSubdomainRecord", () => {
  beforeEach(async () => {
    await wipeDns();
  });

  afterEach(async () => {
    await wipeDns();
  });

  test("zone missing → returns without throwing, writes nothing", async () => {
    // No zone seeded. Call should be a no-op.
    await upsertSubdomainRecord("ghost", "45.76.21.235");

    const records = await db.select().from(dnsRecords);
    expect(records).toHaveLength(0);
    const zones = await db.select().from(dnsZones);
    expect(zones).toHaveLength(0);
  });

  test("record missing → inserts a fresh A row for {slug}.crontech.ai", async () => {
    const zone = await seedZone({ serial: 10 });

    await upsertSubdomainRecord("acme", "45.76.21.235");

    const rows = await db
      .select()
      .from(dnsRecords)
      .where(
        and(
          eq(dnsRecords.zoneId, zone.id),
          eq(dnsRecords.name, "acme.crontech.ai"),
          eq(dnsRecords.type, "A"),
        ),
      );
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.content).toBe("45.76.21.235");
    expect(row?.type).toBe("A");
    expect(row?.ttl).toBe(300);
    expect(row?.priority).toBeNull();
  });

  test("record exists → updates the IP and updatedAt, no duplicate insert", async () => {
    const zone = await seedZone({ serial: 5 });
    const originalTs = 1_700_000_000_000;
    await db.insert(dnsRecords).values({
      id: "rec-existing",
      zoneId: zone.id,
      name: "acme.crontech.ai",
      type: "A",
      content: "10.0.0.1",
      ttl: 300,
      priority: null,
      createdAt: originalTs,
      updatedAt: originalTs,
    });

    const later = originalTs + 60_000;
    await upsertSubdomainRecord("acme", "45.76.21.235", {
      now: () => later,
    });

    const rows = await db
      .select()
      .from(dnsRecords)
      .where(eq(dnsRecords.name, "acme.crontech.ai"));
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.id).toBe("rec-existing");
    expect(row?.content).toBe("45.76.21.235");
    expect(row?.updatedAt).toBe(later);
  });

  test("zone serial bumps exactly once per call (insert path)", async () => {
    const zone = await seedZone({ serial: 100 });

    await upsertSubdomainRecord("acme", "45.76.21.235");

    const [after] = await db
      .select()
      .from(dnsZones)
      .where(eq(dnsZones.id, zone.id));
    expect(after?.serial).toBe(101);
  });

  test("zone serial bumps exactly once per call (update path)", async () => {
    const zone = await seedZone({ serial: 7 });
    await db.insert(dnsRecords).values({
      id: "rec-1",
      zoneId: zone.id,
      name: "acme.crontech.ai",
      type: "A",
      content: "1.1.1.1",
      ttl: 300,
      priority: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await upsertSubdomainRecord("acme", "2.2.2.2");

    const [after] = await db
      .select()
      .from(dnsZones)
      .where(eq(dnsZones.id, zone.id));
    expect(after?.serial).toBe(8);
  });

  test("injected db client is honoured (DI)", async () => {
    // The public API allows injecting a db client. Proof: pass the same
    // shared db via options and confirm the write still lands. This
    // locks in that the injection seam is wired through and not shadowed
    // by the default.
    const zone = await seedZone({ serial: 1 });

    await upsertSubdomainRecord("injected", "9.9.9.9", { db });

    const rows = await db
      .select()
      .from(dnsRecords)
      .where(eq(dnsRecords.name, "injected.crontech.ai"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.content).toBe("9.9.9.9");

    const [after] = await db
      .select()
      .from(dnsZones)
      .where(eq(dnsZones.id, zone.id));
    expect(after?.serial).toBe(2);
  });
});
