// ── BLK-023 — DNS import from Cloudflare ─────────────────────────────
// Craig owns three zones on Cloudflare (crontech.ai, gluecron.com,
// alecrae.com) that need to move to the self-hosted DNS engine. This
// module exposes:
//
//   1. `importFromCloudflare` — a pure function (dependency-injected
//      fetch + db) that fetches a zone's records from the Cloudflare
//      v4 API and bulk-inserts them into our `dns_zones` / `dns_records`
//      tables. The CLI script and the tRPC procedure both call into
//      this function so their behaviour is identical.
//
//   2. `dnsImportRouter` — the admin-only tRPC router that wraps the
//      function for use from the admin UI once it ships.
//
// Import rules (keep in lockstep with scripts/import-dns-zone.ts):
//   • Skip Cloudflare-specific record types our engine doesn't support
//     (e.g. "PAGERULE", "WORKERS") — they have no equivalent row.
//   • Dedupe on (zoneId, name, type, content) so re-running the import
//     is idempotent.
//   • Synthesize SOA defaults (adminEmail + NS) from configurable
//     fallbacks — Cloudflare doesn't expose the NS records we should
//     advertise from the self-hosted engine, so Craig configures them.
//   • Bump the zone's serial once at the end so secondaries notice.
//
// Zod at every boundary: the input schema validates the caller, a
// Cloudflare response schema validates the upstream, and the return
// shape is a literal object so tRPC infers it cleanly for the client.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { router, adminProcedure } from "../init";
import { db as defaultDb, dnsZones, dnsRecords } from "@back-to-the-future/db";

// ── Supported record types ──────────────────────────────────────────
// The engine's `dns_records.type` enum. Cloudflare records outside
// this set get counted as "skipped" rather than imported.
const SUPPORTED_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "NS",
  "SOA",
  "SRV",
  "CAA",
] as const;
type SupportedType = (typeof SUPPORTED_TYPES)[number];

function isSupportedType(t: string): t is SupportedType {
  return (SUPPORTED_TYPES as readonly string[]).includes(t);
}

// ── Defaults for synthesised SOA/NS values ──────────────────────────
// Craig can override these via env vars (so bootstrap deploys can set
// the right values without a code change) or via the procedure input.
const DEFAULT_ADMIN_EMAIL = "hostmaster@crontech.ai";
const DEFAULT_PRIMARY_NS = "ns1.crontech.ai";
const DEFAULT_SECONDARY_NS = "ns2.crontech.ai";

function envDefaults(): {
  adminEmail: string;
  primaryNs: string;
  secondaryNs: string;
} {
  return {
    adminEmail: process.env["DNS_IMPORT_ADMIN_EMAIL"] ?? DEFAULT_ADMIN_EMAIL,
    primaryNs: process.env["DNS_IMPORT_PRIMARY_NS"] ?? DEFAULT_PRIMARY_NS,
    secondaryNs: process.env["DNS_IMPORT_SECONDARY_NS"] ?? DEFAULT_SECONDARY_NS,
  };
}

// ── Cloudflare response schemas ─────────────────────────────────────
// Fields we ignore are intentionally not validated — Cloudflare adds
// new fields frequently and we don't want to crash on them.

const CloudflareZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const CloudflareZoneListResponseSchema = z.object({
  success: z.boolean(),
  errors: z.array(z.unknown()).optional(),
  result: z.array(CloudflareZoneSchema),
});

const CloudflareRecordSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  name: z.string(),
  content: z.string(),
  ttl: z.number().int().nonnegative().optional(),
  priority: z.number().int().nonnegative().optional(),
});

const CloudflareRecordListResponseSchema = z.object({
  success: z.boolean(),
  errors: z.array(z.unknown()).optional(),
  result: z.array(CloudflareRecordSchema),
});

export type CloudflareRecord = z.infer<typeof CloudflareRecordSchema>;

// ── Input / output types ────────────────────────────────────────────

export const DnsImportInputSchema = z.object({
  apiToken: z.string().min(1, "Cloudflare API token is required"),
  zoneName: z.string().min(1, "Cloudflare zone name is required"),
  adminEmail: z.string().email().optional(),
  primaryNs: z.string().min(1).optional(),
  secondaryNs: z.string().min(1).optional(),
  dryRun: z.boolean().optional(),
});

export type DnsImportInput = z.infer<typeof DnsImportInputSchema>;

export interface DnsImportError {
  record?: string;
  type?: string;
  reason: string;
}

export interface DnsImportSummary {
  zoneId: string;
  zoneName: string;
  imported: number;
  skipped: number;
  errors: DnsImportError[];
  dryRun: boolean;
}

// ── Dependency injection surface ────────────────────────────────────
// Tests pass `fetchImpl` + `db` so we can exercise the full import
// pipeline against a mocked Cloudflare API and the test sqlite DB.

type Database = typeof defaultDb;

