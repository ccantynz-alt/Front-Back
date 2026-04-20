// ── BLK-025 Domain Search: Availability Unit Tests ─────────────────

import { describe, test, expect } from "bun:test";
import {
  checkAvailability,
  normaliseLabel,
  normaliseTld,
  onlyAvailable,
  DEFAULT_TLDS,
  type SoaResolver,
  type DomainResult,
} from "./availability";

function resolverFrom(
  taken: ReadonlySet<string>,
  unknown: ReadonlySet<string> = new Set(),
): SoaResolver {
  return {
    async resolveSoa(name: string): Promise<unknown> {
      if (unknown.has(name)) throw new Error("SERVFAIL upstream");
      if (taken.has(name)) return { nsname: "ns1.example." };
      const err = new Error("ENOTFOUND") as Error & { code: string };
      err.code = "ENOTFOUND";
      throw err;
    },
  };
}

describe("normaliseLabel", () => {
  test("accepts bare labels", () => {
    expect(normaliseLabel("fable")).toBe("fable");
    expect(normaliseLabel("My-App")).toBe("my-app");
  });
  test("strips url scheme + path", () => {
    expect(normaliseLabel("https://foo.com/path")).toBe("foo");
  });
  test("rejects empty / invalid input", () => {
    expect(normaliseLabel("")).toBeNull();
    expect(normaliseLabel("--")).toBeNull();
    expect(normaliseLabel("a..b")).toBe("a"); // first label only
  });
});

describe("normaliseTld", () => {
  test("strips leading dots and lowercases", () => {
    expect(normaliseTld(".COM")).toBe("com");
    expect(normaliseTld("io")).toBe("io");
  });
  test("rejects invalid tld", () => {
    expect(normaliseTld("")).toBeNull();
    expect(normaliseTld("!bad")).toBeNull();
  });
});

describe("checkAvailability", () => {
  test("marks names with SOA as taken", async () => {
    const r = resolverFrom(new Set(["acme.com", "acme.net"]));
    const out = await checkAvailability("acme", {
      tlds: ["com", "net", "io"],
      resolver: r,
    });
    const byDomain: Record<string, DomainResult> = {};
    for (const x of out) byDomain[x.domain] = x;
    expect(byDomain["acme.com"]?.available).toBe(false);
    expect(byDomain["acme.net"]?.available).toBe(false);
    expect(byDomain["acme.io"]?.available).toBe(true);
  });

  test("NXDOMAIN / ENOTFOUND marks the name as available", async () => {
    const r = resolverFrom(new Set());
    const out = await checkAvailability("zvxhjkl", {
      tlds: ["com", "ai"],
      resolver: r,
    });
    expect(out.every((o) => o.available)).toBe(true);
  });

  test("SERVFAIL-style errors surface as unknown", async () => {
    const r = resolverFrom(new Set(), new Set(["flaky.com"]));
    const out = await checkAvailability("flaky", {
      tlds: ["com"],
      resolver: r,
    });
    expect(out[0]?.unknown).toBe(true);
    expect(out[0]?.available).toBe(false);
  });

  test("timeouts are reported as unknown without hanging", async () => {
    const slowResolver: SoaResolver = {
      async resolveSoa(): Promise<unknown> {
        return new Promise((resolve) => setTimeout(resolve, 500));
      },
    };
    const out = await checkAvailability("slow", {
      tlds: ["com"],
      resolver: slowResolver,
      timeoutMs: 50,
    });
    expect(out[0]?.unknown).toBe(true);
    expect(out[0]?.reason.toLowerCase()).toContain("timed out");
  });

  test("deduplicates overlapping TLDs", async () => {
    const r = resolverFrom(new Set());
    const out = await checkAvailability("widget", {
      tlds: ["com", "COM", "com", "io"],
      resolver: r,
    });
    expect(out.length).toBe(2);
  });

  test("returns empty array on invalid label", async () => {
    const r = resolverFrom(new Set());
    const out = await checkAvailability("!!!", {
      tlds: ["com"],
      resolver: r,
    });
    expect(out).toEqual([]);
  });

  test("DEFAULT_TLDS covers the core set requested by BLK-025", () => {
    for (const t of ["com", "net", "org", "io", "ai", "dev", "app", "co", "xyz", "tech", "cloud"]) {
      expect(DEFAULT_TLDS).toContain(t as never);
    }
  });
});

describe("onlyAvailable", () => {
  test("drops taken + unknown entries", () => {
    const rows: DomainResult[] = [
      {
        domain: "x.com",
        tld: "com",
        available: true,
        unknown: false,
        reason: "",
        lookupMs: 1,
      },
      {
        domain: "x.net",
        tld: "net",
        available: false,
        unknown: false,
        reason: "",
        lookupMs: 1,
      },
      {
        domain: "x.io",
        tld: "io",
        available: false,
        unknown: true,
        reason: "",
        lookupMs: 1,
      },
    ];
    expect(onlyAvailable(rows).map((r) => r.domain)).toEqual(["x.com"]);
  });
});
