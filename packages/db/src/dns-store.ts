// ── DNS Zone Store (BLK-023) ────────────────────────────────────────
// Read-heavy data access layer for the self-hosted DNS engine. The
// services/dns-server package consumes the `ZoneStore` interface below
// to resolve incoming DNS queries against the `dns_zones` + `dns_records`
// tables. The engine is on the packet hot path, so this module keeps
// the query surface tiny and the lookups index-aligned:
//   * `findRecords(name, type)` is served by the `dns_records_name_type_idx`
//     composite index.
//   * `getZone(name)` / `listZones()` is served by the `dns_zones_name_idx`.
//   * `bumpSerial(zoneId)` is the one write path — called by the API layer
//     after any record mutation so secondaries can pick up changes.
//
// Shared types `DnsRecord`, `DnsZone`, and `RecordType` are exported here
// and imported by `services/dns-server` to keep the wire contract
// single-sourced.

import { and, eq } from "drizzle-orm";
import type { createClient } from "./client";
import { dnsRecords, dnsZones } from "./schema";

// ── Shared Types ────────────────────────────────────────────────────

/**
 * Supported DNS resource record types. Matches the CHECK constraint
 * expressed via the `type` column enum in `schema.ts`.
 */
export type RecordType =
  | "A"
  | "AAAA"
  | "CNAME"
  | "MX"
  | "TXT"
  | "NS"
  | "SOA"
  | "SRV"
  | "CAA";

/**
 * One DNS zone owned by Crontech. Serial increments on any record
 * mutation inside the zone so secondaries can detect changes via
 * AXFR/IXFR. Timestamps are unix-millisecond integers.
 */
export interface DnsZone {
  id: string;
  name: string;
  adminEmail: string;
  primaryNs: string;
  secondaryNs: string | null;
  refreshSeconds: number;
  retrySeconds: number;
  expireSeconds: number;
  minimumTtl: number;
  serial: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * One resource record inside a zone. `priority` is only populated for
 * `MX` and `SRV` records; for everything else it is `null`.
 */
export interface DnsRecord {
  id: string;
  zoneId: string;
  name: string;
  type: RecordType;
  content: string;
  ttl: number;
  priority: number | null;
  createdAt: number;
  updatedAt: number;
}

// ── ZoneStore Interface ─────────────────────────────────────────────

/**
 * Read-focused contract consumed by the DNS engine. Implementations
 * must be safe to call concurrently from many inbound query handlers.
 */
export interface ZoneStore {
  /** Resolve a single (name, type) question across all zones. */
  findRecords: (name: string, type: RecordType) => Promise<DnsRecord[]>;
  /** Fetch a zone by its canonical name (e.g. `crontech.ai`). */
  getZone: (name: string) => Promise<DnsZone | null>;
  /** Enumerate every zone this server is authoritative for. */
  listZones: () => Promise<DnsZone[]>;
  /** Increment the zone's serial so secondaries notice a change. */
  bumpSerial: (zoneId: string) => Promise<void>;
}

// ── Implementation ──────────────────────────────────────────────────

type Db = ReturnType<typeof createClient>;

/**
 * Narrow the open-ended string coming back from SQLite's `text` column
 * down to the `RecordType` union. Drizzle preserves the enum at the
 * type level for the insert side but the select side hands back a
 * plain `string`, so we re-assert here once.
 */
function asRecordType(value: string): RecordType {
  return value as RecordType;
}

function mapZoneRow(row: typeof dnsZones.$inferSelect): DnsZone {
  return {
    id: row.id,
    name: row.name,
    adminEmail: row.adminEmail,
    primaryNs: row.primaryNs,
    secondaryNs: row.secondaryNs ?? null,
    refreshSeconds: row.refreshSeconds,
    retrySeconds: row.retrySeconds,
    expireSeconds: row.expireSeconds,
    minimumTtl: row.minimumTtl,
    serial: row.serial,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRecordRow(row: typeof dnsRecords.$inferSelect): DnsRecord {
  return {
    id: row.id,
    zoneId: row.zoneId,
    name: row.name,
    type: asRecordType(row.type),
    content: row.content,
    ttl: row.ttl,
    priority: row.priority ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Drizzle-backed `ZoneStore`. Pass the shared `db` client (or any
 * instance produced by `createClient`) and you're ready to serve the
 * DNS engine.
 */
export function createDnsStore(db: Db): ZoneStore {
  return {
    async findRecords(name: string, type: RecordType): Promise<DnsRecord[]> {
      const rows = await db
        .select()
        .from(dnsRecords)
        .where(and(eq(dnsRecords.name, name), eq(dnsRecords.type, type)));
      return rows.map(mapRecordRow);
    },

    async getZone(name: string): Promise<DnsZone | null> {
      const rows = await db
        .select()
        .from(dnsZones)
        .where(eq(dnsZones.name, name))
        .limit(1);
      const row = rows[0];
      return row ? mapZoneRow(row) : null;
    },

    async listZones(): Promise<DnsZone[]> {
      const rows = await db.select().from(dnsZones);
      return rows.map(mapZoneRow);
    },

    async bumpSerial(zoneId: string): Promise<void> {
      const now = Date.now();
      const rows = await db
        .select({ serial: dnsZones.serial })
        .from(dnsZones)
        .where(eq(dnsZones.id, zoneId))
        .limit(1);
      const current = rows[0]?.serial ?? 0;
      await db
        .update(dnsZones)
        .set({ serial: current + 1, updatedAt: now })
        .where(eq(dnsZones.id, zoneId));
    },
  };
}
