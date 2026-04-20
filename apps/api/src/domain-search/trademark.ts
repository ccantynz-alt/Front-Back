// ── BLK-025 Domain Search: Trademark Conflict Scanner ───────────────
//
// There is no free USPTO TESS API. Instead, we ask Claude to do two
// things in one structured-output call:
//
//   1. Enumerate well-known registered or commonly claimed trademarks
//      whose mark text is identical to, a superset of, or phonetically
//      similar to the candidate domain label.
//   2. Score each match on similarity (0 to 1) and risk (low/medium/high)
//      and return a short citation or rationale per conflict.
//
// The scanner is DEFENSIVE by design — when no Anthropic key is
// configured, we return an empty conflict list with a clear note. We
// never block the availability flow on trademark data.
//
// All output is Zod-validated; if the model returns malformed JSON we
// fall back to an empty list rather than crashing the request.

import { z } from "zod";
import { generateObject } from "ai";
import {
  getAnthropicModel,
  hasAnthropicProvider,
} from "@back-to-the-future/ai-core";
import type { LanguageModel } from "ai";

export const TrademarkRiskSchema = z.enum(["low", "medium", "high"]);
export type TrademarkRisk = z.infer<typeof TrademarkRiskSchema>;

export const TrademarkConflictSchema = z.object({
  mark: z.string().min(1).max(200),
  owner: z.string().min(1).max(300),
  class: z.string().max(200).optional(),
  similarity: z.number().min(0).max(1),
  risk: TrademarkRiskSchema,
  citation: z.string().max(400),
});
export type TrademarkConflict = z.infer<typeof TrademarkConflictSchema>;

export const TrademarkScanResultSchema = z.object({
  conflicts: z.array(TrademarkConflictSchema).max(10),
  note: z.string().max(400).optional(),
});
export type TrademarkScanResult = z.infer<typeof TrademarkScanResultSchema>;

export const SYSTEM_PROMPT = `You are a trademark-risk pre-screener for a domain search tool. You are NOT a lawyer and your output is NOT legal advice — it is a surface-level similarity check.

Given a candidate domain label, return up to 5 well-known registered or commonly claimed trademarks whose mark text is identical, a near-homophone, or a prefix/superset of the candidate. For each, include:
  • mark — the registered word mark, normalised
  • owner — the company or entity most commonly associated with the mark
  • class — the Nice Classification class(es) if widely known (e.g. "Class 9 — software"); omit if unsure
  • similarity — 0.0 to 1.0. Identical = 1.0, homophone = ~0.8, contains-as-substring = ~0.5, loosely related = ~0.3
  • risk — "high" if the mark is identical and widely enforced, "medium" if the mark is strong but the use-case differs, "low" if the match is distant or the mark is weak
  • citation — one short sentence explaining why this matters (e.g. "Apple Inc. holds the APPLE mark in Class 9 for computing products and actively enforces it")

Only return marks that a reasonable person would recognise. DO NOT invent marks. When in doubt, return fewer conflicts. If the candidate has no plausible trademark overlap, return an empty array with a short note.

Be polite. Never claim a domain IS or IS NOT infringing — this is an informational pre-screen, not a legal opinion.`;

// ── Public API ──────────────────────────────────────────────────────

export interface ScanOptions {
  /** Anthropic model id — defaults to Haiku for speed and cost. */
  modelId?: string;
  /** Injected for tests. */
  model?: LanguageModel;
  /** Optional override for the API key (tests may pass an empty stub). */
  apiKey?: string;
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
      proc?.env["DOMAIN_SEARCH_TRADEMARK_MODEL"] ??
      proc?.env["DOMAIN_SEARCH_MODEL"] ??
      "claude-haiku-4-20250506"
    );
  } catch {
    return "claude-haiku-4-20250506";
  }
}

/**
 * Scan the given candidate label for likely trademark conflicts.
 * Returns `{ conflicts: [], note: "…" }` — never throws.
 */
export async function scanTrademarkConflicts(
  candidate: string,
  opts: ScanOptions = {},
): Promise<TrademarkScanResult> {
  const cleaned = candidate.trim().toLowerCase();
  if (cleaned.length === 0) {
    return { conflicts: [], note: "Empty candidate — nothing to scan." };
  }

  let model: LanguageModel | undefined = opts.model;
  if (!model) {
    const key = opts.apiKey ?? readAnthropicKey();
    if (!key || !hasAnthropicProvider()) {
      return {
        conflicts: [],
        note:
          "Trademark scan skipped — ANTHROPIC_API_KEY not configured. This is a best-effort pre-screen only; always consult counsel before filing.",
      };
    }
    const modelId = opts.modelId ?? readModelIdFromEnv();
    model = getAnthropicModel(key, modelId);
  }

  try {
    const { object } = await generateObject({
      model,
      schema: TrademarkScanResultSchema,
      system: SYSTEM_PROMPT,
      prompt: [
        `Candidate domain label: "${cleaned}"`,
        "",
        "Return up to 5 likely conflicts. If none exist, return an empty array with a short note.",
      ].join("\n"),
      temperature: 0.1,
    });
    // Sort by descending risk so the UI can highlight the worst first.
    const riskWeight: Record<TrademarkRisk, number> = {
      high: 3,
      medium: 2,
      low: 1,
    };
    const sorted = [...object.conflicts].sort(
      (a, b) => riskWeight[b.risk] - riskWeight[a.risk] || b.similarity - a.similarity,
    );
    const base: TrademarkScanResult = { conflicts: sorted };
    if (object.note !== undefined) base.note = object.note;
    return base;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      conflicts: [],
      note: `Trademark scan unavailable — ${message.slice(0, 200)}`,
    };
  }
}

/**
 * Return only the conflicts at or above the given risk threshold.
 * Useful when the UI wants a "warnings" subset (medium + high).
 */
export function aboveRisk(
  conflicts: ReadonlyArray<TrademarkConflict>,
  threshold: TrademarkRisk,
): TrademarkConflict[] {
  const weight: Record<TrademarkRisk, number> = { low: 1, medium: 2, high: 3 };
  const min = weight[threshold];
  return conflicts.filter((c) => weight[c.risk] >= min);
}
