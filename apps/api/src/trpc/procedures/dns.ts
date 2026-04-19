// ── DNS Admin Procedures (BLK-023) ─────────────────────────────────
// Admin-only tRPC procedures for authoritative DNS zone and record
// management. Zones hold SOA parameters + NS delegation; records hold
// the individual resource records (A/AAAA/CNAME/MX/TXT/NS/SOA/SRV/CAA).
//
// Design rules enforced here (mirrored in services/dns-server):
//   • Record names are stored lowercased + trimmed.
//   • Record content is validated against the type (A → IPv4, AAAA →
//     IPv6, CNAME → hostname, MX/SRV → priority required, TXT → 255
//     chars per chunk — caller is responsible for pre-splitting).
//   • Any mutation that changes the zone contents bumps the zone
//     serial (and `updated_at`) so secondaries can pick up changes
//     via AXFR/IXFR.
//   • createZone auto-seeds the default SOA + NS records so the zone
//     is immediately answerable.
//
// The DNS-engine code (services/dns-server) and schema migrations
// (packages/db) are owned by other agents — this file only contains
// the tRPC surface and server-side validation.

import { isIP } from "node:net";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { router, adminProcedure } from "../init";
import type { TRPCContext } from "../context";
import { dnsZones, dnsRecords } from "@back-to-the-future/db";

// ── Types ──────────────────────────────────────────────────────────
// The DNS-SCHEMA agent adds the underlying tables; we derive the row
// types via Drizzle's `$inferSelect` so this file stays aligned with
// whatever column set ships in the schema.
export type DnsZone = typeof dnsZones.$inferSelect;
export type DnsRecord = typeof dnsRecords.$inferSelect;
export type RecordType = DnsRecord["type"];

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

// ── Helpers ────────────────────────────────────────────────────────

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** RFC-952/1123 hostname validation. Labels may not be IP addresses. */
function isHostname(value: string): boolean {
  if (value.length === 0 || value.length > 253) return false;
  // Trailing dot is allowed in FQDNs — strip before validating.
  const normalised = value.endsWith(".") ? value.slice(0, -1) : value;
  if (normalised.length === 0) return false;
  // Reject IPs — CNAMEs must target hostnames, not addresses.
  if (isIP(normalised) !== 0) return false;
  const labels = normalised.split(".");
  const labelRe = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
  return labels.every((l) => labelRe.test(l));
}

/**
 * Validate the `content` field for a given record type. Throws a
 * BAD_REQUEST TRPCError with a polite, actionable message on failure.
 */
