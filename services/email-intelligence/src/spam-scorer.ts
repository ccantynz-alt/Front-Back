// ── Spam-Risk Scorer (module 1 of 4) ──────────────────────────────────
// Heuristic 0–100 spam-risk score + optional injectable LLM second
// opinion. Each rule contributes to a transparent "signals" list so the
// caller can show users *why* a message was flagged.

import { z } from "zod";
import type { LlmClient } from "./llm-client";

export const spamScoreInputSchema = z.object({
  subject: z.string(),
  html: z.string().optional(),
  text: z.string().optional(),
  fromDomain: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  /** ISO-8601 date the FROM domain was registered (when known). */
  fromDomainRegisteredAt: z.string().optional(),
});

export type SpamScoreInput = z.infer<typeof spamScoreInputSchema>;

export interface SpamSignal {
  /** Stable machine-readable id — e.g. "subject.allcaps". */
  code: string;
  /** Human-readable label. */
  label: string;
  /** Points contributed to the heuristic score (positive = more spammy). */
  points: number;
  /** Optional detail used for tooltip/debug. */
  detail?: string;
}

export interface SpamScoreResult {
  /** 0 = clean, 100 = certainly spam. */
  heuristicScore: number;
  /** Optional LLM second opinion (0–100) when {@link scoreSpam} is given a client. */
  llmScore?: number;
  /** Combined recommendation: "pass" | "review" | "block". */
  verdict: "pass" | "review" | "block";
  /** Every rule that contributed. */
  signals: SpamSignal[];
}

/** Lowercased exact-substring tokens that indicate spam. */
const SUSPICIOUS_KEYWORDS = [
  "viagra",
  "click here now",
  "act now",
  "limited time offer",
  "100% free",
  "risk-free",
  "winner",
  "you have been selected",
  "make money fast",
  "guaranteed",
  "bitcoin doubled",
  "nigerian prince",
  "wire transfer",
  "credit card details",
  "social security",
  "earn $$$",
  "this is not spam",
  "double your income",
] as const;

const SUSPICIOUS_TLD = new Set([
  "zip",
  "review",
  "country",
  "kim",
  "cricket",
  "science",
  "work",
  "party",
  "gq",
  "link",
]);

const SUBJECT_MAX_POINTS_ALLCAPS = 12;
const SUBJECT_MAX_POINTS_EXCLAIM = 10;
const SUBJECT_MAX_POINTS_KEYWORDS = 18;
const BODY_MAX_POINTS_KEYWORDS = 18;
const BODY_MAX_POINTS_LINK_RATIO = 14;
const BODY_MAX_POINTS_HIDDEN = 12;
const MISSING_TEXT_POINTS = 8;
const MISSING_HEADERS_POINTS = 6;
const RECENT_DOMAIN_POINTS = 14;
const SUSPICIOUS_TLD_POINTS = 8;

function ratioAllCaps(s: string): number {
  const letters = s.match(/[A-Za-z]/g);
  if (!letters || letters.length === 0) {
    return 0;
  }
  const caps = s.match(/[A-Z]/g);
  return (caps?.length ?? 0) / letters.length;
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) {
      return count;
    }
    count += 1;
    from = idx + needle.length;
  }
}

function findKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const kw of SUSPICIOUS_KEYWORDS) {
    if (lower.includes(kw)) {
      hits.push(kw);
    }
  }
  return hits;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

function countLinks(html: string): number {
  // Count <a ...> opening tags. Hidden anchors count too — that is the point.
  return (html.match(/<a\b[^>]*>/gi) ?? []).length;
}

