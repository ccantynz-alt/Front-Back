/**
 * Response drafter for the AI support system.
 * Combines knowledge base context with thread history to generate a draft.
 */

import { z } from "zod";
import { searchKnowledgeBase, type KnowledgeEntry } from "./knowledge-base";

export interface DraftInputTicket {
  fromEmail: string;
  subject: string;
  body: string;
  category: string;
}

export interface DraftThreadMessage {
  direction: "inbound" | "outbound";
  body: string;
}

export interface DraftResult {
  draft: string;
  confidence: number;
  reasoning: string;
}

export const DraftSchema = z.object({
  draft: z.string(),
  confidence: z.number().int().min(0).max(100),
  reasoning: z.string(),
});

const BRAND_VOICE = `You are the support agent for Marco Reid, an AI-native full-stack platform.
Voice: confident, warm, plain English, no jargon, no emojis, no exclamation marks.
Never invent features that are not in the knowledge base.
If the answer is not in the knowledge base, return a low confidence and say a teammate will follow up.
Always sign off as: "— The Marco Reid support team".`;

function buildKnowledgeContext(entries: KnowledgeEntry[]): string {
  if (entries.length === 0) return "(no relevant entries found)";
  return entries
    .map(
      (e, i) =>
        `[${i + 1}] Q: ${e.question}\n    A: ${e.answer}`,
    )
    .join("\n\n");
}

function buildThreadContext(thread: DraftThreadMessage[]): string {
  if (thread.length === 0) return "(no prior messages)";
  return thread
    .map(
      (m) =>
        `${m.direction === "inbound" ? "Customer" : "Support"}: ${m.body}`,
    )
    .join("\n\n");
}

function templateDraft(ticket: DraftInputTicket, entries: KnowledgeEntry[]): DraftResult {
  if (entries.length > 0) {
    const top = entries[0];
    if (top) {
      return {
        draft: `Hi,\n\nThanks for reaching out about "${ticket.subject}".\n\n${top.answer}\n\nLet us know if anything is still unclear.\n\n— The Marco Reid support team`,
        confidence: 70,
        reasoning: `Template fallback using knowledge base entry "${top.id}".`,
      };
    }
  }
  return {
    draft: `Hi,\n\nThanks for reaching out. A teammate will follow up shortly with a detailed answer.\n\n— The Marco Reid support team`,
    confidence: 30,
    reasoning: "No matching knowledge base entry; generic fallback.",
  };
}

export async function draftResponse(
  ticket: DraftInputTicket,
  thread: DraftThreadMessage[] = [],
  knowledgeBase: KnowledgeEntry[] | null = null,
): Promise<DraftResult> {
  const matches =
    knowledgeBase ??
    searchKnowledgeBase(`${ticket.subject}\n${ticket.body}`).map((m) => m.entry);

  try {
    const { generateObject } = await import("ai");
    const { getDefaultModel } = await import("@back-to-the-future/ai-core");
    const model = getDefaultModel();

    const { object } = await generateObject({
      model,
      schema: DraftSchema,
      prompt: `${BRAND_VOICE}

KNOWLEDGE BASE (use only these facts):
${buildKnowledgeContext(matches)}

PRIOR THREAD:
${buildThreadContext(thread)}

NEW MESSAGE FROM ${ticket.fromEmail}
Subject: ${ticket.subject}
Category: ${ticket.category}

Body:
${ticket.body}

Write a complete email reply. Set confidence (0-100) based on how well the knowledge base covers the question. If you had to guess at any fact, drop confidence below 60. Provide one-sentence reasoning.`,
    });

    return object;
  } catch (err) {
    console.warn(
      "[support.drafter] AI draft failed, using template fallback:",
      err instanceof Error ? err.message : err,
    );
    return templateDraft(ticket, matches);
  }
}
