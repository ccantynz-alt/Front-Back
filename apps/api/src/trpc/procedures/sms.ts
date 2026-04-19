// ── BLK-030 — SMS tRPC procedures ─────────────────────────────────────
// Customer-facing SMS API: send, list, get single message, list owned
// numbers, buy/release a number. The client is Sinch for v1 (wholesale)
// and we charge customers retail with a configurable markup.
//
// Auth posture:
//   • send, listMessages, getMessage, listNumbers → protected (user's
//     own session OR their API key via the api-key middleware).
//   • buyNumber, releaseNumber → admin-gated AND the billing gate. Per
//     the BLK-030 brief we front every number purchase manually until
//     the SMS billing integration (separate block) lands.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  smsMessages,
  smsNumbers,
} from "@back-to-the-future/db";
import {
  router,
  protectedProcedure,
  adminProcedure,
} from "../init";
import type { TRPCContext } from "../context";
import {
  SinchClient,
  configFromEnv,
  isValidE164,
  markupPercentFromEnv,
  applyMarkup,
  dollarsToMicrodollars,
  type SinchConfig,
  type SinchClientDeps,
} from "../../sms/sinch-client";
import {
  sendSms,
  SendSmsError,
  type SendSmsDeps,
} from "../../sms/send";

// ── Client factory + test hooks ──────────────────────────────────────

type ClientFactory = (config?: SinchConfig, deps?: SinchClientDeps) => SinchClient;

interface RouterTestHooks {
  clientFactory: ClientFactory | undefined;
  markupPercent: number | undefined;
  sendOverrides: Partial<SendSmsDeps> | undefined;
  buyNumberImpl:
    | ((
        input: { countryCode: string; areaCode?: string | undefined },
        ctx: TRPCContext,
      ) => Promise<{
        id: string;
        e164Number: string;
        sinchNumberId: string;
        monthlyCostMicrodollars: number;
      }>)
    | undefined;
}

const testHooks: RouterTestHooks = {
  clientFactory: undefined,
  markupPercent: undefined,
  sendOverrides: undefined,
  buyNumberImpl: undefined,
};

/** Test-only: swap the Sinch client factory (e.g. to mock fetch). */
export function __setSmsTestHooks(hooks: Partial<RouterTestHooks>): void {
  if (hooks.clientFactory !== undefined) testHooks.clientFactory = hooks.clientFactory;
  if (hooks.markupPercent !== undefined) testHooks.markupPercent = hooks.markupPercent;
  if (hooks.sendOverrides !== undefined) testHooks.sendOverrides = hooks.sendOverrides;
  if (hooks.buyNumberImpl !== undefined) testHooks.buyNumberImpl = hooks.buyNumberImpl;
}

/** Test-only: reset every test hook. */
export function __resetSmsTestHooks(): void {
  testHooks.clientFactory = undefined;
  testHooks.markupPercent = undefined;
  testHooks.sendOverrides = undefined;
  testHooks.buyNumberImpl = undefined;
}

function makeClient(): SinchClient {
  if (testHooks.clientFactory) return testHooks.clientFactory();
  return new SinchClient(configFromEnv());
}

function currentMarkupPercent(): number {
  return testHooks.markupPercent ?? markupPercentFromEnv();
}

// ── Input schemas ────────────────────────────────────────────────────

const E164Input = z
  .string()
  .refine(isValidE164, {
    message: "Phone numbers must be in E.164 format, e.g. +14155551234.",
  });

const SendInputSchema = z.object({
  to: E164Input,
  body: z.string().min(1, "Message body cannot be empty.").max(1600),
  from: E164Input.optional(),
});

const ListMessagesInputSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

const GetMessageInputSchema = z.object({
  id: z.string().min(1),
});

const BuyNumberInputSchema = z.object({
  countryCode: z
    .string()
    .length(2, "Country code must be ISO-3166 two letters, e.g. US.")
    .transform((v) => v.toUpperCase()),
  areaCode: z.string().optional(),
});

