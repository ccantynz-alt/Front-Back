// ── DNS server unit tests ────────────────────────────────────────────
// Covers: protocol encode/decode round-trips across every supported
// record type, header flag encoding, name compression parsing, cache
// behaviour, metrics tallies, and resolver happy/negative paths with
// a mocked ZoneStore. No sockets are bound during tests.

import { describe, expect, test } from "bun:test";
import { ResponseCache } from "./cache";
import { Metrics } from "./metrics";
import {
  type DnsMessage,
  type DnsResourceRecord,
  OpCode,
  RCode,
  RecordClass,
  RecordType,
  buildResponse,
  decodeMessage,
  encodeMessage,
} from "./protocol";
import {
  Resolver,
  type ZoneStore,
  type ZoneStoreRecord,
  DEFAULT_TTL_SECONDS,
} from "./resolver";

// ── Test helpers ────────────────────────────────────────────────────

function makeQuery(name: string, type: RecordType, id = 0x1234): DnsMessage {
  return {
    header: {
      id,
      qr: false,
      opcode: OpCode.QUERY,
      aa: false,
      tc: false,
      rd: true,
      ra: false,
      z: 0,
      rcode: RCode.NOERROR,
      qdcount: 1,
      ancount: 0,
      nscount: 0,
      arcount: 0,
    },
    questions: [{ name, type, class: RecordClass.IN }],
    answers: [],
    authorities: [],
    additionals: [],
  };
}

function rr(
  name: string,
  data: DnsResourceRecord["data"],
  ttl = 300,
): DnsResourceRecord {
  return { name, class: RecordClass.IN, ttl, data };
}

class InMemoryStore implements ZoneStore {
  constructor(
    private readonly zones: Set<string>,
    private readonly records: Map<string, ZoneStoreRecord[]>,
  ) {}

  async findRecords(name: string, type: RecordType): Promise<ZoneStoreRecord[]> {
    const bucket = this.records.get(name.toLowerCase()) ?? [];
    return bucket.filter((r) => r.type === type);
  }

  async findZoneApex(name: string): Promise<string | undefined> {
    const lower = name.toLowerCase();
    let candidate = lower;
    while (candidate.length > 0) {
      if (this.zones.has(candidate)) return candidate;
      const dot = candidate.indexOf(".");
      if (dot === -1) return undefined;
      candidate = candidate.slice(dot + 1);
    }
    return undefined;
  }

  async hasName(name: string): Promise<boolean> {
    return this.records.has(name.toLowerCase());
  }
}

function store(
  zones: string[],
  records: Record<string, ZoneStoreRecord[]>,
): InMemoryStore {
  const lowered = new Map<string, ZoneStoreRecord[]>();
  for (const [k, v] of Object.entries(records)) lowered.set(k.toLowerCase(), v);
  return new InMemoryStore(new Set(zones.map((z) => z.toLowerCase())), lowered);
}

// ── Protocol: header flags round-trip ───────────────────────────────

describe("protocol: header", () => {
  test("round-trips a full-flag response header", () => {
    const msg: DnsMessage = {
      header: {
        id: 0xbeef,
        qr: true,
        opcode: OpCode.QUERY,
        aa: true,
        tc: false,
        rd: true,
        ra: true,
        z: 0,
        rcode: RCode.NXDOMAIN,
        qdcount: 0,
        ancount: 0,
        nscount: 0,
        arcount: 0,
      },
      questions: [],
      answers: [],
      authorities: [],
      additionals: [],
    };
    const encoded = encodeMessage(msg);
    const decoded = decodeMessage(encoded);
    expect(decoded.header.id).toBe(0xbeef);
    expect(decoded.header.qr).toBe(true);
    expect(decoded.header.aa).toBe(true);
    expect(decoded.header.rd).toBe(true);
    expect(decoded.header.ra).toBe(true);
    expect(decoded.header.rcode).toBe(RCode.NXDOMAIN);
  });

  test("round-trips a minimal query header", () => {
    const q = makeQuery("example.com", RecordType.A);
    const decoded = decodeMessage(encodeMessage(q));
    expect(decoded.header.qr).toBe(false);
    expect(decoded.header.rd).toBe(true);
    expect(decoded.questions).toHaveLength(1);
    expect(decoded.questions[0]?.name).toBe("example.com");
    expect(decoded.questions[0]?.type).toBe(RecordType.A);
  });
});

