import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, sql, inArray, and } from "drizzle-orm";
import { router, protectedProcedure, publicProcedure, middleware } from "../init";
import {
  users,
  supportTickets,
  supportMessages,
} from "@back-to-the-future/db";
import { sendEmail } from "../../email/client";
import { processInboundEmail } from "../../support/auto-responder";

// ── Admin Middleware (local) ─────────────────────────────────────────

const enforceAdmin = middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required.",
    });
  }
  const result = await ctx.db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, ctx.userId))
    .limit(1);
  const user = result[0];
  if (!user || user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Admin role required.",
    });
  }
  return next({ ctx });
});

const adminProcedure = protectedProcedure.use(enforceAdmin);

const StatusEnum = z.enum([
  "new",
  "ai_drafted",
  "awaiting_review",
  "sent",
  "resolved",
  "escalated",
]);

const CategoryEnum = z.enum([
  "billing",
  "technical",
  "bug",
  "feature",
  "sales",
  "spam",
  "other",
]);

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

function getSupportFromAddress(): string {
  return process.env["SUPPORT_EMAIL"] ?? "support@yourdomain.com";
}

function bodyToHtml(body: string): string {
  return body
    .split("\n\n")
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export const supportRouter = router({
  // ── Admin: list tickets with optional filters ─────────────────────
  listTickets: adminProcedure
    .input(
      z
        .object({
          status: StatusEnum.optional(),
          statuses: z.array(StatusEnum).optional(),
          limit: z.number().int().min(1).max(200).default(50),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;
      const where = input?.statuses
        ? inArray(supportTickets.status, input.statuses)
        : input?.status
          ? eq(supportTickets.status, input.status)
          : undefined;

      const items = where
        ? await ctx.db
            .select()
            .from(supportTickets)
            .where(where)
            .orderBy(desc(supportTickets.updatedAt))
            .limit(limit)
        : await ctx.db
            .select()
            .from(supportTickets)
            .orderBy(desc(supportTickets.updatedAt))
            .limit(limit);

      return items;
    }),

  // ── Admin: get a single ticket with the full message thread ───────
  getTicket: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const ticketRows = await ctx.db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.id, input.id))
        .limit(1);
      const ticket = ticketRows[0];
      if (!ticket) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found." });
      }
      const messages = await ctx.db
        .select()
        .from(supportMessages)
        .where(eq(supportMessages.ticketId, input.id))
        .orderBy(supportMessages.sentAt);

      return { ticket, messages };
    }),

  // ── Admin: approve the AI draft and send it ───────────────────────
  approveDraft: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.id, input.id))
        .limit(1);
      const ticket = rows[0];
      if (!ticket) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found." });
      }
      if (!ticket.aiDraft) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No AI draft to approve.",
        });
      }
      const html = bodyToHtml(ticket.aiDraft);
      const result = await sendEmail(
        ticket.fromEmail,
        `Re: ${ticket.subject.replace(/^re:\s*/i, "")}`,
        html,
      );
      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error ?? "Failed to send email.",
        });
      }
      const now = new Date();
      await ctx.db.insert(supportMessages).values({
        id: newId("msg"),
        ticketId: ticket.id,
        direction: "outbound",
        fromAddress: getSupportFromAddress(),
        toAddress: ticket.fromEmail,
        body: ticket.aiDraft,
        bodyHtml: html,
        sentByAi: true,
        sentAt: now,
      });
      await ctx.db
        .update(supportTickets)
        .set({
          status: "sent",
          finalResponse: ticket.aiDraft,
          resolvedAt: now,
          updatedAt: now,
        })
        .where(eq(supportTickets.id, ticket.id));
      return { ok: true as const };
    }),

  // ── Admin: edit the draft and send ────────────────────────────────
  editAndSend: adminProcedure
    .input(z.object({ id: z.string(), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.id, input.id))
        .limit(1);
      const ticket = rows[0];
      if (!ticket) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Ticket not found." });
      }
      const html = bodyToHtml(input.body);
      const result = await sendEmail(
        ticket.fromEmail,
        `Re: ${ticket.subject.replace(/^re:\s*/i, "")}`,
        html,
      );
      if (!result.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error ?? "Failed to send email.",
        });
      }
      const now = new Date();
      await ctx.db.insert(supportMessages).values({
        id: newId("msg"),
        ticketId: ticket.id,
        direction: "outbound",
        fromAddress: getSupportFromAddress(),
        toAddress: ticket.fromEmail,
        body: input.body,
        bodyHtml: html,
        sentByAi: false,
        sentAt: now,
      });
      await ctx.db
        .update(supportTickets)
        .set({
          status: "sent",
          finalResponse: input.body,
          resolvedAt: now,
          updatedAt: now,
        })
        .where(eq(supportTickets.id, ticket.id));
      return { ok: true as const };
    }),

  // ── Admin: change status (escalate, resolve, etc.) ───────────────
  updateStatus: adminProcedure
    .input(
      z.object({
        id: z.string(),
        status: StatusEnum,
        assignedTo: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const update: Record<string, unknown> = {
        status: input.status,
        updatedAt: now,
      };
      if (input.status === "resolved") update["resolvedAt"] = now;
      if (input.assignedTo) update["assignedTo"] = input.assignedTo;
      await ctx.db
        .update(supportTickets)
        .set(update)
        .where(eq(supportTickets.id, input.id));
      return { ok: true as const };
    }),

  // ── Admin: stats for the dashboard ───────────────────────────────
  getStats: adminProcedure.query(async ({ ctx }) => {
    const totalRows = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(supportTickets);
    const totalTickets = totalRows[0]?.count ?? 0;

    const autoResolvedRows = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(supportTickets)
      .where(eq(supportTickets.status, "sent"));
    const autoResolved = autoResolvedRows[0]?.count ?? 0;

    const awaitingRows = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(supportTickets)
      .where(eq(supportTickets.status, "awaiting_review"));
    const awaitingReview = awaitingRows[0]?.count ?? 0;

    const escalatedRows = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(supportTickets)
      .where(eq(supportTickets.status, "escalated"));
    const escalated = escalatedRows[0]?.count ?? 0;

    const resolvedRows = await ctx.db
      .select({
        created: supportTickets.createdAt,
        resolved: supportTickets.resolvedAt,
      })
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.status, "sent"),
        ),
      )
      .limit(200);

    let totalMs = 0;
    let counted = 0;
    for (const r of resolvedRows) {
      if (r.resolved && r.created) {
        totalMs += r.resolved.getTime() - r.created.getTime();
        counted += 1;
      }
    }
    const avgResponseTime = counted > 0 ? Math.round(totalMs / counted / 1000) : 0;

    const aiAccuracy = totalTickets > 0
      ? Math.round((autoResolved / totalTickets) * 100)
      : 0;

    return {
      totalTickets,
      autoResolved,
      awaitingReview,
      escalated,
      avgResponseTime,
      aiAccuracy,
    };
  }),

  // ── User-facing: submit a request via the support form ──────────
  submitRequest: protectedProcedure
    .input(
      z.object({
        category: CategoryEnum,
        subject: z.string().min(2).max(200),
        body: z.string().min(5).max(10_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userRows = await ctx.db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1);
      const userEmail = userRows[0]?.email;
      if (!userEmail) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Account email not found.",
        });
      }
      const result = await processInboundEmail({
        from: userEmail,
        to: getSupportFromAddress(),
        subject: input.subject,
        body: input.body,
      });
      return result;
    }),

  // ── Public: submit a support request from the unauth /support page.
  // The previous implementation setTimeout-faked a submission; messages
  // from prospects never reached anyone. This routes them into the
  // same ticketing pipeline as authenticated submissions, but derives
  // `from` from the user-provided email instead of the session.
  submitPublic: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(120),
        email: z.string().trim().email().max(254),
        category: CategoryEnum,
        message: z.string().trim().min(10).max(10_000),
      }),
    )
    .mutation(async ({ input }) => {
      const subject =
        `[${input.category}] ${input.message.slice(0, 60).replace(/\s+/g, " ").trim()}` +
        (input.message.length > 60 ? "..." : "");
      const body = `From: ${input.name} <${input.email}>\n\n${input.message}`;
      const result = await processInboundEmail({
        from: input.email,
        to: getSupportFromAddress(),
        subject,
        body,
      });
      return {
        ticketId: result.ticketId,
        action: result.action,
      };
    }),
});
