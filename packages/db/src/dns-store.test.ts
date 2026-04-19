// ── DNS Store Tests (BLK-023) ───────────────────────────────────────
// Exercises the Drizzle-backed `ZoneStore` against the migrated local
// SQLite database. The test preload (`./test-setup.ts`) deletes and
// re-migrates the DB before the suite runs, so every test starts from
// a known-good schema. We insert zones + records via the raw client
// and then assert the store's read paths + `bumpSerial` write path.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./client";
import {
  createDnsStore,
  type DnsRecord,
  type DnsZone,
  type RecordType,
  type ZoneStore,
} from "./dns-store";
import { dnsRecords, dnsZones } from "./schema";

// ── Fixture IDs (unique per run) ────────────────────────────────────

const RUN_ID = Date.now().toString(36);
const ZONE_A_ID = `zone-a-${RUN_ID}`;
const ZONE_B_ID = `zone-b-${RUN_ID}`;
const ZONE_A_NAME = `crontech-test-a-${RUN_ID}.ai`;
const ZONE_B_NAME = `crontech-test-b-${RUN_ID}.ai`;

const WWW_A = `www.${ZONE_A_NAME}`;
const WWW_B = `www.${ZONE_B_NAME}`;

const RECORD_IDS = [
  `rec-a-apex-${RUN_ID}`,
  `rec-a-www-${RUN_ID}`,
  `rec-a-www-v6-${RUN_ID}`,
  `rec-a-mx-${RUN_ID}`,
  `rec-b-www-${RUN_ID}`,
];

let store: ZoneStore;

// ── Setup ───────────────────────────────────────────────────────────

beforeAll(async () => {
  store = createDnsStore(db);
  const now = Date.now();

  await db.insert(dnsZones).values([
    {
      id: ZONE_A_ID,
      name: ZONE_A_NAME,
      adminEmail: `admin.${ZONE_A_NAME}`,
      primaryNs: `ns1.${ZONE_A_NAME}`,
      secondaryNs: `ns2.${ZONE_A_NAME}`,
      refreshSeconds: 3600,
      retrySeconds: 600,
      expireSeconds: 604800,
      minimumTtl: 300,
      serial: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: ZONE_B_ID,
      name: ZONE_B_NAME,
      adminEmail: `admin.${ZONE_B_NAME}`,
      primaryNs: `ns1.${ZONE_B_NAME}`,
      secondaryNs: null,
      refreshSeconds: 3600,
      retrySeconds: 600,
      expireSeconds: 604800,
      minimumTtl: 300,
      serial: 7,
      createdAt: now,
      updatedAt: now,
    },
  ]);

  await db.insert(dnsRecords).values([
    {
      id: RECORD_IDS[0]!,
      zoneId: ZONE_A_ID,
      name: ZONE_A_NAME,
      type: "A",
      content: "203.0.113.1",
      ttl: 300,
      priority: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: RECORD_IDS[1]!,
      zoneId: ZONE_A_ID,
      name: WWW_A,
      type: "A",
      content: "203.0.113.2",
      ttl: 300,
      priority: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: RECORD_IDS[2]!,
      zoneId: ZONE_A_ID,
      name: WWW_A,
      type: "AAAA",
      content: "2001:db8::1",
      ttl: 300,
      priority: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: RECORD_IDS[3]!,
      zoneId: ZONE_A_ID,
      name: ZONE_A_NAME,
      type: "MX",
      content: `mail.${ZONE_A_NAME}`,
      ttl: 300,
      priority: 10,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: RECORD_IDS[4]!,
      zoneId: ZONE_B_ID,
      name: WWW_B,
      type: "A",
      content: "203.0.113.99",
      ttl: 600,
      priority: null,
      createdAt: now,
      updatedAt: now,
    },
  ]);
});

afterAll(async () => {
  // dns_records rows are cascaded by the zone delete, but we remove them
  // explicitly first so the test doesn't depend on FK cascade semantics.
  for (const id of RECORD_IDS) {
    await db.delete(dnsRecords).where(eq(dnsRecords.id, id));
  }
  await db.delete(dnsZones).where(eq(dnsZones.id, ZONE_A_ID));
  await db.delete(dnsZones).where(eq(dnsZones.id, ZONE_B_ID));
});