// ── Protocol: every supported RR type round-trips ───────────────────

describe("protocol: RR round-trips", () => {
  const cases: Array<{ name: string; rr: DnsResourceRecord }> = [
    {
      name: "A",
      rr: rr("example.com", { type: RecordType.A, address: "93.184.216.34" }),
    },
    {
      name: "AAAA",
      rr: rr("example.com", {
        type: RecordType.AAAA,
        address: "2606:2800:220:1:248:1893:25c8:1946",
      }),
    },
    {
      name: "AAAA fully expanded",
      rr: rr("v6.example.com", {
        type: RecordType.AAAA,
        address: "0:0:0:0:0:0:0:1",
      }),
    },
    {
      name: "CNAME",
      rr: rr("www.example.com", {
        type: RecordType.CNAME,
        target: "example.com",
      }),
    },
    {
      name: "NS",
      rr: rr("example.com", { type: RecordType.NS, target: "ns1.example.com" }),
    },
    {
      name: "MX",
      rr: rr("example.com", {
        type: RecordType.MX,
        preference: 10,
        exchange: "mail.example.com",
      }),
    },
    {
      name: "TXT single",
      rr: rr("example.com", {
        type: RecordType.TXT,
        strings: ["v=spf1 -all"],
      }),
    },
    {
      name: "TXT multi",
      rr: rr("example.com", {
        type: RecordType.TXT,
        strings: ["part-one", "part-two", "third"],
      }),
    },
    {
      name: "SOA",
      rr: rr("example.com", {
        type: RecordType.SOA,
        mname: "ns1.example.com",
        rname: "hostmaster.example.com",
        serial: 2026041801,
        refresh: 7200,
        retry: 3600,
        expire: 1209600,
        minimum: 300,
      }),
    },
  ];

  for (const c of cases) {
    test(`${c.name}`, () => {
      const req = makeQuery(c.rr.name, c.rr.data.type);
      const resp = buildResponse(req, { answers: [c.rr] });
      const decoded = decodeMessage(encodeMessage(resp));
      expect(decoded.answers).toHaveLength(1);
      expect(decoded.answers[0]).toEqual(c.rr);
    });
  }
});

describe("protocol: IPv6 shorthand", () => {
  test("accepts '::' compression on encode and expands on decode", () => {
    const req = makeQuery("v6.example.com", RecordType.AAAA);
    const resp = buildResponse(req, {
      answers: [rr("v6.example.com", { type: RecordType.AAAA, address: "::1" })],
    });
    const decoded = decodeMessage(encodeMessage(resp));
    const data = decoded.answers[0]?.data;
    expect(data?.type).toBe(RecordType.AAAA);
    if (data?.type === RecordType.AAAA) {
      expect(data.address).toBe("0:0:0:0:0:0:0:1");
    }
  });

  test("accepts '2001:db8::1' mixed form on encode", () => {
    const req = makeQuery("v6.example.com", RecordType.AAAA);
    const resp = buildResponse(req, {
      answers: [rr("v6.example.com", { type: RecordType.AAAA, address: "2001:db8::1" })],
    });
    const decoded = decodeMessage(encodeMessage(resp));
    const data = decoded.answers[0]?.data;
    if (data?.type === RecordType.AAAA) {
      expect(data.address).toBe("2001:db8:0:0:0:0:0:1");
    }
  });
});

describe("protocol: encoding guards", () => {
  test("rejects invalid IPv4 address", () => {
    const req = makeQuery("bad.example.com", RecordType.A);
    const resp = buildResponse(req, {
      answers: [rr("bad.example.com", { type: RecordType.A, address: "999.1.2.3" })],
    });
    expect(() => encodeMessage(resp)).toThrow();
  });

  test("rejects overlong label", () => {
    const req = makeQuery("example.com", RecordType.A);
    const longLabel = "a".repeat(64);
    const resp = buildResponse(req, {
      answers: [rr(`${longLabel}.example.com`, { type: RecordType.A, address: "1.2.3.4" })],
    });
    expect(() => encodeMessage(resp)).toThrow();
  });
});

// ── Cache behaviour ─────────────────────────────────────────────────

