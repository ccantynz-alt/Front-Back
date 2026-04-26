// ── BLK-024 — Domain registrar procedures ─────────────────────────────
// tRPC surface for Crontech's domain registrar (Tucows OpenSRS reseller
// API). Customers search availability across TLDs, pay us retail, we pay
// OpenSRS wholesale, and keep the difference. All writes (register,
// renew) are admin-gated for now — Craig will front every registration
// manually until the billing integration (separate block) lands.
//
// Procedures exposed:
//   • search({ query, tlds? })       — public   — availability fan-out
//   • getPricing({ domain })         — public   — wholesale + markup
//   • register({ domain, years, … }) — admin    — SW_REGISTER + DB row
//   • renew({ domain, years })       — admin    — RENEW + bump expiry
//   • listMyDomains()                — auth     — this user's domains
//
// Non-scope: the AI-powered search (BLK-025) is a separate agent, and
// the self-hosted DNS import (BLK-023) shipped separately. We don't
// write DNS records from here — that's deliberate.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { domainRegistrations } from "@back-to-the-future/db";
import {
  router,
  publicProcedure,
  protectedProcedure,
  adminProcedure,
} from "../init";
import type { TRPCContext } from "../context";
import {
  OpensrsClient,
  OpensrsError,
  applyMarkup,
  configFromEnv,
  dollarsToMicrodollars,
  markupPercentFromEnv,
  type OpensrsConfig,
  type OpensrsClientDeps,
} from "../../domains/opensrs-client";
import {
  ContactInfoSchema,
  type AvailabilityResult,
  type PriceQuote,
} from "../../domains/opensrs-types";

// ── Client factory (dependency-injected for tests) ────────────────────
// The router holds a single factory that tests can swap out by assigning
// `__testClientOverride`. We keep it plain-old functional so nothing in
// the request path touches a shared mutable singleton beyond that one
// override slot.

type ClientFactory = (config?: OpensrsConfig, deps?: OpensrsClientDeps) => OpensrsClient;

interface RouterTestHooks {
  clientFactory: ClientFactory | undefined;
  markupPercent: number | undefined;
}

const testHooks: RouterTestHooks = {
  clientFactory: undefined,
  markupPercent: undefined,
};

/** Test-only: swap the OpenSRS client factory (e.g. to mock fetch). */
export function __setDomainsTestHooks(hooks: {
  clientFactory?: ClientFactory;
  markupPercent?: number;
}): void {
  testHooks.clientFactory = hooks.clientFactory;
  testHooks.markupPercent = hooks.markupPercent;
}

/** Test-only: reset hooks between tests. */
export function __resetDomainsTestHooks(): void {
  testHooks.clientFactory = undefined;
  testHooks.markupPercent = undefined;
}

function makeClient(): OpensrsClient {
  if (testHooks.clientFactory) return testHooks.clientFactory();
  return new OpensrsClient(configFromEnv());
}

function currentMarkupPercent(): number {
  return testHooks.markupPercent ?? markupPercentFromEnv();
}

// ── Helpers ───────────────────────────────────────────────────────────

const DEFAULT_TLDS = [".com", ".net", ".org", ".io", ".ai", ".dev"] as const;

function normaliseQuery(raw: string): { sld: string; providedTld: string | null } {
  const trimmed = raw.trim().toLowerCase();
  const firstDot = trimmed.indexOf(".");
  if (firstDot === -1) return { sld: trimmed, providedTld: null };
  return {
    sld: trimmed.slice(0, firstDot),
    providedTld: trimmed.slice(firstDot),
  };
}

function extractTld(domain: string): string {
  const idx = domain.indexOf(".");
  return idx === -1 ? "" : domain.slice(idx);
}

