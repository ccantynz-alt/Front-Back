// ── Fraud Scorer ──────────────────────────────────────────────────────
// Rule-based heuristics + optional LLM second opinion for verify/SMS/voice
// fraud detection. Returns a 0–100 risk score, an enumerated list of
// triggered signals, and an allow/challenge/block decision.

import { z } from "zod";
import type { LlmClient } from "./llm-client";

export const fraudInputSchema = z.object({
  identifier: z.string().min(1, "identifier required"),
  channel: z.enum(["sms", "voice", "email", "whatsapp"]),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  recentAttempts: z
    .array(
      z.object({
        at: z.string(),
        outcome: z.enum(["success", "failure", "expired", "blocked"]),
        ipAddress: z.string().optional(),
      }),
    )
    .optional(),
  countryCode: z.string().length(2).optional(),
});

export type FraudInput = z.infer<typeof fraudInputSchema>;

export type FraudSignal =
  | "VELOCITY_HIGH"
  | "VELOCITY_EXTREME"
  | "REPEATED_FAILURE"
  | "DISPOSABLE_NUMBER_RANGE"
  | "KNOWN_BAD_IP"
  | "BURNER_USER_AGENT"
  | "GEO_ANOMALY"
  | "PREMIUM_RATE_PREFIX"
  | "MISSING_METADATA"
  | "LLM_FLAGGED";

export type FraudDecision = "allow" | "challenge" | "block";

export interface FraudScoreResult {
  score: number;
  signals: FraudSignal[];
  decision: FraudDecision;
  reasoning: string;
}

export interface ScoreFraudOptions {
  llm?: LlmClient | undefined;
  /** Override "now" for deterministic tests. */
  now?: Date;
}

// Known-bad IP CIDRs — small canonical set for v1. Real prod plugs in
// IPQualityScore / Spur. v1 catches the obvious offenders.
const KNOWN_BAD_IPS = new Set<string>([
  "185.220.101.1", // Tor exit node sample
  "192.42.116.16", // Tor exit node sample
  "10.0.0.0", // RFC1918 reaching public verify == suspicious
]);

// Number ranges historically associated with disposable/VoIP numbers.
// v1 covers a small canonical set; prod augments via Twilio Lookup-class.
const DISPOSABLE_NUMBER_PREFIXES = [
  "+1267", // generic VoIP block
  "+1747",
  "+44740", // UK virtual range sample
  "+972", // historically high-fraud range for verify
];

// Premium-rate prefixes — fraudsters initiate verify to dial-back-charge.
const PREMIUM_RATE_PREFIXES = [
  "+1900",
  "+44871",
  "+44872",
  "+44873",
];

// User agents that indicate scripted / burner traffic.
const BURNER_USER_AGENTS = [
  /^curl\//i,
  /python-requests/i,
  /scrapy/i,
  /go-http-client/i,
  /^$/, // empty UA
];

function looksLikeKnownBadIp(ip: string | undefined): boolean {
  if (!ip) return false;
  return KNOWN_BAD_IPS.has(ip);
}

function looksLikeBurnerUserAgent(ua: string | undefined): boolean {
  if (ua === undefined) return true; // missing UA on a verify is itself a signal
  return BURNER_USER_AGENTS.some((re) => re.test(ua));
}

function looksLikeDisposableNumber(identifier: string): boolean {
  return DISPOSABLE_NUMBER_PREFIXES.some((p) => identifier.startsWith(p));
}

function looksLikePremiumRate(identifier: string): boolean {
  return PREMIUM_RATE_PREFIXES.some((p) => identifier.startsWith(p));
}

function computeVelocity(
  attempts: ReadonlyArray<{ at: string; outcome: string }> | undefined,
  now: Date,
): { last5min: number; last1hr: number; failures: number } {
  if (!attempts || attempts.length === 0) {
    return { last5min: 0, last1hr: 0, failures: 0 };
  }
  let last5min = 0;
  let last1hr = 0;
  let failures = 0;
  const fiveMinAgo = now.getTime() - 5 * 60 * 1000;
  const oneHrAgo = now.getTime() - 60 * 60 * 1000;
  for (const a of attempts) {
    const t = Date.parse(a.at);
    if (Number.isNaN(t)) continue;
    if (t >= fiveMinAgo) last5min += 1;
    if (t >= oneHrAgo) last1hr += 1;
    if (a.outcome === "failure" || a.outcome === "expired" || a.outcome === "blocked") {
      failures += 1;
    }
  }
  return { last5min, last1hr, failures };
}

