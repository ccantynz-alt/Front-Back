// ── Subject-Line Optimiser (module 2 of 4) ────────────────────────────
// Rule-based variant generation + predicted open-rate scoring.
// Optionally fans out to the LLM for a creative pass.

import { z } from "zod";
import type { LlmClient } from "./llm-client";

export const subjectAudienceSchema = z.object({
  industry: z.string().optional(),
  region: z.string().optional(),
});

export const subjectOptimiseInputSchema = z.object({
  subject: z.string().min(1),
  audience: subjectAudienceSchema.optional(),
});

export type SubjectOptimiseInput = z.infer<typeof subjectOptimiseInputSchema>;

export interface SubjectVariant {
  /** The candidate subject line. */
  subject: string;
  /** Predicted open rate (0..1). */
  predictedOpenRate: number;
  /** 95% confidence interval [low, high]. */
  confidenceInterval: [number, number];
  /** Source of the variant. */
  source: "input" | "rule" | "llm";
  /** Plain-English explanation of why this variant scored as it did. */
  rationale: string[];
}

const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

function emojiCount(s: string): number {
  return (s.match(EMOJI_REGEX) ?? []).length;
}

function hasPersonalisationToken(s: string): boolean {
  // {firstName}, {{name}}, %FNAME%, {first_name}.
  return /\{\{?[a-zA-Z_][a-zA-Z0-9_]*\}?\}|%[A-Z_]+%/.test(s);
}

function hasUrgencyCue(s: string): boolean {
  return /\b(today|now|hurry|expires|last chance|limited|deadline|24h|48h)\b/i.test(s);
}

function hasNumber(s: string): boolean {
  return /\d/.test(s);
}

function hasQuestion(s: string): boolean {
  return s.trim().endsWith("?");
}

const TARGET_LENGTH_LOW = 30;
const TARGET_LENGTH_HIGH = 55;
const BASE_OPEN_RATE = 0.21;

/**
 * Compute predicted open rate for a single subject line. Pure function;
 * exported so the A/B variant scorer can reuse it.
 */
export function predictOpenRate(subject: string): {
  predicted: number;
  confidenceInterval: [number, number];
  rationale: string[];
} {
  let predicted = BASE_OPEN_RATE;
  const rationale: string[] = [];

  const len = subject.length;
  if (len >= TARGET_LENGTH_LOW && len <= TARGET_LENGTH_HIGH) {
    predicted += 0.05;
    rationale.push(`Length ${len} sits in the high-open 30–55 char band`);
  } else if (len < 20) {
    predicted -= 0.04;
    rationale.push(`Length ${len} is too short — opens drop`);
  } else if (len > 70) {
    predicted -= 0.06;
    rationale.push(`Length ${len} is too long — clients truncate`);
  }

  const emo = emojiCount(subject);
  if (emo === 1) {
    predicted += 0.03;
    rationale.push("Single emoji boosts perceived friendliness");
  } else if (emo >= 2) {
    predicted -= 0.04;
    rationale.push(`${emo} emojis — looks promotional`);
  }

  if (hasPersonalisationToken(subject)) {
    predicted += 0.06;
    rationale.push("Personalisation token detected");
  }

  if (hasUrgencyCue(subject)) {
    predicted += 0.02;
    rationale.push("Urgency cue increases open rate (modestly)");
  }

  if (hasNumber(subject)) {
    predicted += 0.02;
    rationale.push("Numerals in subject correlate with higher opens");
  }

  if (hasQuestion(subject)) {
    predicted += 0.03;
    rationale.push("Question subjects perform above baseline");
  }

  if (/[A-Z]{4,}/.test(subject)) {
    predicted -= 0.05;
    rationale.push("ALL-CAPS sequences trigger spam filters");
  }

  if (/!{2,}/.test(subject)) {
    predicted -= 0.04;
    rationale.push("Multiple exclamation marks reduce trust");
  }

  predicted = Math.max(0.02, Math.min(0.65, predicted));
  // Wider CI for shorter copy (less signal).
  const halfWidth = len < 20 ? 0.08 : len > 70 ? 0.07 : 0.05;
  const ci: [number, number] = [
    Math.max(0, predicted - halfWidth),
    Math.min(1, predicted + halfWidth),
  ];
  return { predicted, confidenceInterval: ci, rationale };
}

