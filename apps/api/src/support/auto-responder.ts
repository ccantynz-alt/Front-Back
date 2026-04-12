/**
 * Orchestrates the inbound email pipeline:
 * classify -> escalate? -> find/create thread -> draft -> auto-send or queue.
 */

import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import { db, supportTickets, supportMessages } from "@back-to-the-future/db";
import { sendEmail } from "../email/client";
import { classifyEmail } from "./classifier";
import { draftResponse } from "./drafter";
import { shouldEscalate } from "./escalation-rules";

export interface InboundEmail {
  from: string;
  to: string;
  subject: string;
  body: string;
  bodyHtml?: string | undefined;
}

export const AutoResponderActionSchema = z.enum(["auto_sent", "queued", "escalated"]);
export type AutoResponderAction = z.infer<typeof AutoResponderActionSchema>;

/**
 * Runtime type guard for AutoResponderAction. Useful when narrowing
 * values from queue payloads or webhook replay jobs without throwing.
 */
export function isAutoResponderAction(value: unknown): value is AutoResponderAction {
  return AutoResponderActionSchema.safeParse(value).success;
}

export interface AutoResponderResult {
  action: AutoResponderAction;
  ticketId: string;
  confidence: number;
  category: string;
}

function getThreshold(): number {
  const raw = process.env["SUPPORT_AUTO_SEND_THRESHOLD"];
  const n = raw ? Number.parseInt(raw, 10) : 85;
  return Number.isFinite(n) ? n : 85;
}

function getSupportFromAddress(): string {
  return process.env["SUPPORT_EMAIL"] ?? "support@yourdomain.com";
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSubject(subject: string): string {
  return subject.replace(/^(re:|fwd:|fw:)\s*/gi, "").trim().toLowerCase();
}

async function findExistingTicket(
  fromEmail: string,
  subject: string,
): Promise<{ id: string } | null> {
  const normalized = normalizeSubject(subject);
  const recent = await db
    .select({ id: supportTickets.id, subject: supportTickets.subject, status: supportTickets.status })
    .from(supportTickets)
    .where(eq(supportTickets.fromEmail, fromEmail))
    .orderBy(desc(supportTickets.createdAt))
    .limit(20);

  for (const t of recent) {
    if (
      normalizeSubject(t.subject) === normalized &&
      t.status !== "resolved"
    ) {
      return { id: t.id };
    }
  }
  return null;
}

export async function processInboundEmail(
  email: InboundEmail,
): Promise<AutoResponderResult> {
  const now = new Date();
  const fullText = `${email.subject}\n${email.body}`;

  // 1. Classify
  const classification = await classifyEmail(email.subject, email.body);

  // 2. Check escalation rules
  const mustEscalate = shouldEscalate(fullText);

  // 3. Find or create ticket / thread
  const existing = await findExistingTicket(email.from, email.subject);
  let ticketId: string;
  let threadHistory: { direction: "inbound" | "outbound"; body: string }[] = [];

  if (existing) {
    ticketId = existing.id;
    const prior = await db
      .select({ direction: supportMessages.direction, body: supportMessages.body })
      .from(supportMessages)
      .where(eq(supportMessages.ticketId, ticketId))
      .orderBy(supportMessages.sentAt);
    threadHistory = prior;
    await db
      .update(supportTickets)
      .set({ updatedAt: now, status: "new" })
      .where(eq(supportTickets.id, ticketId));
  } else {
    ticketId = newId("tkt");
    await db.insert(supportTickets).values({
      id: ticketId,
      userId: null,
      fromEmail: email.from,
      subject: email.subject,
      category: classification.category,
      status: "new",
      priority: classification.priority,
      threadId: ticketId,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Store inbound message
  await db.insert(supportMessages).values({
    id: newId("msg"),
    ticketId,
    direction: "inbound",
    fromAddress: email.from,
    toAddress: email.to,
    body: email.body,
    bodyHtml: email.bodyHtml ?? null,
    sentByAi: false,
    sentAt: now,
  });

  // Spam: drop silently into resolved
  if (classification.category === "spam") {
    await db
      .update(supportTickets)
      .set({ status: "resolved", resolvedAt: now, updatedAt: now })
      .where(eq(supportTickets.id, ticketId));
    return {
      action: "queued",
      ticketId,
      confidence: 100,
      category: "spam",
    };
  }

  // 4. Draft response
  const draft = await draftResponse(
    {
      fromEmail: email.from,
      subject: email.subject,
      body: email.body,
      category: classification.category,
    },
    threadHistory,
  );

  await db
    .update(supportTickets)
    .set({
      aiDraft: draft.draft,
      aiConfidence: draft.confidence,
      status: mustEscalate ? "escalated" : "ai_drafted",
      updatedAt: new Date(),
    })
    .where(eq(supportTickets.id, ticketId));

  // 5. Escalate or auto-send
  if (mustEscalate) {
    await db
      .update(supportTickets)
      .set({ status: "escalated", priority: "high", updatedAt: new Date() })
      .where(eq(supportTickets.id, ticketId));
    return {
      action: "escalated",
      ticketId,
      confidence: draft.confidence,
      category: classification.category,
    };
  }

  const threshold = getThreshold();
  if (draft.confidence >= threshold) {
    const html = draft.draft
      .split("\n\n")
      .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
      .join("");

    const sent = await sendEmail(
      email.from,
      `Re: ${email.subject.replace(/^re:\s*/i, "")}`,
      html,
    );

    if (sent.success) {
      const sentAt = new Date();
      await db.insert(supportMessages).values({
        id: newId("msg"),
        ticketId,
        direction: "outbound",
        fromAddress: getSupportFromAddress(),
        toAddress: email.from,
        body: draft.draft,
        bodyHtml: html,
        sentByAi: true,
        sentAt,
      });
      await db
        .update(supportTickets)
        .set({
          status: "sent",
          finalResponse: draft.draft,
          resolvedAt: sentAt,
          updatedAt: sentAt,
        })
        .where(eq(supportTickets.id, ticketId));

      return {
        action: "auto_sent",
        ticketId,
        confidence: draft.confidence,
        category: classification.category,
      };
    }
  }

  // Queue for human review
  await db
    .update(supportTickets)
    .set({ status: "awaiting_review", updatedAt: new Date() })
    .where(eq(supportTickets.id, ticketId));

  return {
    action: "queued",
    ticketId,
    confidence: draft.confidence,
    category: classification.category,
  };
}

export async function getAwaitingCount(): Promise<number> {
  const rows = await db
    .select({ id: supportTickets.id })
    .from(supportTickets)
    .where(
      and(
        eq(supportTickets.status, "awaiting_review"),
      ),
    );
  return rows.length;
}