function detectGeoAnomaly(
  attempts:
    | ReadonlyArray<{ ipAddress?: string | undefined }>
    | undefined,
  currentIp: string | undefined,
): boolean {
  if (!attempts || !currentIp) return false;
  // crude v1 heuristic: any prior attempt from a different /16 in the
  // last hour is a geographic anomaly worth flagging. Real prod wires up
  // MaxMind / IPinfo geo lookups.
  const currentPrefix = currentIp.split(".").slice(0, 2).join(".");
  for (const a of attempts) {
    if (!a.ipAddress) continue;
    const otherPrefix = a.ipAddress.split(".").slice(0, 2).join(".");
    if (otherPrefix && otherPrefix !== currentPrefix) {
      return true;
    }
  }
  return false;
}

export function heuristicFraudScore(input: FraudInput, now: Date = new Date()): {
  score: number;
  signals: FraudSignal[];
} {
  const signals: FraudSignal[] = [];
  let score = 0;

  const velocity = computeVelocity(input.recentAttempts, now);
  if (velocity.last5min >= 5) {
    signals.push("VELOCITY_EXTREME");
    score += 50;
  } else if (velocity.last5min >= 3 || velocity.last1hr >= 10) {
    signals.push("VELOCITY_HIGH");
    score += 25;
  }
  if (velocity.failures >= 3) {
    signals.push("REPEATED_FAILURE");
    score += 15;
  }

  if (looksLikeDisposableNumber(input.identifier)) {
    signals.push("DISPOSABLE_NUMBER_RANGE");
    score += 20;
  }
  if (looksLikePremiumRate(input.identifier)) {
    signals.push("PREMIUM_RATE_PREFIX");
    score += 40;
  }

  if (looksLikeKnownBadIp(input.ipAddress)) {
    signals.push("KNOWN_BAD_IP");
    score += 35;
  }

  if (looksLikeBurnerUserAgent(input.userAgent)) {
    signals.push("BURNER_USER_AGENT");
    score += 15;
  }

  if (detectGeoAnomaly(input.recentAttempts, input.ipAddress)) {
    signals.push("GEO_ANOMALY");
    score += 20;
  }

  if (input.ipAddress === undefined && input.userAgent === undefined) {
    signals.push("MISSING_METADATA");
    score += 10;
  }

  if (score > 100) score = 100;
  return { score, signals };
}

function decideFromScore(score: number): FraudDecision {
  if (score >= 70) return "block";
  if (score >= 35) return "challenge";
  return "allow";
}

function buildLlmPrompt(input: FraudInput, heuristic: { score: number; signals: FraudSignal[] }): string {
  return [
    "You are a telecom fraud-detection second opinion. Reply with exactly one line:",
    "VERDICT: <allow|challenge|block>",
    "",
    `channel: ${input.channel}`,
    `identifier: ${input.identifier}`,
    `ipAddress: ${input.ipAddress ?? "unknown"}`,
    `userAgent: ${input.userAgent ?? "unknown"}`,
    `countryCode: ${input.countryCode ?? "unknown"}`,
    `recentAttempts: ${input.recentAttempts?.length ?? 0}`,
    `heuristicScore: ${heuristic.score}`,
    `heuristicSignals: ${heuristic.signals.join(",") || "none"}`,
  ].join("\n");
}

function parseLlmVerdict(text: string): FraudDecision | null {
  const m = text.match(/VERDICT:\s*(allow|challenge|block)/i);
  if (!m || !m[1]) return null;
  return m[1].toLowerCase() as FraudDecision;
}

export async function scoreFraud(
  input: FraudInput,
  opts: ScoreFraudOptions = {},
): Promise<FraudScoreResult> {
  const now = opts.now ?? new Date();
  const heuristic = heuristicFraudScore(input, now);
  let { score } = heuristic;
  const signals: FraudSignal[] = [...heuristic.signals];

  if (opts.llm) {
    try {
      const res = await opts.llm.complete({
        purpose: "fraud-score",
        prompt: buildLlmPrompt(input, heuristic),
        maxTokens: 64,
        temperature: 0,
      });
      const verdict = parseLlmVerdict(res.text);
      if (verdict === "block") {
        score = Math.max(score, 80);
        signals.push("LLM_FLAGGED");
      } else if (verdict === "challenge") {
        score = Math.max(score, 50);
        signals.push("LLM_FLAGGED");
      }
      if (score > 100) score = 100;
    } catch {
      // LLM is advisory — fall back to heuristic-only on failure.
    }
  }

  const decision = decideFromScore(score);
  const reasoning =
    signals.length === 0
      ? "no fraud signals triggered"
      : `${signals.length} signal(s) triggered: ${signals.join(", ")}`;

  return { score, signals, decision, reasoning };
}