describe("cache", () => {
  test("hits while fresh, expires after TTL", () => {
    let nowMs = 1_000_000;
    const cache = new ResponseCache({ now: () => nowMs });
    const key = ResponseCache.key("example.com", RecordType.A, RecordClass.IN);
    cache.set(key, new Uint8Array([1, 2, 3]), 60);

    expect(cache.get(key)).toEqual(new Uint8Array([1, 2, 3]));
    nowMs += 59_000;
    expect(cache.get(key)).toEqual(new Uint8Array([1, 2, 3]));
    nowMs += 2_000;
    expect(cache.get(key)).toBeUndefined();
    expect(cache.stats().expirations).toBe(1);
  });

  test("evicts oldest entry on overflow", () => {
    const cache = new ResponseCache({ maxEntries: 2 });
    cache.set("a", new Uint8Array([1]), 60);
    cache.set("b", new Uint8Array([2]), 60);
    cache.set("c", new Uint8Array([3]), 60);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toEqual(new Uint8Array([2]));
    expect(cache.get("c")).toEqual(new Uint8Array([3]));
    expect(cache.stats().evictions).toBe(1);
  });

  test("touching key refreshes LRU position", () => {
    const cache = new ResponseCache({ maxEntries: 2 });
    cache.set("a", new Uint8Array([1]), 60);
    cache.set("b", new Uint8Array([2]), 60);
    // Touch 'a' so 'b' becomes the oldest.
    cache.get("a");
    cache.set("c", new Uint8Array([3]), 60);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toEqual(new Uint8Array([1]));
  });
});

// ── Metrics ─────────────────────────────────────────────────────────

describe("metrics", () => {
  test("records queries, types, rcodes, latency", () => {
    const m = new Metrics();
    m.recordQuery(RecordType.A, RCode.NOERROR, 1.2, false);
    m.recordQuery(RecordType.AAAA, RCode.NXDOMAIN, 3.4, false);
    m.recordQuery(RecordType.A, RCode.NOERROR, 0.5, true);

    const snap = m.snapshot();
    expect(snap.queriesTotal).toBe(3);
    expect(snap.cacheHitsTotal).toBe(1);
    expect(snap.byType["A"]).toBe(2);
    expect(snap.byType["AAAA"]).toBe(1);
    expect(snap.byRcode[String(RCode.NOERROR)]).toBe(2);
    expect(snap.byRcode[String(RCode.NXDOMAIN)]).toBe(1);
    expect(snap.latencyCount).toBe(3);
    expect(snap.latencySumMs).toBeCloseTo(5.1, 5);
  });
});

// ── Resolver happy paths ────────────────────────────────────────────

describe("resolver: happy paths", () => {
  const zoneStore = store(
    ["example.com"],
    {
      "example.com": [
        {
          name: "example.com",
          type: RecordType.A,
          ttl: 300,
          data: { type: RecordType.A, address: "93.184.216.34" },
        },
        {
          name: "example.com",
          type: RecordType.MX,
          ttl: 600,
          data: { type: RecordType.MX, preference: 10, exchange: "mail.example.com" },
        },
        {
          name: "example.com",
          type: RecordType.SOA,
          ttl: 3600,
          data: {
            type: RecordType.SOA,
            mname: "ns1.example.com",
            rname: "hostmaster.example.com",
            serial: 1,
            refresh: 7200,
            retry: 3600,
            expire: 1209600,
            minimum: 300,
          },
        },
      ],
      "www.example.com": [
        {
          name: "www.example.com",
          type: RecordType.CNAME,
          ttl: 120,
          data: { type: RecordType.CNAME, target: "example.com" },
        },
      ],
      "alias.example.com": [
        {
          name: "alias.example.com",
          type: RecordType.A,
          data: { type: RecordType.A, address: "10.0.0.1" },
        },
      ],
    },
  );

  const resolver = new Resolver(zoneStore);

  test("resolves A record", async () => {
    const req = makeQuery("example.com", RecordType.A);
    const result = await resolver.resolve(req);
    expect(result.rcode).toBe(RCode.NOERROR);
    expect(result.response.header.aa).toBe(true);
    expect(result.response.answers).toHaveLength(1);
    const data = result.response.answers[0]?.data;
    expect(data?.type).toBe(RecordType.A);
    if (data?.type === RecordType.A) expect(data.address).toBe("93.184.216.34");
    expect(result.minTtl).toBe(300);
    expect(result.cacheable).toBe(true);
  });

  test("resolves MX record", async () => {
    const req = makeQuery("example.com", RecordType.MX);
    const result = await resolver.resolve(req);
    expect(result.response.answers).toHaveLength(1);
    const data = result.response.answers[0]?.data;
    expect(data?.type).toBe(RecordType.MX);
    if (data?.type === RecordType.MX) {
      expect(data.preference).toBe(10);
      expect(data.exchange).toBe("mail.example.com");
    }
  });

  test("chases CNAME and returns both CNAME + final A", async () => {
    const req = makeQuery("www.example.com", RecordType.A);
    const result = await resolver.resolve(req);
    expect(result.rcode).toBe(RCode.NOERROR);
    expect(result.response.answers.length).toBeGreaterThanOrEqual(2);
    expect(result.response.answers[0]?.data.type).toBe(RecordType.CNAME);
    expect(result.response.answers[1]?.data.type).toBe(RecordType.A);
  });

  test("applies default TTL when record omits it", async () => {
    const req = makeQuery("alias.example.com", RecordType.A);
    const result = await resolver.resolve(req);
    expect(result.response.answers[0]?.ttl).toBe(DEFAULT_TTL_SECONDS);
  });
});

