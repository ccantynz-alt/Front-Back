import { db } from "@back-to-the-future/db";
import { creditBalances, creditTransactions } from "@back-to-the-future/db/schema";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../init";

const SIGNUP_BONUS_CENTS = 500; // $5.00

export const creditsRouter = router({
  // ── Get balance for the authenticated user ─────────────────────────
  // Lazy init: if no balance row exists, returns zeroed totals without
  // writing to the DB. The row is created on first earn/spend.
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    const row = await db.query.creditBalances.findFirst({
      where: eq(creditBalances.userId, ctx.userId),
    });

    return {
      balanceCents: row?.balanceCents ?? 0,
      lifetimeEarnedCents: row?.lifetimeEarnedCents ?? 0,
      lifetimeSpentCents: row?.lifetimeSpentCents ?? 0,
    };
  }),

  // ── Last 50 transactions for the authenticated user, newest first ──
  getTransactions: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, ctx.userId))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(50);
  }),

  // ── Admin: add credits to any user ────────────────────────────────
  earn: adminProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        amountCents: z.number().int().positive(),
        description: z.string().min(1),
        referenceId: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const now = new Date();
      const txId = crypto.randomUUID();

      // Upsert balance row
      const existing = await db.query.creditBalances.findFirst({
        where: eq(creditBalances.userId, input.userId),
      });

      if (existing) {
        await db
          .update(creditBalances)
          .set({
            balanceCents: existing.balanceCents + input.amountCents,
            lifetimeEarnedCents: existing.lifetimeEarnedCents + input.amountCents,
            updatedAt: now,
          })
          .where(eq(creditBalances.userId, input.userId));
      } else {
        await db.insert(creditBalances).values({
          userId: input.userId,
          balanceCents: input.amountCents,
          lifetimeEarnedCents: input.amountCents,
          lifetimeSpentCents: 0,
          updatedAt: now,
        });
      }

      await db.insert(creditTransactions).values({
        id: txId,
        userId: input.userId,
        amountCents: input.amountCents,
        kind: "adjustment",
        description: input.description,
        referenceId: input.referenceId ?? null,
        createdAt: now,
      });

      return { transactionId: txId, amountCents: input.amountCents };
    }),

  // ── Protected: deduct credits from the authenticated user ─────────
  // Returns PRECONDITION_FAILED if the balance is insufficient.
  spend: protectedProcedure
    .input(
      z.object({
        amountCents: z.number().int().positive(),
        description: z.string().min(1),
        referenceId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const txId = crypto.randomUUID();

      const existing = await db.query.creditBalances.findFirst({
        where: eq(creditBalances.userId, ctx.userId),
      });

      const currentBalance = existing?.balanceCents ?? 0;

      if (currentBalance < input.amountCents) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Insufficient credits. Balance: ${currentBalance} cents, required: ${input.amountCents} cents.`,
        });
      }

      if (existing) {
        await db
          .update(creditBalances)
          .set({
            balanceCents: existing.balanceCents - input.amountCents,
            lifetimeSpentCents: existing.lifetimeSpentCents + input.amountCents,
            updatedAt: now,
          })
          .where(eq(creditBalances.userId, ctx.userId));
      } else {
        // Should not reach here after the balance check above, but defensive init
        await db.insert(creditBalances).values({
          userId: ctx.userId,
          balanceCents: 0 - input.amountCents,
          lifetimeEarnedCents: 0,
          lifetimeSpentCents: input.amountCents,
          updatedAt: now,
        });
      }

      await db.insert(creditTransactions).values({
        id: txId,
        userId: ctx.userId,
        amountCents: -input.amountCents,
        kind: "spend",
        description: input.description,
        referenceId: input.referenceId ?? null,
        createdAt: now,
      });

      return { transactionId: txId, amountCents: input.amountCents };
    }),

  // ── Admin / internal: grant signup bonus ──────────────────────────
  // Idempotent — does nothing if the user already has a signup_bonus
  // transaction. Default bonus: 500 cents ($5.00).
  grantSignupBonus: adminProcedure
    .input(
      z.object({
        userId: z.string().min(1),
        bonusCents: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const bonus = input.bonusCents ?? SIGNUP_BONUS_CENTS;

      // Idempotency check: abort if a signup_bonus tx already exists
      const existingBonus = await db.query.creditTransactions.findFirst({
        where: and(
          eq(creditTransactions.userId, input.userId),
          eq(creditTransactions.kind, "signup_bonus"),
        ),
      });

      if (existingBonus) {
        return { granted: false, reason: "already_granted" as const };
      }

      const now = new Date();
      const txId = crypto.randomUUID();

      const existingBalance = await db.query.creditBalances.findFirst({
        where: eq(creditBalances.userId, input.userId),
      });

      if (existingBalance) {
        await db
          .update(creditBalances)
          .set({
            balanceCents: existingBalance.balanceCents + bonus,
            lifetimeEarnedCents: existingBalance.lifetimeEarnedCents + bonus,
            updatedAt: now,
          })
          .where(eq(creditBalances.userId, input.userId));
      } else {
        await db.insert(creditBalances).values({
          userId: input.userId,
          balanceCents: bonus,
          lifetimeEarnedCents: bonus,
          lifetimeSpentCents: 0,
          updatedAt: now,
        });
      }

      await db.insert(creditTransactions).values({
        id: txId,
        userId: input.userId,
        amountCents: bonus,
        kind: "signup_bonus",
        description: "Welcome bonus credits",
        referenceId: null,
        createdAt: now,
      });

      return { granted: true as const, transactionId: txId, bonusCents: bonus };
    }),
});
