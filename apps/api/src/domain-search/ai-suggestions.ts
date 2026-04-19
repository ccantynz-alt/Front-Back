// ── BLK-025 Domain Search: AI Brandable Alternatives ────────────────
//
// Given a user's search query, ask Claude to generate a short list of
// brandable, memorable alternatives with an explanation of why each
// one works. The goal is to surface names that score high on the
// Brand New-style rubric:
//
//   • Memorability   — easy to say, short, rhythmic
//   • Distinctiveness — invented or uncommon constructions beat common words
//   • Category fit   — evokes the inferred industry without being generic
//   • TLD fit        — the suggested TLD amplifies the name
//
// Output is strictly Zod-validated. On error or missing key we return
// an empty array with a polite note — never throw.

import { z } from "zod";
import { generateObject } from "ai";
import {
  getAnthropicModel,
  hasAnthropicProvider,
} from "@back-to-the-future/ai-core";
import type { LanguageModel } from "ai";

export const AiAlternativeSchema = z.object({
  domain: z.string().min(3).max(80),
  reasoning: z.string().min(1).max(300),
  brandability: z.number().min(0).max(10),
});
export type AiAlternative = z.infer<typeof AiAlternativeSchema>;

export const AiSuggestionResultSchema = z.object({
  alternatives: z.array(AiAlternativeSchema).max(12),
  note: z.string().max(300).optional(),
});
export type AiSuggestionResult = z.infer<typeof AiSuggestionResultSchema>;

export const SYSTEM_PROMPT = `You are a naming consultant for a real-time domain search tool. Your job: given a user's raw search query, generate up to 8 brandable domain alternatives that are likely to be available and that a founder would be proud to put on a business card.

Rules:
  • Each suggestion MUST include a TLD (e.g. "fable.io", not "fable").
  • Prefer short (4–9 character) constructions, invented words, or compound portmanteaus.
  • Mix at least one .com candidate and at least one alternative TLD (.io, .ai, .dev, .app, .co).
  • Avoid trademarked household names (Apple, Google, Nike, etc.).
  • Avoid hyphens and digits unless the original query contains them.
  • Provide "reasoning" — one crisp sentence explaining why this works as a brand.
  • Score "brandability" from 0 to 10 using this rubric:
      10 = instantly memorable, unique, say-once-never-forget
       7 = strong brand, may require a small leap
       4 = workable but plain
       1 = descriptive / generic

Be polite and encouraging. Do NOT badmouth other domain search tools or the user's original query. If the query is offensive or nonsensical, return an empty array with a short note.`;

// ── Public API ──────────────────────────────────────────────────────

export interface GenerateOptions {
  /** Anthropic model id — defaults to Haiku for speed and cost. */
  modelId?: string;
  /** Injected for tests. */
  model?: LanguageModel;
  /** Optional override for the API key (tests may pass an empty stub). */
  apiKey?: string;
  /** Maximum alternatives to request. Hard-capped at 12. */
  maxAlternatives?: number;
}

function readAnthropicKey(): string | undefined {
  try {
    // biome-ignore lint/complexity/useLiteralKeys: dynamic env access
    const proc = (globalThis as Record<string, unknown>)["process"] as
      | { env: Record<string, string | undefined> }
      | undefined;
    return proc?.env["ANTHROPIC_API_KEY"];
  } catch {
    return undefined;
  }
}

function readModelIdFromEnv(): string {
  try {
    // biome-ignore lint/complexity/useLiteralKeys: dynamic env access
    const proc = (globalThis as Record<string, unknown>)["process"] as
      | { env: Record<string, string | undefined> }
      | undefined;
    return (
      proc?.env["DOMAIN_SEARCH_SUGGESTIONS_MODEL"] ??
      proc?.env["DOMAIN_SEARCH_MODEL"] ??
      "claude-haiku-4-20250506"
    );
  } catch {
    return "claude-haiku-4-20250506";
  }
}

/**
 * Generate brandable domain alternatives for the given query.
 * Returns `{ alternatives: [], note: "…" }` on error — never throws.
 */
export async function generateBrandableAlternatives(
  query: string,
  opts: GenerateOptions = {},
): Promise<AiSuggestionResult> {
  const cleaned = query.trim();
  if (cleaned.length === 0) {
    return { alternatives: [], note: "Empty query — nothing to suggest." };
  }

  let model: LanguageModel | undefined = opts.model;
  if (!model) {
    const key = opts.apiKey ?? readAnthropicKey();
    if (!key || !hasAnthropicProvider()) {
      return {
        alternatives: [],
        note:
          "AI suggestions unavailable — ANTHROPIC_API_KEY not configured. Availability results still work.",
      };
    }
    const modelId = opts.modelId ?? readModelIdFromEnv();
    model = getAnthropicModel(key, modelId);
  }

  const max = Math.min(Math.max(1, opts.maxAlternatives ?? 8), 12);

  try {
    const { object } = await generateObject({
      model,
      schema: AiSuggestionResultSchema,
      system: SYSTEM_PROMPT,
      prompt: [
        `User query: "${cleaned}"`,
        "",
        `Return up to ${max} brandable alternatives with reasoning and a brandability score.`,
      ].join("\n"),
      temperature: 0.7,
    });
    // Sort by brandability descending — best ideas first.
    const sorted = [...object.alternatives].sort(
      (a, b) => b.brandability - a.brandability,
    );
    const trimmed = sorted.slice(0, max);
    const base: AiSuggestionResult = { alternatives: trimmed };
    if (object.note !== undefined) base.note = object.note;
    return base;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      alternatives: [],
      note: `AI suggestions unavailable — ${message.slice(0, 200)}`,
    };
  }
}
