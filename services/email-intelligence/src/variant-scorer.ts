// ── A/B Variant Scorer (module 4 of 4) ────────────────────────────────
// Scores each candidate variant on:
//   - spam-risk (heuristic, optionally + LLM)
//   - predicted open-rate (subject features)
//   - predicted click-rate (body features + historical priors)
// Returns a ranked list with a composite score.

import { z } from "zod";
import type { LlmClient } from "./llm-client";
import { heuristicSpamScore } from "./spam-scorer";
import { predictOpenRate } from "./subject-optimiser";

export const variantSchema = z.object({
  id: z.string().min(1),
  subject: z.string().min(1),
  html: z.string(),
  text: z.string().optional(),
  fromDomain: z.string().default("example.com"),
});

export const historicalPerformanceSchema = z.object({
  /** Variant id this performance record refers to. */
  id: z.string().min(1),
  opens: z.number().int().nonnegative(),
  clicks: z.number().int().nonnegative(),
  sent: z.number().int().positive(),
});

export const scoreVariantsInputSchema = z.object({
  variants: z.array(variantSchema).min(1),
  historical: z.array(historicalPerformanceSchema).optional(),
});

export type ScoreVariantsInput = z.infer<typeof scoreVariantsInputSchema>;

export interface RankedVariant {
  id: string;
  subject: string;
  spamRisk: number;
  predictedOpenRate: number;
  predictedClickRate: number;
  /** Composite 0..1 score: openRate * (1 - spamRisk/100) * clickRateLift. */
  compositeScore: number;
  /** Stable rank — 1 = best. */
  rank: number;
  rationale: string[];
}

const BODY_BASE_CLICK_RATE = 0.025;

function predictClickRate(html: string, text: string | undefined): {
  rate: number;
  rationale: string[];
} {
  const rationale: string[] = [];
  let rate = BODY_BASE_CLICK_RATE;

  // Number of CTA-shaped anchors.
  const anchorMatches = html.match(/<a\b[^>]*>([\s\S]*?)<\/a>/gi) ?? [];
  const ctaAnchors = anchorMatches.filter((a) =>
    /\b(buy|shop|get|start|try|claim|read|learn|book|join|sign\s*up|download)\b/i.test(
      a,
    ),
  );

  if (ctaAnchors.length === 0) {
    rate -= 0.01;
    rationale.push("No CTA-shaped link detected");
  } else if (ctaAnchors.length === 1) {
    rate += 0.012;
    rationale.push("Single clear CTA — strong click signal");
  } else if (ctaAnchors.length <= 3) {
    rate += 0.006;
    rationale.push(`${ctaAnchors.length} CTAs — moderate click signal`);
  } else {
    rate -= 0.005;
    rationale.push(`${ctaAnchors.length} CTAs — choice paralysis`);
  }

  // Length of plain-text body.
  const body = text ?? html.replace(/<[^>]*>/g, " ");
  const words = body.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length < 30) {
    rate += 0.005;
    rationale.push(`Concise body (${words.length} words) reads quickly`);
  } else if (words.length > 250) {
    rate -= 0.008;
    rationale.push(`Body is long (${words.length} words) — clicks decay`);
  }

  // Imagery balance.
  const imgs = (html.match(/<img\b[^>]*>/gi) ?? []).length;
  if (imgs > 0 && imgs <= 3) {
    rate += 0.004;
    rationale.push(`${imgs} images — balanced layout`);
  } else if (imgs > 6) {
    rate -= 0.006;
    rationale.push(`${imgs} images — image-heavy mail risks clipping`);
  }

  return { rate: Math.max(0, Math.min(0.5, rate)), rationale };
}

export interface ScoreVariantsOptions {
  /** Optional LLM client passed through to the spam scorer. */
  llm?: LlmClient;
}

export async function scoreVariants(
  input: ScoreVariantsInput,
  opts: ScoreVariantsOptions = {},
): Promise<{ ranked: RankedVariant[] }> {
  const histById = new Map<string, z.infer<typeof historicalPerformanceSchema>>();
  for (const h of input.historical ?? []) {
    histById.set(h.id, h);
  }

  const evaluated: RankedVariant[] = [];
  for (const v of input.variants) {
    const rationale: string[] = [];

    // Spam risk (heuristic only here — LLM second-opinion is a separate
    // expensive endpoint; the ranker stays cheap-and-fast).
    const spam = heuristicSpamScore({
      subject: v.subject,
      html: v.html,
      ...(v.text !== undefined && { text: v.text }),
      fromDomain: v.fromDomain,
    });
    if (spam.score > 0) {
      rationale.push(
        `Spam-risk ${spam.score} (${spam.signals
          .slice(0, 3)
          .map((s) => s.code)
          .join(", ")})`,
      );
    }

    const open = predictOpenRate(v.subject);
    rationale.push(...open.rationale);

    const click = predictClickRate(v.html, v.text);
    rationale.push(...click.rationale);

    // Optional LLM second opinion — used only when caller provides a client.
    // We attribute this to the spam dimension to keep things cheap.
    if (opts.llm) {
      try {
        const reply = await opts.llm.complete({
          purpose: "variant-spam-second-opinion",
          prompt: [
            "Rate the spam-risk of this email subject 0..100, integer only.",
            `Subject: ${v.subject}`,
          ].join("\n"),
          maxTokens: 8,
          temperature: 0,
        });
        const m = reply.text.match(/(\d{1,3})/);
        const llmScore =
          m && m[1] !== undefined
            ? Math.max(0, Math.min(100, Number.parseInt(m[1], 10)))
            : Number.NaN;
        if (!Number.isNaN(llmScore)) {
          // Average heuristic + llm.
          spam.score = Math.round((spam.score + llmScore) / 2);
          rationale.push(`LLM spam second-opinion: ${llmScore}/100`);
        }
      } catch {
        // ignore — heuristic remains.
      }
    }

    // Historical priors lift the base click rate (multiplicative).
    let priorClickRate = click.rate;
    let priorOpenRate = open.predicted;
    const hist = histById.get(v.id);
    if (hist && hist.sent > 0) {
      const histOpen = hist.opens / hist.sent;
      const histClick = hist.clicks / hist.sent;
      // Bayesian shrink toward predicted: weight = sent / (sent + 50).
      const w = hist.sent / (hist.sent + 50);
      priorOpenRate = w * histOpen + (1 - w) * open.predicted;
      priorClickRate = w * histClick + (1 - w) * click.rate;
      rationale.push(
        `Historical: ${hist.opens} opens / ${hist.clicks} clicks / ${hist.sent} sent (weight ${w.toFixed(2)})`,
      );
    }

    const composite =
      priorOpenRate * (1 - spam.score / 100) * (1 + priorClickRate * 4);

    evaluated.push({
      id: v.id,
      subject: v.subject,
      spamRisk: spam.score,
      predictedOpenRate: Number(priorOpenRate.toFixed(4)),
      predictedClickRate: Number(priorClickRate.toFixed(4)),
      compositeScore: Number(composite.toFixed(4)),
      rank: 0,
      rationale,
    });
  }

  evaluated.sort((a, b) => b.compositeScore - a.compositeScore);
  evaluated.forEach((v, i) => {
    v.rank = i + 1;
  });
  return { ranked: evaluated };
}