// ── Tests ───────────────────────────────────────────────────────────

describe("createDnsStore → ZoneStore", () => {
  test("listZones returns the zones we inserted", async () => {
    const zones = await store.listZones();
    const names = zones.map((z: DnsZone) => z.name);
    expect(names).toContain(ZONE_A_NAME);
    expect(names).toContain(ZONE_B_NAME);
  });

  test("getZone returns the zone with SOA parameters", async () => {
    const zone = await store.getZone(ZONE_A_NAME);
    expect(zone).not.toBeNull();
    expect(zone?.id).toBe(ZONE_A_ID);
    expect(zone?.primaryNs).toBe(`ns1.${ZONE_A_NAME}`);
    expect(zone?.secondaryNs).toBe(`ns2.${ZONE_A_NAME}`);
    expect(zone?.refreshSeconds).toBe(3600);
    expect(zone?.retrySeconds).toBe(600);
    expect(zone?.expireSeconds).toBe(604800);
    expect(zone?.minimumTtl).toBe(300);
    expect(zone?.serial).toBe(1);
  });

  test("getZone maps an absent secondaryNs to null", async () => {
    const zone = await store.getZone(ZONE_B_NAME);
    expect(zone).not.toBeNull();
    expect(zone?.secondaryNs).toBeNull();
  });

  test("getZone returns null for an unknown zone", async () => {
    const zone = await store.getZone("does-not-exist.example");
    expect(zone).toBeNull();
  });

  test("findRecords returns the A record for www", async () => {
    const rows = await store.findRecords(WWW_A, "A");
    expect(rows).toHaveLength(1);
    const row = rows[0] as DnsRecord;
    expect(row.content).toBe("203.0.113.2");
    expect(row.type).toBe("A");
    expect(row.zoneId).toBe(ZONE_A_ID);
    expect(row.priority).toBeNull();
  });

  test("findRecords disambiguates by type (A vs AAAA on same name)", async () => {
    const a = await store.findRecords(WWW_A, "A");
    const aaaa = await store.findRecords(WWW_A, "AAAA");
    expect(a).toHaveLength(1);
    expect(aaaa).toHaveLength(1);
    expect(a[0]?.content).toBe("203.0.113.2");
    expect(aaaa[0]?.content).toBe("2001:db8::1");
  });

  test("findRecords returns MX priority intact", async () => {
    const rows = await store.findRecords(ZONE_A_NAME, "MX");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.priority).toBe(10);
  });

  test("findRecords returns [] for an unknown name", async () => {
    const rows = await store.findRecords("nothing.here.example", "A");
    expect(rows).toEqual([]);
  });

  test("findRecords crosses zones on the (name, type) fallback path", async () => {
    const a = await store.findRecords(WWW_A, "A");
    const b = await store.findRecords(WWW_B, "A");
    expect(a[0]?.zoneId).toBe(ZONE_A_ID);
    expect(b[0]?.zoneId).toBe(ZONE_B_ID);
  });

  test("bumpSerial increments the zone serial by one", async () => {
    const before = await store.getZone(ZONE_B_NAME);
    const baseline = before?.serial ?? 0;

    await store.bumpSerial(ZONE_B_ID);

    const after = await store.getZone(ZONE_B_NAME);
    expect(after?.serial).toBe(baseline + 1);
  });

  test("bumpSerial is monotonic across repeated calls", async () => {
    const before = await store.getZone(ZONE_A_NAME);
    const baseline = before?.serial ?? 0;

    await store.bumpSerial(ZONE_A_ID);
    await store.bumpSerial(ZONE_A_ID);
    await store.bumpSerial(ZONE_A_ID);

    const after = await store.getZone(ZONE_A_NAME);
    expect(after?.serial).toBe(baseline + 3);
  });

  test("RecordType union accepts every supported type", () => {
    // Compile-time exhaustiveness — if a type is removed from the union
    // this array will fail to type-check.
    const all: RecordType[] = [
      "A",
      "AAAA",
      "CNAME",
      "MX",
      "TXT",
      "NS",
      "SOA",
      "SRV",
      "CAA",
    ];
    expect(all).toHaveLength(9);
  });
});