function parseExpiry(value: string | undefined): Date {
  if (!value) {
    // Fall back to one year from now if OpenSRS doesn't echo the date.
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  return parsed;
}

function newId(): string {
  return `dom_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

function translateOpensrsError(err: unknown, fallbackMessage: string): never {
  if (err instanceof OpensrsError) {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: err.message,
      cause: err,
    });
  }
  if (err instanceof TRPCError) throw err;
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: fallbackMessage,
    cause: err instanceof Error ? err : undefined,
  });
}

// ── Input schemas ─────────────────────────────────────────────────────

const SearchInputSchema = z.object({
  query: z
    .string()
    .min(1, "Please enter a domain name to search.")
    .max(253, "Domain names cannot be longer than 253 characters."),
  tlds: z.array(z.string().startsWith(".")).optional(),
});

const PricingInputSchema = z.object({
  domain: z.string().min(3).max(253),
  years: z.number().int().min(1).max(10).optional(),
});

const RegisterInputSchema = z.object({
  domain: z.string().min(3).max(253),
  years: z.number().int().min(1).max(10),
  contactInfo: ContactInfoSchema,
  userId: z.string().optional(),
  autoRenew: z.boolean().optional(),
  nameservers: z.array(z.string().min(1)).optional(),
});

const RenewInputSchema = z.object({
  domain: z.string().min(3).max(253),
  years: z.number().int().min(1).max(10),
});

// ── Router ────────────────────────────────────────────────────────────

export const domainsRouter = router({
  /**
   * Public: check availability for `query` against the requested TLDs
   * (defaults to .com/.net/.org/.io/.ai/.dev). Runs every lookup in
   * parallel — OpenSRS LOOKUP is already the slowest hop, no reason to
   * serialise.
   *
   * If the caller passes a fully-qualified domain (e.g. "crontech.ai"),
   * the SLD is extracted and the provided TLD is prepended to whatever
   * else the caller asked for so the explicit TLD always appears first.
   */
  search: publicProcedure
    .input(SearchInputSchema)
    .query(async ({ input }): Promise<{ results: AvailabilityResult[] }> => {
      const client = makeClient();
      const { sld, providedTld } = normaliseQuery(input.query);
      const requested = input.tlds ?? Array.from(DEFAULT_TLDS);
      const tlds = providedTld
        ? [providedTld, ...requested.filter((t) => t !== providedTld)]
        : requested;
      const domains = tlds.map((t) => `${sld}${t}`);

      const settled = await Promise.allSettled(
        domains.map(async (domain): Promise<AvailabilityResult> => {
          try {
            const attrs = await client.lookup(domain);
            const result: AvailabilityResult = {
              domain,
              available: attrs.status === "available",
              status: attrs.status,
            };
            if (attrs.reason !== undefined) result.reason = attrs.reason;
            return result;
          } catch (err) {
            return {
              domain,
              available: false,
              status: "unknown",
              reason:
                err instanceof OpensrsError
                  ? err.message
                  : "Availability lookup failed.",
            };
          }
        }),
      );

      const results = settled.map((r, idx): AvailabilityResult =>
        r.status === "fulfilled"
          ? r.value
          : {
              domain: domains[idx] ?? "",
              available: false,
              status: "unknown",
              reason: "Availability lookup failed.",
            },
      );
      return { results };
    }),

  /**
   * Public: fetch wholesale + retail pricing for a single domain. Returns
   * both figures so callers can show "our price" without re-calculating.
   */
  getPricing: publicProcedure
    .input(PricingInputSchema)
    .query(async ({ input }): Promise<PriceQuote> => {
      const years = input.years ?? 1;
      const client = makeClient();
      try {
        const attrs = await client.getPrice(input.domain, years);
        const wholesaleMicrodollars = dollarsToMicrodollars(attrs.price);
        const markupPercent = currentMarkupPercent();
        const { retailMicrodollars, markupMicrodollars } = applyMarkup(
          wholesaleMicrodollars,
          markupPercent,
        );
        return {
          domain: input.domain,
          years,
          wholesaleMicrodollars,
          retailMicrodollars,
          markupMicrodollars,
          markupPercent,
          currency: attrs.currency ?? "USD",
        };
      } catch (err) {
        translateOpensrsError(err, "Failed to fetch domain pricing.");
      }
    }),

  /**
   * Admin-only: register a domain via SW_REGISTER and persist a row in
   * `domain_registrations` with both wholesale cost and our markup so
   * the revenue side can audit every sale without re-querying OpenSRS.
   */
  register: adminProcedure
    .input(RegisterInputSchema)
    .mutation(async ({ input, ctx }) => {
      const client = makeClient();
      const customerId = input.userId ?? ctx.userId;
      let wholesaleMicrodollars = 0;
      let retailMicrodollars = 0;
      let markupMicrodollars = 0;
      const markupPercent = currentMarkupPercent();

      try {
        const priceAttrs = await client.getPrice(input.domain, input.years);
        wholesaleMicrodollars = dollarsToMicrodollars(priceAttrs.price);
        const marked = applyMarkup(wholesaleMicrodollars, markupPercent);
        retailMicrodollars = marked.retailMicrodollars;
        markupMicrodollars = marked.markupMicrodollars;
      } catch (err) {
        translateOpensrsError(err, "Failed to fetch wholesale price before registering.");
      }

      let opensrsHandle: string | undefined;
      let expiresAt: Date;
      try {
        const regInput: Parameters<typeof client.register>[0] = {
          domain: input.domain,
          years: input.years,
          contact: input.contactInfo,
        };
        if (input.nameservers !== undefined) {
          regInput.nameservers = input.nameservers;
        }
        const attrs = await client.register(regInput);
        const id = attrs.order_id ?? attrs.id;
        opensrsHandle = id === undefined ? undefined : String(id);
        expiresAt = parseExpiry(attrs.registration_expiration_date);
      } catch (err) {
        translateOpensrsError(err, "Domain registration failed at OpenSRS.");
      }

      const row: typeof domainRegistrations.$inferInsert = {
        id: newId(),
        userId: customerId,
        domain: input.domain,
        tld: extractTld(input.domain),
        expiresAt,
        autoRenew: input.autoRenew ?? false,
        costMicrodollars: wholesaleMicrodollars,
        markupMicrodollars,
        status: "active",
      };
      if (opensrsHandle !== undefined) row.opensrsHandle = opensrsHandle;

      await ctx.db.insert(domainRegistrations).values(row);

      return {
        id: row.id,
        domain: input.domain,
        opensrsHandle,
        expiresAt: expiresAt.toISOString(),
        wholesaleMicrodollars,
        retailMicrodollars,
        markupMicrodollars,
        markupPercent,
      };
    }),

  /**
   * Admin-only: renew a domain we've already registered for the caller.
   * Updates the persisted expiry so `listMyDomains` reflects it.
   */
  renew: adminProcedure
    .input(RenewInputSchema)
    .mutation(async ({ input, ctx }) => {
      const existing = await ctx.db
        .select()
        .from(domainRegistrations)
        .where(eq(domainRegistrations.domain, input.domain))
        .limit(1);
      const row = existing[0];
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `We do not have a record of ${input.domain}. Register it first.`,
        });
      }

      const client = makeClient();
      let expiresAt: Date;
      try {
        const attrs = await client.renew({
          domain: input.domain,
          years: input.years,
          ...(row.expiresAt
            ? { currentExpiration: String(row.expiresAt.getFullYear()) }
            : {}),
          autoRenew: row.autoRenew,
        });
        expiresAt = parseExpiry(attrs.registration_expiration_date);
      } catch (err) {
        translateOpensrsError(err, "Domain renewal failed at OpenSRS.");
      }

      await ctx.db
        .update(domainRegistrations)
        .set({ expiresAt, updatedAt: new Date(), status: "active" })
        .where(eq(domainRegistrations.id, row.id));

      return {
        id: row.id,
        domain: input.domain,
        expiresAt: expiresAt.toISOString(),
      };
    }),

  /**
   * Authenticated: list every domain registered under the caller. The
   * admin caller sees their own — cross-user listing would be a
   * separate admin-only procedure.
   */
  listMyDomains: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(domainRegistrations)
      .where(eq(domainRegistrations.userId, ctx.userId))
      .orderBy(desc(domainRegistrations.createdAt));
    return rows.map((r) => ({
      id: r.id,
      domain: r.domain,
      tld: r.tld,
      registeredAt: r.registeredAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      autoRenew: r.autoRenew,
      status: r.status,
      costMicrodollars: r.costMicrodollars,
      markupMicrodollars: r.markupMicrodollars,
    }));
  }),
});

export type DomainsRouter = typeof domainsRouter;

// Re-exported for tests / admin tooling.
export type { TRPCContext };
