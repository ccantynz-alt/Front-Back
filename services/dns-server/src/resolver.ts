// ── Resolver: authoritative lookup against a ZoneStore ───────────────
// This file does NOT talk to the database. The DB agent implements
// ZoneStore against Drizzle; we consume the interface only.
//
// Lookup semantics:
//   • Unknown zone / name → NXDOMAIN (with SOA in authority if we hold
//     the apex zone for a suffix).
//   • Known name, no record of requested type → NOERROR + empty answer
//     (plus SOA in authority, per RFC 2308 negative caching).
//   • CNAME resolution chases once: if the name resolves to a CNAME and
//     the query type is not CNAME, we include the CNAME answer and, if
//     the target is within any of our zones, the resolved final record.

import {
  type DnsMessage,
  type DnsQuestion,
  type DnsResourceRecord,
  type RData,
  type RecordType,
  RCode,
  RecordClass,
  buildResponse,
} from "./protocol";

export const DEFAULT_TTL_SECONDS = 300;

// ── ZoneStore contract (implemented by DB agent) ────────────────────

export interface ZoneStoreRecord {
  /** Fully-qualified owner name, without trailing dot, lower-case. */
  name: string;
  type: RecordType;
  /** TTL in seconds. If undefined, DEFAULT_TTL_SECONDS is used. */
  ttl?: number;
  /** The type-specific rdata payload. */
  data: RData;
}

export interface ZoneStore {
  /**
   * Return every record whose owner name equals `name` (case-insensitive)
   * and whose type equals `type`. Return an empty array when nothing
   * matches.
   */
  findRecords(name: string, type: RecordType): Promise<ZoneStoreRecord[]>;

  /**
   * Return the longest-matching zone apex for `name`, or undefined if
   * we are not authoritative. Used to decide NXDOMAIN vs REFUSED and to
   * fetch the SOA for negative responses.
   *
   * Example: if we host `example.com`, `findZoneApex("www.example.com")`
   *          should return `"example.com"`.
   */
  findZoneApex(name: string): Promise<string | undefined>;

  /** True if any record of any type exists for this owner name. */
  hasName(name: string): Promise<boolean>;
}

// ── Resolver ────────────────────────────────────────────────────────

export interface ResolverOptions {
  defaultTtl?: number;
  /** Maximum CNAME chase depth. Defaults to 8. */
  maxCnameDepth?: number;
}

export interface ResolveResult {
  response: DnsMessage;
  /** Minimum TTL across emitted answers — used to pick the cache TTL. */
  minTtl: number;
  rcode: RCode;
  cacheable: boolean;
}

export class Resolver {
  private readonly defaultTtl: number;
  private readonly maxCnameDepth: number;

  constructor(
    private readonly store: ZoneStore,
    options: ResolverOptions = {},
  ) {
    this.defaultTtl = options.defaultTtl ?? DEFAULT_TTL_SECONDS;
    this.maxCnameDepth = options.maxCnameDepth ?? 8;
  }

  async resolve(request: DnsMessage): Promise<ResolveResult> {
    // We currently only service single-question queries (the de-facto
    // standard for DNS, even though RFC 1035 allows multiple).
    const question = request.questions[0];
    if (question === undefined || request.questions.length !== 1) {
      return {
        response: buildResponse(request, { rcode: RCode.FORMERR, aa: false }),
        minTtl: 0,
        rcode: RCode.FORMERR,
        cacheable: false,
      };
    }

    if (question.class !== RecordClass.IN) {
      return {
        response: buildResponse(request, { rcode: RCode.NOTIMP, aa: false }),
        minTtl: 0,
        rcode: RCode.NOTIMP,
        cacheable: false,
      };
    }

    const ownerName = question.name.toLowerCase();
    const apex = await this.store.findZoneApex(ownerName);

    if (apex === undefined) {
      return {
        response: buildResponse(request, { rcode: RCode.REFUSED, aa: false }),
        minTtl: 0,
        rcode: RCode.REFUSED,
        cacheable: false,
      };
    }

    const answers = await this.resolveWithCnameChase(ownerName, question.type);

    if (answers.length > 0) {
      const minTtl = answers.reduce((acc, rr) => Math.min(acc, rr.ttl), Number.MAX_SAFE_INTEGER);
      return {
        response: buildResponse(request, { answers, aa: true }),
        minTtl,
        rcode: RCode.NOERROR,
        cacheable: true,
      };
    }

    // No answers. Decide between NXDOMAIN and NOERROR/empty.
    const nameExists = await this.store.hasName(ownerName);
    const authority = await this.fetchSoaAuthority(apex);
    const minTtl = authority[0]?.ttl ?? this.defaultTtl;

    if (nameExists) {
      // Name exists; the requested type does not.
      return {
        response: buildResponse(request, {
          answers: [],
          authorities: authority,
          rcode: RCode.NOERROR,
          aa: true,
        }),
        minTtl,
        rcode: RCode.NOERROR,
        cacheable: true,
      };
    }

    return {
      response: buildResponse(request, {
        answers: [],
        authorities: authority,
        rcode: RCode.NXDOMAIN,
        aa: true,
      }),
      minTtl,
      rcode: RCode.NXDOMAIN,
      cacheable: true,
    };
  }

  private async resolveWithCnameChase(
    name: string,
    qtype: RecordType,
  ): Promise<DnsResourceRecord[]> {
    const out: DnsResourceRecord[] = [];
    const seen = new Set<string>();
    let current = name;

    for (let i = 0; i < this.maxCnameDepth; i += 1) {
      if (seen.has(current)) break;
      seen.add(current);

      const direct = await this.store.findRecords(current, qtype);
      if (direct.length > 0) {
        for (const r of direct) out.push(this.toRR(current, r));
        return out;
      }

      // No direct match — try CNAME if the query wasn't already CNAME.
      if (qtype === 5 /* CNAME */) return out;

      const cnames = await this.store.findRecords(current, 5 as RecordType);
      if (cnames.length === 0) return out;
      const firstCname = cnames[0];
      if (firstCname === undefined) return out;

      out.push(this.toRR(current, firstCname));
      if (firstCname.data.type !== 5) return out;
      current = firstCname.data.target.toLowerCase();
    }

    return out;
  }

  private async fetchSoaAuthority(apex: string): Promise<DnsResourceRecord[]> {
    const soas = await this.store.findRecords(apex, 6 as RecordType);
    return soas.map((r) => this.toRR(apex, r));
  }

  private toRR(owner: string, record: ZoneStoreRecord): DnsResourceRecord {
    return {
      name: owner,
      class: RecordClass.IN,
      ttl: record.ttl ?? this.defaultTtl,
      data: record.data,
    };
  }
}

// ── Convenience: one-shot helper used by the UDP/TCP handlers ───────

export async function resolveQuestion(
  resolver: Resolver,
  request: DnsMessage,
): Promise<ResolveResult> {
  return resolver.resolve(request);
}

export function questionKey(q: DnsQuestion): string {
  return `${q.name.toLowerCase()}|${q.type}|${q.class}`;
}
