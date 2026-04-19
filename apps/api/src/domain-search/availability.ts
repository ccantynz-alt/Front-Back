// ── BLK-025 Domain Search: Availability Checker ──────────────────────
//
// Multi-TLD availability resolution via authoritative SOA lookups.
//
// Decision rule (conservative, no false positives):
//   • If `dns.resolveSoa(candidate)` RESOLVES with a SOA record at the
//     candidate name itself, the name is delegated and therefore TAKEN.
//   • If the lookup throws ENOTFOUND / NXDOMAIN / NODATA, there is no
//     SOA at the candidate, no NS delegation, and the name is AVAILABLE
//     (per RFC 1034 §4.3.1 — an NXDOMAIN at the TLD means the label is
//     unallocated).
//   • Any other DNS error (SERVFAIL, timeout, REFUSED) is reported as
//     UNKNOWN rather than guessed. We never claim a name is available
//     unless the authoritative chain confirmed the absence.
//
// Queries fan out in parallel across every configured TLD with a hard
// timeout so a single slow resolver cannot stall the request. Results
// are returned in the original TLD order so the UI can render them
// deterministically.

import { promises as dnsPromises } from "node:dns";
import { z } from "zod";

export const DEFAULT_TLDS = [
  "com",
  "net",
  "org",
  "io",
  "ai",
  "dev",
  "app",
  "co",
  "xyz",
  "tech",
  "cloud",
] as const;

export type DefaultTld = (typeof DEFAULT_TLDS)[number];

export const DomainResultSchema = z.object({
  domain: z.string(),
  tld: z.string(),
  available: z.boolean(),
  /** True when we could not decide (timeout, SERVFAIL, resolver error). */
  unknown: z.boolean(),
  /** Short human-readable reason for the decision. */
  reason: z.string(),
  /** Latency of the DNS probe in ms. */
  lookupMs: z.number().int().nonnegative(),
});

export type DomainResult = z.infer<typeof DomainResultSchema>;

// ── Resolver contract ────────────────────────────────────────────────
// The tests inject a fake resolver so we never hit the real DNS in CI.
// In production, the default resolver wraps Node's `dns/promises.resolveSoa`.

export interface SoaResolver {
  /**
   * Resolve the SOA record for `name`. Return the raw SOA object when
   * the name is delegated, or `null`/throw when NXDOMAIN / NODATA.
   */
  resolveSoa(name: string): Promise<unknown>;
}

export const defaultResolver: SoaResolver = {
  async resolveSoa(name: string): Promise<unknown> {
    return dnsPromises.resolveSoa(name);
  },
};

// ── Input validation ────────────────────────────────────────────────

const LABEL_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Normalise a raw search query into a single DNS label. Strips scheme,
 * path, whitespace, surrounding TLDs, and lowercases. Returns `null`
 * when the result is not a valid hostname label.
 */