export interface DnsImportDeps {
  db?: Database;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

// ── Cloudflare API helpers ──────────────────────────────────────────

async function fetchZoneId(
  fetchImpl: typeof fetch,
  apiToken: string,
  zoneName: string,
): Promise<string> {
  const url = `${CLOUDFLARE_API_BASE}/zones?name=${encodeURIComponent(zoneName)}`;
  const res = await fetchImpl(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: `Cloudflare rejected the API token (HTTP ${res.status}).`,
    });
  }

  if (!res.ok) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Cloudflare zone lookup failed with HTTP ${res.status}.`,
    });
  }

  const json: unknown = await res.json();
  const parsed = CloudflareZoneListResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Cloudflare returned an unexpected zone list shape.",
    });
  }
  if (!parsed.data.success) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Cloudflare reported the zone lookup as unsuccessful.",
    });
  }
  const match = parsed.data.result.find((z) => z.name === zoneName);
  if (!match) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: `No Cloudflare zone found with name "${zoneName}".`,
    });
  }
  return match.id;
}

async function fetchZoneRecords(
  fetchImpl: typeof fetch,
  apiToken: string,
  cloudflareZoneId: string,
): Promise<CloudflareRecord[]> {
  const url = `${CLOUDFLARE_API_BASE}/zones/${encodeURIComponent(cloudflareZoneId)}/dns_records?per_page=5000`;
  const res = await fetchImpl(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: `Cloudflare rejected the API token while listing records (HTTP ${res.status}).`,
    });
  }

  if (!res.ok) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: `Cloudflare record list failed with HTTP ${res.status}.`,
    });
  }

  const json: unknown = await res.json();
  const parsed = CloudflareRecordListResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Cloudflare returned an unexpected record list shape.",
    });
  }
  if (!parsed.data.success) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Cloudflare reported the record list as unsuccessful.",
    });
  }
  return parsed.data.result;
}

// ── Core import routine ─────────────────────────────────────────────

/**
 * Fetch a Cloudflare zone's DNS records and bulk-insert them into the
 * self-hosted DNS store. Idempotent: existing rows matching
 * (zoneId, name, type, content) are skipped.
 *
 * Returns a structured summary for the caller to render.
 */
export async function importFromCloudflare(
  input: DnsImportInput,
  deps: DnsImportDeps = {},
): Promise<DnsImportSummary> {
  const parsed = DnsImportInputSchema.parse(input);
  const database = deps.db ?? defaultDb;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const dryRun = parsed.dryRun ?? false;

  const defaults = envDefaults();
  const adminEmail = parsed.adminEmail ?? defaults.adminEmail;
  const primaryNs = parsed.primaryNs ?? defaults.primaryNs;
  const secondaryNs = parsed.secondaryNs ?? defaults.secondaryNs;

  // 1. Resolve the Cloudflare zone id.
  const cloudflareZoneId = await fetchZoneId(
    fetchImpl,
    parsed.apiToken,
    parsed.zoneName,
  );

  // 2. List all records on that zone.
  const cfRecords = await fetchZoneRecords(
    fetchImpl,
    parsed.apiToken,
    cloudflareZoneId,
  );

  // 3. Find-or-create the local zone row. We key on zone name because
  //    that's what users reason about; the row's id is a fresh UUID.
  const nowMillis = now();
  let zoneId: string;
  const existingZone = await database
    .select({ id: dnsZones.id })
    .from(dnsZones)
    .where(eq(dnsZones.name, parsed.zoneName))
    .limit(1);

  if (existingZone[0]) {
    zoneId = existingZone[0].id;
  } else {
    zoneId = crypto.randomUUID();
    if (!dryRun) {
      await database.insert(dnsZones).values({
        id: zoneId,
        name: parsed.zoneName,
        adminEmail,
        primaryNs,
        secondaryNs,
        serial: 1,
        createdAt: nowMillis,
        updatedAt: nowMillis,
      });
    }
  }

  // 4. For each Cloudflare record, decide: skip, dedupe, or insert.
  const errors: DnsImportError[] = [];
  let imported = 0;
  let skipped = 0;

  for (const cfRecord of cfRecords) {
    const upperType = cfRecord.type.toUpperCase();
    if (!isSupportedType(upperType)) {
      skipped += 1;
      continue;
    }

    try {
      // Dedupe — any existing row with the same natural key is a
      // match, we just move on.
      const dupe = await database
        .select({ id: dnsRecords.id })
        .from(dnsRecords)
        .where(
          and(
            eq(dnsRecords.zoneId, zoneId),
            eq(dnsRecords.name, cfRecord.name),
            eq(dnsRecords.type, upperType),
            eq(dnsRecords.content, cfRecord.content),
          ),
        )
        .limit(1);

      if (dupe[0]) {
        skipped += 1;
        continue;
      }

      if (!dryRun) {
        await database.insert(dnsRecords).values({
          id: crypto.randomUUID(),
          zoneId,
          name: cfRecord.name,
          type: upperType,
          content: cfRecord.content,
          ttl: cfRecord.ttl ?? 300,
          priority: cfRecord.priority ?? null,
          createdAt: nowMillis,
          updatedAt: nowMillis,
        });
      }
      imported += 1;
    } catch (err) {
      errors.push({
        record: cfRecord.name,
        type: upperType,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 5. Bump the zone serial exactly once so secondaries notice that
  //    the zone has changed. Skip in dry-run so we don't lie about it.
  if (!dryRun && imported > 0) {
    const zoneRow = await database
      .select({ serial: dnsZones.serial })
      .from(dnsZones)
      .where(eq(dnsZones.id, zoneId))
      .limit(1);
    const currentSerial = zoneRow[0]?.serial ?? 1;
    await database
      .update(dnsZones)
      .set({ serial: currentSerial + 1, updatedAt: nowMillis })
      .where(eq(dnsZones.id, zoneId));
  }

  return {
    zoneId,
    zoneName: parsed.zoneName,
    imported,
    skipped,
    errors,
    dryRun,
  };
}

// ── tRPC router ─────────────────────────────────────────────────────

export const dnsImportRouter = router({
  /**
   * Admin-only: import a Cloudflare zone's DNS records into the
   * self-hosted DNS store. Safe to re-run — existing records are
   * deduped on (zone, name, type, content).
   */
  importFromCloudflare: adminProcedure
    .input(DnsImportInputSchema)
    .mutation(async ({ ctx, input }) => {
      return importFromCloudflare(input, { db: ctx.db });
    }),
});