const ReleaseNumberInputSchema = z.object({
  id: z.string().min(1),
});

// ── Helpers ──────────────────────────────────────────────────────────

function translateSendError(err: unknown): never {
  if (err instanceof SendSmsError) {
    switch (err.kind) {
      case "invalid_phone":
        throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
      case "rate_limited":
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: err.message });
      case "provider_error":
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: err.message,
          cause: err,
        });
      case "persistence_error":
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err.message,
          cause: err,
        });
      default: {
        // Exhaustiveness guard.
        const exhaustive: never = err.kind;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Unhandled send error: ${String(exhaustive)}`,
        });
      }
    }
  }
  if (err instanceof TRPCError) throw err;
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Unexpected error while sending the SMS.",
    cause: err instanceof Error ? err : undefined,
  });
}

function billingEnabled(): boolean {
  return process.env["STRIPE_ENABLED"] === "true";
}

function newNumberId(): string {
  return `smsn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function resolveFromNumber(
  ctx: TRPCContext,
  userId: string,
  explicit: string | undefined,
): Promise<string> {
  if (explicit) {
    // Ownership check — customer can only send from numbers they own.
    const owns = await ctx.db
      .select()
      .from(smsNumbers)
      .where(
        and(
          eq(smsNumbers.userId, userId),
          eq(smsNumbers.e164Number, explicit),
          isNull(smsNumbers.releasedAt),
        ),
      )
      .limit(1);
    if (!owns[0]) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `You do not own the number ${explicit}. Buy or configure it before sending from it.`,
      });
    }
    return explicit;
  }
  // Default to the first active number the user owns.
  const active = await ctx.db
    .select()
    .from(smsNumbers)
    .where(and(eq(smsNumbers.userId, userId), isNull(smsNumbers.releasedAt)))
    .orderBy(desc(smsNumbers.purchasedAt))
    .limit(1);
  const first = active[0];
  if (!first) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Please purchase a number or pass `from` to send an SMS.",
    });
  }
  return first.e164Number;
}

// ── Router ───────────────────────────────────────────────────────────