export function normaliseLabel(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let v = raw.trim().toLowerCase();
  if (v.length === 0) return null;
  // Drop scheme + path if the user pasted a URL.
  v = v.replace(/^https?:\/\//, "").split("/")[0] ?? "";
  // If they typed "foo.com", keep just "foo".
  const firstLabel = v.split(".")[0] ?? "";
  if (!LABEL_RE.test(firstLabel)) return null;
  return firstLabel;
}

/**
 * Normalise a TLD: strip any leading dot, lowercase, reject anything
 * that isn't a valid label. The `.` is added back when we build the
 * full candidate name.
 */
export function normaliseTld(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase().replace(/^\.+/, "");
  if (!LABEL_RE.test(v)) return null;
  return v;
}

// ── Core probe ──────────────────────────────────────────────────────

interface ProbeOptions {
  readonly timeoutMs: number;
}

async function withTimeout<T>(
  p: Promise<T>,
  timeoutMs: number,
): Promise<{ ok: true; value: T } | { ok: false; reason: "timeout" }> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const raced = await Promise.race([
      p.then((value) => ({ kind: "ok" as const, value })),
      new Promise<{ kind: "timeout" }>((resolve) => {
        timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
      }),
    ]);
    if (raced.kind === "timeout") return { ok: false, reason: "timeout" };
    return { ok: true, value: raced.value };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Error codes that indicate "there is no such name" and therefore the
 * domain is AVAILABLE. Anything else (timeout, SERVFAIL, REFUSED) is
 * reported as UNKNOWN so we don't lie to the user.
 */
const NOT_FOUND_CODES = new Set([
  "ENOTFOUND",
  "ENODATA",
  "NXDOMAIN",
  "NOTFOUND",
]);

interface DnsLikeError {
  code?: unknown;
  message?: unknown;
}

function isNotFound(err: unknown): boolean {
  if (err === null || err === undefined) return false;
  const e = err as DnsLikeError;
  if (typeof e.code === "string" && NOT_FOUND_CODES.has(e.code)) return true;
  if (typeof e.message === "string") {
    const m = e.message.toUpperCase();
    for (const c of NOT_FOUND_CODES) {
      if (m.includes(c)) return true;
    }
  }
  return false;
}

async function probeOne(
  label: string,
  tld: string,
  resolver: SoaResolver,
  opts: ProbeOptions,
): Promise<DomainResult> {
  const domain = `${label}.${tld}`;
  const started = Date.now();
  const outcome = await withTimeout(
    (async (): Promise<"taken" | "available" | "error"> => {
      try {
        const soa = await resolver.resolveSoa(domain);
        if (soa === null || soa === undefined) return "available";
        return "taken";
      } catch (err) {
        if (isNotFound(err)) return "available";
        return "error";
      }
    })(),
    opts.timeoutMs,
  );
  const lookupMs = Date.now() - started;

  if (!outcome.ok) {
    return {
      domain,
      tld,
      available: false,
      unknown: true,
      reason: "Lookup timed out — try again in a moment.",
      lookupMs,
    };
  }

  switch (outcome.value) {
    case "available":
      return {
        domain,
        tld,
        available: true,
        unknown: false,
        reason: "No SOA / NS delegation — looks available.",
        lookupMs,
      };
    case "taken":
      return {
        domain,
        tld,
        available: false,
        unknown: false,
        reason: "Authoritative SOA found — already registered.",
        lookupMs,
      };
    case "error":
      return {
        domain,
        tld,
        available: false,
        unknown: true,
        reason: "DNS resolver returned an error — availability unknown.",
        lookupMs,
      };
    default: {
      const _exhaustive: never = outcome.value;
      throw new Error(`unreachable: ${String(_exhaustive)}`);
    }
  }
}

// ── Public surface ──────────────────────────────────────────────────

export interface CheckAvailabilityOptions {
  /** One or more TLDs (without leading dot). Defaults to DEFAULT_TLDS. */
  tlds?: ReadonlyArray<string>;
  /** Per-lookup timeout in ms. Defaults to 2000. */
  timeoutMs?: number;
  /** Resolver implementation — injected in tests. */
  resolver?: SoaResolver;
}

/**
 * Check availability of `label` across every configured TLD in parallel.
 * Invalid labels / TLDs are filtered silently. The caller should have
 * already validated user input upstream.
 */
export async function checkAvailability(
  rawLabel: string,
  opts: CheckAvailabilityOptions = {},
): Promise<DomainResult[]> {
  const label = normaliseLabel(rawLabel);
  if (!label) return [];

  const tldsInput = opts.tlds ?? DEFAULT_TLDS;
  const tlds: string[] = [];
  const seen = new Set<string>();
  for (const raw of tldsInput) {
    const t = normaliseTld(raw);
    if (t && !seen.has(t)) {
      seen.add(t);
      tlds.push(t);
    }
  }
  if (tlds.length === 0) return [];

  const resolver = opts.resolver ?? defaultResolver;
  const timeoutMs = opts.timeoutMs ?? 2_000;

  const settled = await Promise.all(
    tlds.map((tld) => probeOne(label, tld, resolver, { timeoutMs })),
  );
  return settled;
}

/** Filter down to strictly-available results (drops taken + unknown). */
export function onlyAvailable(results: ReadonlyArray<DomainResult>): DomainResult[] {
  return results.filter((r) => r.available && !r.unknown);
}
