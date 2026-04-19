/**
 * BLK-023 DNS helper for the build-runner.
 *
 * After a successful deploy, the build-runner calls
 * `upsertSubdomainRecord(slug, ip)` here. We look up the `crontech.ai`
 * zone, then insert-or-update a single `A` record for
 * `{slug}.crontech.ai → ip`, and bump the zone's serial exactly once so
 * downstream secondaries can detect the change via AXFR/IXFR.
 *
 * Non-goals: this module does NOT own the DNS schema (that's DNS-SCHEMA),
 * the DNS engine (DNS-ENGINE), or the admin UI (DNS-UI). It is the
 * minimal write path the build-runner needs to hang off of.
 *
 * ⚠️ Never throw out of `upsertSubdomainRecord` — the build-runner treats
 * DNS as best-effort. A missing zone or a transient write failure must
 * not fail an otherwise-live deploy. Failures are logged to stderr and
 * surfaced back via the build-runner's own log stream.
 */

import { and, eq } from "drizzle-orm";
import {
  db as defaultDb,
  dnsRecords,
  dnsZones,
} from "@back-to-the-future/db";

export type DnsDbClient = typeof defaultDb;

/** Zone we live inside. Hard-coded for v1 — BLK-023 scope. */
const CRONTECH_ZONE = "crontech.ai";

export interface UpsertSubdomainOptions {
  /** Override the DB client — tests inject a mock. */
  db?: DnsDbClient;
  /** Override `Date.now()` so tests can pin timestamps. */
  now?: () => number;
  /** Override UUID generator so tests get deterministic ids. */
  generateId?: () => string;
}

/**
 * Upsert an `A` record for `{slug}.{CRONTECH_ZONE}` pointing at `ip`.
 *
 * - Zone missing → log a warning and return (no throw).
 * - Record missing → insert a fresh row.
 * - Record present → update the content + `updatedAt`.
 * - In every success path the zone's `serial` is bumped exactly once.
 *
 * Errors are caught and logged. The build-runner will not fail a deploy
 * because DNS stuttered.
 */
export async function upsertSubdomainRecord(
  slug: string,
  ip: string,
  options: UpsertSubdomainOptions = {},
): Promise<void> {
  const db = options.db ?? defaultDb;
  const nowMs = options.now ?? ((): number => Date.now());
  const generateId =
    options.generateId ?? ((): string => crypto.randomUUID());

  const fqdn = `${slug}.${CRONTECH_ZONE}`;

  try {
    // ── 1. Lookup the zone ──────────────────────────────────────────
    const zoneRows = await db
      .select()
      .from(dnsZones)
      .where(eq(dnsZones.name, CRONTECH_ZONE))
      .limit(1);
    const zone = zoneRows[0];
    if (!zone) {
      console.warn(
        `[dns-helper] zone ${CRONTECH_ZONE} not found — skipping A record for ${fqdn}`,
      );
      return;
    }

    // ── 2. Does the record already exist? ───────────────────────────
    const existingRows = await db
      .select()
      .from(dnsRecords)
      .where(
        and(
          eq(dnsRecords.zoneId, zone.id),
          eq(dnsRecords.name, fqdn),
          eq(dnsRecords.type, "A"),
        ),
      )
      .limit(1);
    const existing = existingRows[0];
    const ts = nowMs();

    if (existing) {
      // ── 3a. Update ip + updatedAt ────────────────────────────────
      await db
        .update(dnsRecords)
        .set({ content: ip, updatedAt: ts })
        .where(eq(dnsRecords.id, existing.id));
    } else {
      // ── 3b. Insert a fresh A record ──────────────────────────────
      await db.insert(dnsRecords).values({
        id: generateId(),
        zoneId: zone.id,
        name: fqdn,
        type: "A",
        content: ip,
        ttl: 300,
        priority: null,
        createdAt: ts,
        updatedAt: ts,
      });
    }

    // ── 4. Bump the zone serial exactly once per call ──────────────
    await db
      .update(dnsZones)
      .set({ serial: zone.serial + 1, updatedAt: ts })
      .where(eq(dnsZones.id, zone.id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[dns-helper] upsert failed for ${fqdn}: ${msg}`);
  }
}
