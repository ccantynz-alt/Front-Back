/**
 * BLK-023 — DNS end-to-end integration test.
 *
 * Proves the whole DNS pipeline: in-memory ZoneStore → Resolver → UDP
 * listener → hand-rolled `dig`-style client → correct wire-format response.
 *
 * Scenarios covered:
 *   1. A record lookup (apex + www subdomain, TTL + IP assertions)
 *   2. CNAME follow-through (CNAME + target A in the same answer section)
 *   3. NXDOMAIN for names inside a zone we own but that don't exist
 *   4. NOERROR + empty answer (AAAA query where only A exists) + SOA
 *      in the authority section (RFC 2308 negative-caching)
 *   5. Multiple A records for the same name (round-robin payload)
 *   6. SOA lookup at the zone apex
 *   7. TXT with a string > 255 bytes (multi-string chunking)
 *
 * No real network. No DB. We bind UDP on 127.0.0.1:0 (OS-ephemeral)
 * and shut down in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type DnsServer,
  type RData,
  RCode,
  type RecordType,
  RecordType as RT,
  startDnsServer,
  type ZoneStore,
  type ZoneStoreRecord,
} from "@back-to-the-future/dns-server";
import { type DnsClient, createDnsClient } from "./helpers/dns-client";

// ── Record fixtures ─────────────────────────────────────────────────
//
// Names are stored lower-case, fully-qualified, without trailing dots —
// the same normalization the real ZoneStore (Drizzle-backed) uses. See
// ZoneStore docs in services/dns-server/src/resolver.ts.

function soa(apex: string, ttl = 3600): ZoneStoreRecord {
  const data: RData = {
    type: RT.SOA,
    mname: `ns1.${apex}`,
    rname: `hostmaster.${apex}`,
    serial: 2026041801,
    refresh: 7200,
    retry: 3600,
    expire: 1209600,
    minimum: 300,
  };
  return { name: apex, type: RT.SOA, ttl, data };
}

function a(name: string, address: string, ttl = 300): ZoneStoreRecord {
  return { name, type: RT.A, ttl, data: { type: RT.A, address } };
}

function cname(name: string, target: string, ttl = 300): ZoneStoreRecord {
  return { name, type: RT.CNAME, ttl, data: { type: RT.CNAME, target } };
}

function txt(name: string, strings: string[], ttl = 300): ZoneStoreRecord {
  return { name, type: RT.TXT, ttl, data: { type: RT.TXT, strings } };
}

// ── In-memory ZoneStore ─────────────────────────────────────────────
//
// Faithful impl of the ZoneStore contract from resolver.ts. Indexes by
// (name, type) for O(1) findRecords, tracks the set of zone apices for
// findZoneApex (longest-suffix match), and keeps a set of owner names
// for hasName.

interface ZoneStoreSeed {
  apices: string[];
  records: ZoneStoreRecord[];
}

function makeStore(seed: ZoneStoreSeed): ZoneStore {
  const byNameType = new Map<string, ZoneStoreRecord[]>();
  const names = new Set<string>();
  const apices = new Set<string>(seed.apices.map((a) => a.toLowerCase()));

  for (const rr of seed.records) {
    const key = `${rr.name.toLowerCase()}|${rr.type}`;
    const bucket = byNameType.get(key);
    if (bucket === undefined) byNameType.set(key, [rr]);
    else bucket.push(rr);
    names.add(rr.name.toLowerCase());
  }

  return {
    async findRecords(name: string, type: RecordType): Promise<ZoneStoreRecord[]> {
      return byNameType.get(`${name.toLowerCase()}|${type}`) ?? [];
    },
    async findZoneApex(name: string): Promise<string | undefined> {
      const lower = name.toLowerCase();
      // Longest-suffix match: walk up label by label.
      const labels = lower.split(".");
      for (let i = 0; i < labels.length; i += 1) {
        const candidate = labels.slice(i).join(".");
        if (apices.has(candidate)) return candidate;
      }
      return undefined;
    },
    async hasName(name: string): Promise<boolean> {
      return names.has(name.toLowerCase());
    },
  };
}

// ── Suite ───────────────────────────────────────────────────────────

describe("DNS end-to-end (BLK-023)", () => {
  const zoneApex = "crontech.ai";

  // Multi-string TXT — strings > 255 bytes must be split into multiple
  // <length, data> pairs on the wire. We seed the chunks directly; the
  // protocol codec round-trips them verbatim.
  const longTxtChunkA = "A".repeat(255);
  const longTxtChunkB = "B".repeat(100);

  const seed: ZoneStoreSeed = {
    apices: [zoneApex],
    records: [
      soa(zoneApex),
      a(zoneApex, "45.76.21.235", 300),
      a(`www.${zoneApex}`, "45.76.21.235", 300),
      cname(`blog.${zoneApex}`, zoneApex, 300),
      a(`ha.${zoneApex}`, "10.0.0.1", 60),
      a(`ha.${zoneApex}`, "10.0.0.2", 60),
      txt(`txt.${zoneApex}`, [longTxtChunkA, longTxtChunkB], 300),
    ],
  };

  let server: DnsServer;
  let client: DnsClient;

  beforeAll(async () => {
    const store = makeStore(seed);
    server = await startDnsServer({
      store,
      hostname: "127.0.0.1",
      port: 0, // OS picks
      disableTcp: true, // UDP-only for this suite — the TCP path has its own tests
      logger: { log: () => {}, warn: () => {}, error: () => {} },
    });
    const boundPort = server.udpPort;
    if (boundPort === null) throw new Error("UDP listener did not bind");
    client = await createDnsClient({ host: "127.0.0.1", port: boundPort });
  });

  afterAll(async () => {
    client?.close();
    await server?.stop();
  });

  // ── 1. A record lookup ───────────────────────────────────────────
  test("A record lookup — apex + www return the correct IP + TTL", async () => {
    const apex = await client.query({ name: zoneApex, type: RT.A });
    expect(apex.header.rcode).toBe(RCode.NOERROR);
    expect(apex.header.qr).toBe(true);
    expect(apex.header.aa).toBe(true);
    expect(apex.answers).toHaveLength(1);
    const apexAns = apex.answers[0];
    if (apexAns === undefined || apexAns.data.type !== RT.A) {
      throw new Error("expected A answer at apex");
    }
    expect(apexAns.data.address).toBe("45.76.21.235");
    expect(apexAns.ttl).toBe(300);

    const www = await client.query({ name: `www.${zoneApex}`, type: RT.A });
    expect(www.header.rcode).toBe(RCode.NOERROR);
    expect(www.answers).toHaveLength(1);
    const wwwAns = www.answers[0];
    if (wwwAns === undefined || wwwAns.data.type !== RT.A) {
      throw new Error("expected A answer for www");
    }
    expect(wwwAns.data.address).toBe("45.76.21.235");
    expect(wwwAns.ttl).toBe(300);
  });

  // ── 2. CNAME follow-through ──────────────────────────────────────
  test("CNAME follow-through returns CNAME + target A in the answer", async () => {
    const res = await client.query({ name: `blog.${zoneApex}`, type: RT.A });
    expect(res.header.rcode).toBe(RCode.NOERROR);
    // blog → crontech.ai (CNAME) → 45.76.21.235 (A)
    expect(res.answers.length).toBeGreaterThanOrEqual(2);
    const types = res.answers.map((r) => r.data.type);
    expect(types).toContain(RT.CNAME);
    expect(types).toContain(RT.A);

    const cnameRec = res.answers.find((r) => r.data.type === RT.CNAME);
    if (cnameRec === undefined || cnameRec.data.type !== RT.CNAME) {
      throw new Error("expected CNAME answer");
    }
    expect(cnameRec.data.target).toBe(zoneApex);

    const aRec = res.answers.find((r) => r.data.type === RT.A);
    if (aRec === undefined || aRec.data.type !== RT.A) {
      throw new Error("expected chased A answer");
    }
    expect(aRec.data.address).toBe("45.76.21.235");
  });

  // ── 3. NXDOMAIN ──────────────────────────────────────────────────
  // NXDOMAIN is only returned when the queried name falls *inside* a
  // zone we're authoritative for. Names outside our zones come back as
  // REFUSED. We query a sub-name in crontech.ai that has no records.
  test("NXDOMAIN for a name inside our zone with no records", async () => {
    const res = await client.query({ name: `does-not-exist.${zoneApex}`, type: RT.A });
    expect(res.header.rcode).toBe(RCode.NXDOMAIN);
    expect(res.answers).toHaveLength(0);
    // Authority section should carry the SOA for negative caching.
    const hasSoa = res.authorities.some((r) => r.data.type === RT.SOA);
    expect(hasSoa).toBe(true);
  });

  // ── 4. NOERROR empty answer (wrong rrtype) ───────────────────────
  test("NOERROR + empty answer when name exists but type does not (AAAA miss)", async () => {
    const res = await client.query({ name: zoneApex, type: RT.AAAA });
    expect(res.header.rcode).toBe(RCode.NOERROR);
    expect(res.answers).toHaveLength(0);
    // RFC 2308 §2.2: NOERROR/NODATA MUST include an SOA for negative
    // caching. The resolver emits it in the authority section.
    const hasSoa = res.authorities.some((r) => r.data.type === RT.SOA);
    expect(hasSoa).toBe(true);
  });

  // ── 5. Multiple A records (round-robin payload) ──────────────────
  test("Multiple A records for the same name are all returned", async () => {
    const res = await client.query({ name: `ha.${zoneApex}`, type: RT.A });
    expect(res.header.rcode).toBe(RCode.NOERROR);
    expect(res.answers).toHaveLength(2);
    const addresses = res.answers
      .map((r) => (r.data.type === RT.A ? r.data.address : null))
      .filter((x): x is string => x !== null)
      .sort();
    expect(addresses).toEqual(["10.0.0.1", "10.0.0.2"]);
    for (const ans of res.answers) expect(ans.ttl).toBe(60);
  });

  // ── 6. SOA lookup at the apex ────────────────────────────────────
  test("SOA lookup at the zone apex returns the synthesized SOA", async () => {
    const res = await client.query({ name: zoneApex, type: RT.SOA });
    expect(res.header.rcode).toBe(RCode.NOERROR);
    expect(res.answers).toHaveLength(1);
    const ans = res.answers[0];
    if (ans === undefined || ans.data.type !== RT.SOA) {
      throw new Error("expected SOA answer");
    }
    expect(ans.name.toLowerCase()).toBe(zoneApex);
    expect(ans.data.mname).toBe(`ns1.${zoneApex}`);
    expect(ans.data.rname).toBe(`hostmaster.${zoneApex}`);
    expect(ans.data.serial).toBeGreaterThan(0);
    expect(ans.data.minimum).toBeGreaterThan(0);
  });

  // ── 7. TXT with multi-string chunking ────────────────────────────
  test("TXT record preserves multi-string chunking for strings > 255 bytes", async () => {
    const res = await client.query({ name: `txt.${zoneApex}`, type: RT.TXT });
    expect(res.header.rcode).toBe(RCode.NOERROR);
    expect(res.answers).toHaveLength(1);
    const ans = res.answers[0];
    if (ans === undefined || ans.data.type !== RT.TXT) {
      throw new Error("expected TXT answer");
    }
    // The wire format forbids individual strings > 255 bytes; the two
    // chunks we seeded must round-trip intact.
    expect(ans.data.strings).toEqual([longTxtChunkA, longTxtChunkB]);
    const joined = ans.data.strings.join("");
    expect(joined.length).toBeGreaterThan(255);
  });
});