function buildRuleVariants(input: SubjectOptimiseInput): string[] {
  const original = input.subject.trim();
  const variants = new Set<string>();

  // 1. Trim to target length if currently too long.
  if (original.length > TARGET_LENGTH_HIGH) {
    variants.add(`${original.slice(0, TARGET_LENGTH_HIGH - 1).trimEnd()}…`);
  }

  // 2. Add personalisation token if missing.
  if (!hasPersonalisationToken(original)) {
    variants.add(`{{firstName}}, ${original}`);
  }

  // 3. Question form.
  if (!hasQuestion(original)) {
    const stripped = original.replace(/[!.?]+$/, "");
    variants.add(`${stripped}?`);
  }

  // 4. Add a number if missing — anchored to industry where applicable.
  if (!hasNumber(original)) {
    const industry = input.audience?.industry;
    if (industry) {
      variants.add(`5 ${industry} insights — ${original}`);
    } else {
      variants.add(`3 things — ${original}`);
    }
  }

  // 5. Strip ALL-CAPS / exclamation noise.
  if (/[A-Z]{4,}/.test(original) || /!{2,}/.test(original)) {
    const cleaned = original
      .replace(/!{2,}/g, "!")
      .replace(/([A-Z]{4,})/g, (m) => m.charAt(0) + m.slice(1).toLowerCase());
    variants.add(cleaned);
  }

  // 6. Region cue when audience.region present.
  if (input.audience?.region) {
    variants.add(`${original} (${input.audience.region})`);
  }

  // 7. Emoji-prefix variant when no emoji exists.
  if (emojiCount(original) === 0) {
    variants.add(`✨ ${original}`);
  }

  return [...variants].filter((v) => v.length > 0 && v !== original);
}

function scoreVariant(
  subject: string,
  source: SubjectVariant["source"],
): SubjectVariant {
  const { predicted, confidenceInterval, rationale } = predictOpenRate(subject);
  return {
    subject,
    predictedOpenRate: Number(predicted.toFixed(4)),
    confidenceInterval: [
      Number(confidenceInterval[0].toFixed(4)),
      Number(confidenceInterval[1].toFixed(4)),
    ],
    source,
    rationale,
  };
}

export interface OptimiseSubjectOptions {
  /** Optional LLM client — when present, generates 2 creative variants. */
  llm?: LlmClient;
  /** Maximum number of variants returned. Defaults to 6. */
  maxVariants?: number;
}

const LLM_VARIANT_REGEX = /^\s*(?:\d+[.):]?\s*)?(.+?)\s*$/;

function parseLlmVariants(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(LLM_VARIANT_REGEX);
      return m && m[1] ? m[1].replace(/^["'`]|["'`]$/g, "").trim() : "";
    })
    .filter((line) => line.length > 0 && line.length <= 120);
}

export async function optimiseSubject(
  input: SubjectOptimiseInput,
  opts: OptimiseSubjectOptions = {},
): Promise<{ variants: SubjectVariant[] }> {
  const collected: SubjectVariant[] = [];
  // Always include the original as the baseline.
  collected.push(scoreVariant(input.subject, "input"));
  for (const v of buildRuleVariants(input)) {
    collected.push(scoreVariant(v, "rule"));
  }

  if (opts.llm) {
    const prompt = [
      "Generate 2 alternative email subject lines.",
      "Each must be < 60 characters, no emojis, no ALL-CAPS, no '!!'.",
      "Output one per line. No numbering. No commentary.",
      "",
      `Original: ${input.subject}`,
      input.audience?.industry ? `Industry: ${input.audience.industry}` : "",
      input.audience?.region ? `Region: ${input.audience.region}` : "",
    ]
      .filter((l) => l.length > 0)
      .join("\n");
    try {
      const reply = await opts.llm.complete({
        purpose: "subject-variants",
        prompt,
        maxTokens: 80,
        temperature: 0.6,
      });
      for (const v of parseLlmVariants(reply.text)) {
        collected.push(scoreVariant(v, "llm"));
      }
    } catch {
      // LLM failures degrade gracefully — we still have rule-based variants.
    }
  }

  // De-duplicate by subject text, keep the highest-scoring entry.
  const dedup = new Map<string, SubjectVariant>();
  for (const v of collected) {
    const existing = dedup.get(v.subject);
    if (!existing || existing.predictedOpenRate < v.predictedOpenRate) {
      dedup.set(v.subject, v);
    }
  }
  const ranked = [...dedup.values()].sort(
    (a, b) => b.predictedOpenRate - a.predictedOpenRate,
  );

  const max = opts.maxVariants ?? 6;
  return { variants: ranked.slice(0, max) };
}