function detectHidden(html: string): boolean {
  // crude but effective: catches display:none, visibility:hidden, white-on-white.
  if (/style\s*=\s*["'][^"']*display\s*:\s*none/i.test(html)) {
    return true;
  }
  if (/style\s*=\s*["'][^"']*visibility\s*:\s*hidden/i.test(html)) {
    return true;
  }
  if (/style\s*=\s*["'][^"']*color\s*:\s*#?fff(fff)?/i.test(html)) {
    return true;
  }
  return false;
}

function daysSince(iso: string): number | undefined {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    return undefined;
  }
  return (Date.now() - t) / 86_400_000;
}

function tldOf(domain: string): string {
  const parts = domain.toLowerCase().split(".");
  return parts[parts.length - 1] ?? "";
}

/** Pure heuristic scorer. Useful directly when no LLM is available. */
export function heuristicSpamScore(input: SpamScoreInput): {
  score: number;
  signals: SpamSignal[];
} {
  const signals: SpamSignal[] = [];
  let score = 0;

  // ── Subject features ──
  const subj = input.subject;
  const allcapsRatio = ratioAllCaps(subj);
  if (allcapsRatio >= 0.7 && subj.length >= 5) {
    const pts = SUBJECT_MAX_POINTS_ALLCAPS;
    score += pts;
    signals.push({
      code: "subject.allcaps",
      label: "Subject is mostly uppercase",
      points: pts,
      detail: `${(allcapsRatio * 100).toFixed(0)}% caps`,
    });
  } else if (allcapsRatio >= 0.5 && subj.length >= 5) {
    const pts = Math.round(SUBJECT_MAX_POINTS_ALLCAPS * 0.6);
    score += pts;
    signals.push({
      code: "subject.allcaps.partial",
      label: "Subject has heavy uppercase",
      points: pts,
      detail: `${(allcapsRatio * 100).toFixed(0)}% caps`,
    });
  }

  const exclaims = countOccurrences(subj, "!");
  if (exclaims >= 3) {
    const pts = SUBJECT_MAX_POINTS_EXCLAIM;
    score += pts;
    signals.push({
      code: "subject.exclamation.density",
      label: "Subject has 3+ exclamation marks",
      points: pts,
      detail: `${exclaims} exclamation marks`,
    });
  } else if (exclaims === 2) {
    const pts = Math.round(SUBJECT_MAX_POINTS_EXCLAIM * 0.5);
    score += pts;
    signals.push({
      code: "subject.exclamation.medium",
      label: "Subject has multiple exclamation marks",
      points: pts,
    });
  }

  const subjectKeywords = findKeywords(subj);
  if (subjectKeywords.length > 0) {
    const pts = Math.min(
      SUBJECT_MAX_POINTS_KEYWORDS,
      subjectKeywords.length * 9,
    );
    score += pts;
    signals.push({
      code: "subject.keywords",
      label: "Subject contains spam-trigger keywords",
      points: pts,
      detail: subjectKeywords.join(", "),
    });
  }

  // ── Body features ──
  const html = input.html ?? "";
  const text = input.text ?? "";
  const bodyText = text.length > 0 ? text : stripTags(html);

  const bodyKeywords = findKeywords(bodyText);
  if (bodyKeywords.length > 0) {
    const pts = Math.min(BODY_MAX_POINTS_KEYWORDS, bodyKeywords.length * 6);
    score += pts;
    signals.push({
      code: "body.keywords",
      label: "Body contains spam-trigger keywords",
      points: pts,
      detail: bodyKeywords.join(", "),
    });
  }

  if (html.length > 0) {
    const links = countLinks(html);
    const visibleText = stripTags(html).replace(/\s+/g, " ").trim();
    const wordCount = visibleText.length === 0 ? 0 : visibleText.split(" ").length;
    if (links > 0 && wordCount > 0) {
      const ratio = links / Math.max(wordCount, 1);
      // 1 link per 5 words is the threshold.
      if (ratio >= 0.2) {
        const pts = BODY_MAX_POINTS_LINK_RATIO;
        score += pts;
        signals.push({
          code: "body.link_ratio.high",
          label: "Excessive link-to-text ratio",
          points: pts,
          detail: `${links} links / ${wordCount} words`,
        });
      } else if (ratio >= 0.1) {
        const pts = Math.round(BODY_MAX_POINTS_LINK_RATIO * 0.5);
        score += pts;
        signals.push({
          code: "body.link_ratio.medium",
          label: "Elevated link-to-text ratio",
          points: pts,
          detail: `${links} links / ${wordCount} words`,
        });
      }
    } else if (links > 0 && wordCount === 0) {
      const pts = BODY_MAX_POINTS_LINK_RATIO;
      score += pts;
      signals.push({
        code: "body.link_only",
        label: "Body is links-only with no readable text",
        points: pts,
        detail: `${links} links / 0 words`,
      });
    }

    if (detectHidden(html)) {
      const pts = BODY_MAX_POINTS_HIDDEN;
      score += pts;
      signals.push({
        code: "body.hidden_html",
        label: "Body contains hidden HTML",
        points: pts,
      });
    }
  }

  // Missing plain-text part.
  if (html.length > 0 && text.length === 0) {
    const pts = MISSING_TEXT_POINTS;
    score += pts;
    signals.push({
      code: "body.missing_text_part",
      label: "HTML present but plain-text alternative missing",
      points: pts,
    });
  }

  // ── Header features ──
  const headers = input.headers ?? {};
  const headerKeysLower = new Set(
    Object.keys(headers).map((k) => k.toLowerCase()),
  );
  if (
    !headerKeysLower.has("list-unsubscribe") &&
    Object.keys(headers).length > 0
  ) {
    const pts = MISSING_HEADERS_POINTS;
    score += pts;
    signals.push({
      code: "headers.missing_unsubscribe",
      label: "Bulk-style send missing List-Unsubscribe header",
      points: pts,
    });
  }

  // ── FROM domain features ──
  const tld = tldOf(input.fromDomain);
  if (tld.length > 0 && SUSPICIOUS_TLD.has(tld)) {
    const pts = SUSPICIOUS_TLD_POINTS;
    score += pts;
    signals.push({
      code: "from.suspicious_tld",
      label: "FROM domain uses high-abuse TLD",
      points: pts,
      detail: `.${tld}`,
    });
  }
  if (input.fromDomainRegisteredAt) {
    const days = daysSince(input.fromDomainRegisteredAt);
    if (days !== undefined && days < 30) {
      const pts = RECENT_DOMAIN_POINTS;
      score += pts;
      signals.push({
        code: "from.recent_registration",
        label: "FROM domain registered in the last 30 days",
        points: pts,
        detail: `${Math.round(days)} days old`,
      });
    }
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), signals };
}

export interface ScoreSpamOptions {
  /** When provided, also calls the LLM for a second opinion. */
  llm?: LlmClient;
  /** Threshold for "block" verdict — defaults to 70. */
  blockThreshold?: number;
  /** Threshold for "review" verdict — defaults to 35. */
  reviewThreshold?: number;
}

const SCORE_REGEX = /(\d{1,3})/;

function parseLlmScore(raw: string): number | undefined {
  const m = raw.match(SCORE_REGEX);
  if (!m || m[1] === undefined) {
    return undefined;
  }
  const n = Number.parseInt(m[1], 10);
  if (Number.isNaN(n)) {
    return undefined;
  }
  return Math.max(0, Math.min(100, n));
}

export async function scoreSpam(
  input: SpamScoreInput,
  opts: ScoreSpamOptions = {},
): Promise<SpamScoreResult> {
  const { score: heuristicScore, signals } = heuristicSpamScore(input);
  let llmScore: number | undefined;
  if (opts.llm) {
    const prompt = [
      "You are an email-deliverability classifier.",
      "Return a single integer 0..100 representing spam risk.",
      "0 = certainly legitimate, 100 = certainly spam.",
      "Respond with ONLY the integer, nothing else.",
      "",
      `Subject: ${input.subject}`,
      `From-domain: ${input.fromDomain}`,
      `Body (first 800 chars): ${(input.text ?? input.html ?? "").slice(0, 800)}`,
    ].join("\n");
    const reply = await opts.llm.complete({
      purpose: "spam-score",
      prompt,
      maxTokens: 8,
      temperature: 0,
    });
    llmScore = parseLlmScore(reply.text);
    if (llmScore !== undefined) {
      signals.push({
        code: "llm.second_opinion",
        label: "LLM second opinion",
        points: 0,
        detail: `${llmScore}/100`,
      });
    }
  }

  const blockAt = opts.blockThreshold ?? 70;
  const reviewAt = opts.reviewThreshold ?? 35;
  const decisive = llmScore !== undefined ? Math.max(heuristicScore, llmScore) : heuristicScore;
  const verdict: "pass" | "review" | "block" =
    decisive >= blockAt ? "block" : decisive >= reviewAt ? "review" : "pass";

  return {
    heuristicScore,
    ...(llmScore !== undefined && { llmScore }),
    verdict,
    signals,
  };
}