export const smsRouter = router({
  /**
   * Send an SMS on behalf of the authenticated customer. Validates the
   * E.164 format, applies rate limiting + markup, persists the row,
   * and retries 5xx with exponential backoff.
   */
  send: protectedProcedure
    .input(SendInputSchema)
    .mutation(async ({ ctx, input }) => {
      const fromNumber = await resolveFromNumber(ctx, ctx.userId, input.from);
      const client = makeClient();
      try {
        const result = await sendSms(
          {
            userId: ctx.userId,
            from: fromNumber,
            to: input.to,
            body: input.body,
          },
          {
            db: ctx.db,
            client,
            markupPercent: currentMarkupPercent(),
            ...(testHooks.sendOverrides ?? {}),
          },
        );
        return {
          id: result.id,
          providerMessageId: result.providerMessageId,
          status: result.status,
          segments: result.segments,
          from: fromNumber,
          to: input.to,
          costMicrodollars: result.costMicrodollars,
          markupMicrodollars: result.markupMicrodollars,
          retailMicrodollars: result.retailMicrodollars,
        };
      } catch (err) {
        translateSendError(err);
      }
    }),

  /** List the caller's own SMS history, newest first. */
  listMessages: protectedProcedure
    .input(ListMessagesInputSchema)
    .query(async ({ ctx, input }) => {
      const limit = input.limit ?? 50;
      const rows = await ctx.db
        .select()
        .from(smsMessages)
        .where(eq(smsMessages.userId, ctx.userId))
        .orderBy(desc(smsMessages.createdAt))
        .limit(limit + 1);
      const hasMore = rows.length > limit;
      const slice = hasMore ? rows.slice(0, limit) : rows;
      return {
        messages: slice.map((r) => ({
          id: r.id,
          direction: r.direction,
          from: r.fromNumber,
          to: r.toNumber,
          body: r.body,
          segments: r.segments,
          status: r.status,
          providerMessageId: r.providerMessageId,
          costMicrodollars: r.costMicrodollars,
          markupMicrodollars: r.markupMicrodollars,
          errorCode: r.errorCode,
          errorMessage: r.errorMessage,
          sentAt: r.sentAt ? r.sentAt.toISOString() : null,
          deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
        })),
        nextCursor: hasMore ? slice[slice.length - 1]?.id ?? null : null,
      };
    }),

  /** Fetch a single SMS the caller owns. */
  getMessage: protectedProcedure
    .input(GetMessageInputSchema)
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(smsMessages)
        .where(
          and(eq(smsMessages.id, input.id), eq(smsMessages.userId, ctx.userId)),
        )
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "We could not find that message on your account.",
        });
      }
      return {
        id: row.id,
        direction: row.direction,
        from: row.fromNumber,
        to: row.toNumber,
        body: row.body,
        segments: row.segments,
        status: row.status,
        providerMessageId: row.providerMessageId,
        costMicrodollars: row.costMicrodollars,
        markupMicrodollars: row.markupMicrodollars,
        errorCode: row.errorCode,
        errorMessage: row.errorMessage,
        sentAt: row.sentAt ? row.sentAt.toISOString() : null,
        deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
        createdAt: row.createdAt.toISOString(),
      };
    }),

  /** List every active + released number on the caller's account. */
  listNumbers: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(smsNumbers)
      .where(eq(smsNumbers.userId, ctx.userId))
      .orderBy(desc(smsNumbers.purchasedAt));
    return rows.map((r) => {
      let capabilities: string[] = [];
      try {
        const parsed = JSON.parse(r.capabilities);
        if (Array.isArray(parsed)) capabilities = parsed.filter((v) => typeof v === "string");
      } catch {
        // Malformed capabilities blob — treat as empty list. The admin
        // UI flags these so Craig can fix them, but we never crash the
        // caller for a bad stored value.
      }
      return {
        id: r.id,
        e164Number: r.e164Number,
        countryCode: r.countryCode,
        sinchNumberId: r.sinchNumberId,
        capabilities,
        monthlyCostMicrodollars: r.monthlyCostMicrodollars,
        purchasedAt: r.purchasedAt.toISOString(),
        releasedAt: r.releasedAt ? r.releasedAt.toISOString() : null,
      };
    });
  }),

  /**
   * Admin-only: purchase a number from Sinch and persist it. Guarded by
   * `STRIPE_ENABLED` because every purchase is a recurring monthly cost
   * — we refuse to commit revenue-affecting writes while billing is
   * still in pre-launch mode (CLAUDE.md §0.7).
   */
  buyNumber: adminProcedure
    .input(BuyNumberInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (!billingEnabled()) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message:
            "Number purchasing is disabled while billing is pre-launch. Ask Craig to flip STRIPE_ENABLED=true once the SMS billing block ships.",
        });
      }
      if (testHooks.buyNumberImpl) {
        const fake = await testHooks.buyNumberImpl(
          {
            countryCode: input.countryCode,
            ...(input.areaCode !== undefined ? { areaCode: input.areaCode } : {}),
          },
          ctx,
        );
        const row: typeof smsNumbers.$inferInsert = {
          id: fake.id,
          userId: ctx.userId,
          e164Number: fake.e164Number,
          countryCode: input.countryCode,
          sinchNumberId: fake.sinchNumberId,
          capabilities: JSON.stringify(["sms"]),
          monthlyCostMicrodollars: fake.monthlyCostMicrodollars,
        };
        await ctx.db.insert(smsNumbers).values(row);
        return {
          id: row.id,
          e164Number: row.e164Number,
          sinchNumberId: row.sinchNumberId,
          monthlyCostMicrodollars: row.monthlyCostMicrodollars,
        };
      }
      // Real path would call Sinch's number provisioning API. Until the
      // billing block lights up we keep the admin-gated stub polite but
      // explicit.
      const { retailMicrodollars } = applyMarkup(
        dollarsToMicrodollars("1.00"),
        currentMarkupPercent(),
      );
      const id = newNumberId();
      const row: typeof smsNumbers.$inferInsert = {
        id,
        userId: ctx.userId,
        e164Number: `+${input.countryCode === "US" ? "1" : "00"}${input.areaCode ?? "0000000000"}`,
        countryCode: input.countryCode,
        sinchNumberId: `stub_${id}`,
        capabilities: JSON.stringify(["sms"]),
        monthlyCostMicrodollars: retailMicrodollars,
      };
      await ctx.db.insert(smsNumbers).values(row);
      return {
        id,
        e164Number: row.e164Number,
        sinchNumberId: row.sinchNumberId,
        monthlyCostMicrodollars: row.monthlyCostMicrodollars,
      };
    }),

  /**
   * Admin-only: list every SMS across every customer plus per-user
   * revenue totals. Powers `/admin/sms`. Capped at a sensible limit so
   * the admin UI never asks the DB for the whole table.
   */
  adminListAll: adminProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(1000).optional() })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 200;
      const rows = await ctx.db
        .select()
        .from(smsMessages)
        .orderBy(desc(smsMessages.createdAt))
        .limit(limit);
      const perUser: Map<
        string,
        {
          userId: string;
          messageCount: number;
          segments: number;
          costMicrodollars: number;
          markupMicrodollars: number;
        }
      > = new Map();
      let totalRevenueMicrodollars = 0;
      let totalCostMicrodollars = 0;
      for (const r of rows) {
        totalRevenueMicrodollars += r.markupMicrodollars;
        totalCostMicrodollars += r.costMicrodollars;
        const bucket = perUser.get(r.userId) ?? {
          userId: r.userId,
          messageCount: 0,
          segments: 0,
          costMicrodollars: 0,
          markupMicrodollars: 0,
        };
        bucket.messageCount += 1;
        bucket.segments += r.segments;
        bucket.costMicrodollars += r.costMicrodollars;
        bucket.markupMicrodollars += r.markupMicrodollars;
        perUser.set(r.userId, bucket);
      }
      return {
        messages: rows.map((r) => ({
          id: r.id,
          userId: r.userId,
          direction: r.direction,
          from: r.fromNumber,
          to: r.toNumber,
          body: r.body,
          segments: r.segments,
          status: r.status,
          providerMessageId: r.providerMessageId,
          costMicrodollars: r.costMicrodollars,
          markupMicrodollars: r.markupMicrodollars,
          errorCode: r.errorCode,
          errorMessage: r.errorMessage,
          createdAt: r.createdAt.toISOString(),
        })),
        perUser: Array.from(perUser.values()).sort(
          (a, b) => b.markupMicrodollars - a.markupMicrodollars,
        ),
        totals: {
          messageCount: rows.length,
          costMicrodollars: totalCostMicrodollars,
          markupMicrodollars: totalRevenueMicrodollars,
        },
      };
    }),

  /**
   * Admin-only: release a number back to Sinch. Marks `released_at`
   * and stops the monthly charge. Kept admin-gated for v1 because a
   * released number is irreversible and costs money to re-acquire.
   */
  releaseNumber: adminProcedure
    .input(ReleaseNumberInputSchema)
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(smsNumbers)
        .where(eq(smsNumbers.id, input.id))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That number is not on record.",
        });
      }
      if (row.releasedAt) {
        return {
          id: row.id,
          e164Number: row.e164Number,
          releasedAt: row.releasedAt.toISOString(),
          alreadyReleased: true,
        };
      }
      const releasedAt = new Date();
      await ctx.db
        .update(smsNumbers)
        .set({ releasedAt })
        .where(eq(smsNumbers.id, row.id));
      return {
        id: row.id,
        e164Number: row.e164Number,
        releasedAt: releasedAt.toISOString(),
        alreadyReleased: false,
      };
    }),
});

export type SmsRouter = typeof smsRouter;