// ── Resolver negative paths ─────────────────────────────────────────

describe("resolver: negative paths", () => {
  const s = store(
    ["example.com"],
    {
      "example.com": [
        {
          name: "example.com",
          type: RecordType.A,
          data: { type: RecordType.A, address: "1.2.3.4" },
        },
        {
          name: "example.com",
          type: RecordType.SOA,
          data: {
            type: RecordType.SOA,
            mname: "ns1.example.com",
            rname: "hostmaster.example.com",
            serial: 1,
            refresh: 7200,
            retry: 3600,
            expire: 1209600,
            minimum: 300,
          },
        },
      ],
    },
  );
  const resolver = new Resolver(s);

  test("NXDOMAIN for unknown name inside hosted zone", async () => {
    const req = makeQuery("missing.example.com", RecordType.A);
    const result = await resolver.resolve(req);
    expect(result.rcode).toBe(RCode.NXDOMAIN);
    expect(result.response.answers).toHaveLength(0);
    expect(result.response.authorities).toHaveLength(1);
    expect(result.response.authorities[0]?.data.type).toBe(RecordType.SOA);
  });

  test("NOERROR + empty answer for existing name, missing type", async () => {
    const req = makeQuery("example.com", RecordType.AAAA);
    const result = await resolver.resolve(req);
    expect(result.rcode).toBe(RCode.NOERROR);
    expect(result.response.answers).toHaveLength(0);
    expect(result.response.authorities[0]?.data.type).toBe(RecordType.SOA);
  });

  test("REFUSED for zones we do not host", async () => {
    const req = makeQuery("someone-elses.tld", RecordType.A);
    const result = await resolver.resolve(req);
    expect(result.rcode).toBe(RCode.REFUSED);
    expect(result.response.header.aa).toBe(false);
  });

  test("NOTIMP for non-IN class", async () => {
    const req = makeQuery("example.com", RecordType.A);
    req.questions[0]!.class = RecordClass.ANY;
    const result = await resolver.resolve(req);
    expect(result.rcode).toBe(RCode.NOTIMP);
  });

  test("FORMERR when no question present", async () => {
    const req = makeQuery("example.com", RecordType.A);
    req.questions = [];
    req.header.qdcount = 0;
    const result = await resolver.resolve(req);
    expect(result.rcode).toBe(RCode.FORMERR);
  });
});

// ── Server module surface (importability check) ─────────────────────

describe("server: module surface", () => {
  test("startDnsServer is exported", async () => {
    const mod = await import("./index");
    expect(typeof mod.startDnsServer).toBe("function");
    expect(typeof mod.Resolver).toBe("function");
    expect(typeof mod.ResponseCache).toBe("function");
    expect(typeof mod.Metrics).toBe("function");
    expect(mod.RecordType.A).toBe(1);
  });
});