function validateRecordContent(
  type: RecordType,
  content: string,
  priority: number | null | undefined,
): void {
  switch (type) {
    case "A": {
      if (isIP(content) !== 4) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "A records require a valid IPv4 address in the content field.",
        });
      }
      return;
    }
    case "AAAA": {
      if (isIP(content) !== 6) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "AAAA records require a valid IPv6 address in the content field.",
        });
      }
      return;
    }
    case "CNAME":
    case "NS": {
      if (!isHostname(content)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${type} records require a valid hostname; IP addresses are not allowed.`,
        });
      }
      return;
    }
    case "MX": {
      if (priority === null || priority === undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "MX records require a priority value.",
        });
      }
      if (!isHostname(content)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "MX record content must be a valid mail-exchange hostname.",
        });
      }
      return;
    }
    case "SRV": {
      if (priority === null || priority === undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SRV records require a priority value.",
        });
      }
      // Content for SRV is "weight port target" — minimal shape check.
      if (content.trim().split(/\s+/).length < 3) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "SRV record content must be formatted as 'weight port target'.",
        });
      }
      return;
    }
    case "TXT": {
      // RFC 1035 caps a single TXT string at 255 octets. Callers are
      // responsible for pre-splitting long values into multiple chunks
      // (per the doctrine in the BLK-023 brief), so we only reject any
      // *single* chunk that exceeds the limit.
      if (content.length > 255) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "TXT record chunks are limited to 255 characters; please split longer values before submitting.",
        });
      }
      return;
    }
    case "SOA":
    case "CAA": {
      // SOA is managed via the zone row itself — direct creation via
      // the record endpoint is allowed but we do no extra validation.
      // CAA content is free-form per RFC 6844; surface-level check only.
      if (content.trim().length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${type} records require a non-empty content field.`,
        });
      }
      return;
    }
    default: {
      // Exhaustiveness — unreachable when Zod has already rejected the
      // type, but keeps the compiler honest if SUPPORTED_TYPES grows.
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Unsupported record type: ${String(type)}.`,
      });
    }
  }
}

/** Lowercase + trim DNS names before persisting. */
function normaliseName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Bump a zone's serial number. Convention: monotonic increment. The
 * BIND-style "YYYYMMDDnn" format is discouraged for small platforms
 * because it bounds mutations per day; a plain counter matches what
 * the DNS engine expects.
 */
async function bumpZoneSerial(
  db: TRPCContext["db"],
  zoneId: string,
): Promise<void> {
  const rows = await db
    .select({ serial: dnsZones.serial })
    .from(dnsZones)
    .where(eq(dnsZones.id, zoneId))
    .limit(1);
  const current = rows[0]?.serial ?? 0;
  await db
    .update(dnsZones)
    .set({ serial: current + 1, updatedAt: Date.now() })
    .where(eq(dnsZones.id, zoneId));
}

// ── Input Schemas ──────────────────────────────────────────────────

const RecordTypeSchema = z.enum(SUPPORTED_TYPES);

const CreateZoneInput = z.object({
  name: z.string().min(1).max(253),
  adminEmail: z.string().email(),
  primaryNs: z.string().min(1).max(253),
  secondaryNs: z.string().min(1).max(253).optional(),
  refreshSeconds: z.number().int().positive().optional(),
  retrySeconds: z.number().int().positive().optional(),
  expireSeconds: z.number().int().positive().optional(),
  minimumTtl: z.number().int().positive().optional(),
});

const UpdateZoneInput = z.object({
  id: z.string().min(1),
  adminEmail: z.string().email().optional(),
  primaryNs: z.string().min(1).max(253).optional(),
  secondaryNs: z.string().min(1).max(253).nullable().optional(),
  refreshSeconds: z.number().int().positive().optional(),
  retrySeconds: z.number().int().positive().optional(),
  expireSeconds: z.number().int().positive().optional(),
  minimumTtl: z.number().int().positive().optional(),
});

const CreateRecordInput = z.object({
  zoneId: z.string().min(1),
  name: z.string().min(1).max(253),
  type: RecordTypeSchema,
  content: z.string().min(1).max(4096),
  ttl: z.number().int().positive().max(2_147_483_647).optional(),
  priority: z.number().int().min(0).max(65535).optional(),
});

const UpdateRecordInput = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(253).optional(),
  type: RecordTypeSchema.optional(),
  content: z.string().min(1).max(4096).optional(),
  ttl: z.number().int().positive().max(2_147_483_647).optional(),
  priority: z.number().int().min(0).max(65535).nullable().optional(),
});

const BulkImportInput = z.object({
  zoneId: z.string().min(1),
  records: z
    .array(
      z.object({
        name: z.string().min(1).max(253),
        type: RecordTypeSchema,
        content: z.string().min(1).max(4096),
        ttl: z.number().int().positive().max(2_147_483_647).optional(),
        priority: z.number().int().min(0).max(65535).optional(),
      }),
    )
    .min(1)
    .max(1000),
});

// ── Router ─────────────────────────────────────────────────────────

export const dnsRouter = router({
  /** List every authoritative zone (admin-only). */
  listZones: adminProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(dnsZones);
  }),

  /** Fetch a single zone plus its records. */
  getZone: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const zoneRows = await ctx.db
        .select()
        .from(dnsZones)
        .where(eq(dnsZones.id, input.id))
        .limit(1);
      const zone = zoneRows[0];
      if (!zone) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "DNS zone not found.",
        });
      }
      const records = await ctx.db
        .select()
        .from(dnsRecords)
        .where(eq(dnsRecords.zoneId, input.id));
      return { zone, records };
    }),

  /**
   * Create a new zone. Auto-seeds the default SOA + NS records so the
   * zone is immediately answerable. Zone names are normalised
   * (trimmed + lowercased) before persistence.
   */
  createZone: adminProcedure
    .input(CreateZoneInput)
    .mutation(async ({ ctx, input }) => {
      const name = normaliseName(input.name);
      const primaryNs = normaliseName(input.primaryNs);
      const secondaryNs = input.secondaryNs
        ? normaliseName(input.secondaryNs)
        : null;

      if (!isHostname(name)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Zone name must be a valid hostname.",
        });
      }
      if (!isHostname(primaryNs)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Primary nameserver must be a valid hostname.",
        });
      }
      if (secondaryNs && !isHostname(secondaryNs)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Secondary nameserver must be a valid hostname.",
        });
      }

      const now = Date.now();
      const zoneId = newId("zone");

      await ctx.db.insert(dnsZones).values({
        id: zoneId,
        name,
        adminEmail: input.adminEmail,
        primaryNs,
        secondaryNs,
        refreshSeconds: input.refreshSeconds ?? 3600,
        retrySeconds: input.retrySeconds ?? 600,
        expireSeconds: input.expireSeconds ?? 604800,
        minimumTtl: input.minimumTtl ?? 300,
        serial: 1,
        createdAt: now,
        updatedAt: now,
      });

      // Seed default SOA record. Content is an opaque marker — the DNS
      // engine rebuilds the authoritative SOA from the zone row each
      // time it answers. Having a row keeps the record list complete.
      const soaContent = [
        primaryNs,
        input.adminEmail.replace("@", "."),
        "1",
        String(input.refreshSeconds ?? 3600),
        String(input.retrySeconds ?? 600),
        String(input.expireSeconds ?? 604800),
        String(input.minimumTtl ?? 300),
      ].join(" ");

      await ctx.db.insert(dnsRecords).values({
        id: newId("rec"),
        zoneId,
        name,
        type: "SOA",
        content: soaContent,
        ttl: input.minimumTtl ?? 300,
        priority: null,
        createdAt: now,
        updatedAt: now,
      });

      // Seed NS records (primary + optional secondary).
      await ctx.db.insert(dnsRecords).values({
        id: newId("rec"),
        zoneId,
        name,
        type: "NS",
        content: primaryNs,
        ttl: 3600,
        priority: null,
        createdAt: now,
        updatedAt: now,
      });
      if (secondaryNs) {
        await ctx.db.insert(dnsRecords).values({
          id: newId("rec"),
          zoneId,
          name,
          type: "NS",
          content: secondaryNs,
          ttl: 3600,
          priority: null,
          createdAt: now,
          updatedAt: now,
        });
      }

      return { id: zoneId, name };
    }),

  /**
   * Partial zone update. Always bumps the zone serial so downstream
   * secondaries pick up SOA changes.
   */
  updateZone: adminProcedure
    .input(UpdateZoneInput)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(dnsZones)
        .where(eq(dnsZones.id, input.id))
        .limit(1);
      if (existing.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "DNS zone not found.",
        });
      }

      const updates: Record<string, unknown> = { updatedAt: Date.now() };
      if (input.adminEmail !== undefined) updates["adminEmail"] = input.adminEmail;
      if (input.primaryNs !== undefined) {
        const pn = normaliseName(input.primaryNs);
        if (!isHostname(pn)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Primary nameserver must be a valid hostname.",
          });
        }
        updates["primaryNs"] = pn;
      }
      if (input.secondaryNs !== undefined) {
        if (input.secondaryNs === null) {
          updates["secondaryNs"] = null;
        } else {
          const sn = normaliseName(input.secondaryNs);
          if (!isHostname(sn)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Secondary nameserver must be a valid hostname.",
            });
          }
          updates["secondaryNs"] = sn;
        }
      }
      if (input.refreshSeconds !== undefined) updates["refreshSeconds"] = input.refreshSeconds;
      if (input.retrySeconds !== undefined) updates["retrySeconds"] = input.retrySeconds;
      if (input.expireSeconds !== undefined) updates["expireSeconds"] = input.expireSeconds;
      if (input.minimumTtl !== undefined) updates["minimumTtl"] = input.minimumTtl;

      // Bump serial as part of the same update (one statement, one bump).
      const currentSerial = existing[0]?.serial ?? 0;
      updates["serial"] = currentSerial + 1;

      await ctx.db
        .update(dnsZones)
        .set(updates)
        .where(eq(dnsZones.id, input.id));

      return { success: true as const, id: input.id };
    }),

  /** Delete a zone. Records cascade via the FK. */
  deleteZone: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(dnsZones)
        .where(eq(dnsZones.id, input.id))
        .limit(1);
      if (rows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "DNS zone not found.",
        });
      }
      // Explicit record delete first in case the underlying DB lacks
      // ON DELETE CASCADE support (SQLite honours it when foreign_keys
      // pragma is on; we do not assume).
      await ctx.db.delete(dnsRecords).where(eq(dnsRecords.zoneId, input.id));
      await ctx.db.delete(dnsZones).where(eq(dnsZones.id, input.id));
      return { success: true as const, id: input.id };
    }),

  /** Create a single record in a zone. Bumps zone serial. */
  createRecord: adminProcedure
    .input(CreateRecordInput)
    .mutation(async ({ ctx, input }) => {
      const zoneRows = await ctx.db
        .select()
        .from(dnsZones)
        .where(eq(dnsZones.id, input.zoneId))
        .limit(1);
      if (zoneRows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "DNS zone not found.",
        });
      }

      const name = normaliseName(input.name);
      validateRecordContent(input.type, input.content, input.priority ?? null);

      const id = newId("rec");
      const now = Date.now();
      await ctx.db.insert(dnsRecords).values({
        id,
        zoneId: input.zoneId,
        name,
        type: input.type,
        content: input.content,
        ttl: input.ttl ?? 300,
        priority: input.priority ?? null,
        createdAt: now,
        updatedAt: now,
      });

      await bumpZoneSerial(ctx.db, input.zoneId);
      return { id };
    }),

  /** Partial record update. Bumps zone serial. */
  updateRecord: adminProcedure
    .input(UpdateRecordInput)
    .mutation(async ({ ctx, input }) => {
      const existingRows = await ctx.db
        .select()
        .from(dnsRecords)
        .where(eq(dnsRecords.id, input.id))
        .limit(1);
      const existing = existingRows[0];
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "DNS record not found.",
        });
      }

      // Re-validate content against (potentially new) type + priority.
      const nextType: RecordType = input.type ?? existing.type;
      const nextContent: string = input.content ?? existing.content;
      const nextPriority: number | null =
        input.priority === undefined ? existing.priority : input.priority;

      validateRecordContent(nextType, nextContent, nextPriority);

      const updates: Record<string, unknown> = { updatedAt: Date.now() };
      if (input.name !== undefined) updates["name"] = normaliseName(input.name);
      if (input.type !== undefined) updates["type"] = input.type;
      if (input.content !== undefined) updates["content"] = input.content;
      if (input.ttl !== undefined) updates["ttl"] = input.ttl;
      if (input.priority !== undefined) updates["priority"] = input.priority;

      await ctx.db
        .update(dnsRecords)
        .set(updates)
        .where(eq(dnsRecords.id, input.id));

      await bumpZoneSerial(ctx.db, existing.zoneId);
      return { success: true as const, id: input.id };
    }),

  /** Delete a single record. Bumps zone serial. */
  deleteRecord: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const existingRows = await ctx.db
        .select()
        .from(dnsRecords)
        .where(eq(dnsRecords.id, input.id))
        .limit(1);
      const existing = existingRows[0];
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "DNS record not found.",
        });
      }
      await ctx.db.delete(dnsRecords).where(eq(dnsRecords.id, input.id));
      await bumpZoneSerial(ctx.db, existing.zoneId);
      return { success: true as const, id: input.id };
    }),

  /**
   * Bulk import of records into a zone. Validates every row before
   * writing anything — either every record lands or none do. Serial
   * is bumped exactly once at the end regardless of batch size so
   * secondaries do not thrash.
   */
  bulkImport: adminProcedure
    .input(BulkImportInput)
    .mutation(async ({ ctx, input }) => {
      const zoneRows = await ctx.db
        .select()
        .from(dnsZones)
        .where(eq(dnsZones.id, input.zoneId))
        .limit(1);
      if (zoneRows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "DNS zone not found.",
        });
      }

      // Validate everything up-front so a single bad row aborts the batch.
      for (const r of input.records) {
        validateRecordContent(r.type, r.content, r.priority ?? null);
      }

      const now = Date.now();
      const rows = input.records.map((r) => ({
        id: newId("rec"),
        zoneId: input.zoneId,
        name: normaliseName(r.name),
        type: r.type,
        content: r.content,
        ttl: r.ttl ?? 300,
        priority: r.priority ?? null,
        createdAt: now,
        updatedAt: now,
      }));

      // Drizzle batches a values array into a single INSERT — as close
      // to a transaction as libsql gives us without manual BEGIN/COMMIT.
      await ctx.db.insert(dnsRecords).values(rows);
      await bumpZoneSerial(ctx.db, input.zoneId);

      // Return only the IDs so callers can correlate without us echoing
      // the full payload back across the wire.
      return { inserted: rows.length, ids: rows.map((r) => r.id) };
    }),

  /**
   * List record types supported by the engine. Exposed so the admin UI
   * can render a dropdown without hardcoding the set client-side.
   */
  supportedTypes: adminProcedure.query(() => SUPPORTED_TYPES.slice()),

  /** List every record in a zone — convenience accessor for the UI. */
  listRecords: adminProcedure
    .input(z.object({ zoneId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(dnsRecords)
        .where(eq(dnsRecords.zoneId, input.zoneId));
    }),

  /** Fetch a single record by id — convenience accessor for the UI. */
  getRecord: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(dnsRecords)
        .where(and(eq(dnsRecords.id, input.id)))
        .limit(1);
      const rec = rows[0];
      if (!rec) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "DNS record not found.",
        });
      }
      return rec;
    }),
});
