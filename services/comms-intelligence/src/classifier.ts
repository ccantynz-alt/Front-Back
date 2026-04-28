// ── Sentiment + Intent Classifier ─────────────────────────────────────
// Heuristic-first classification with optional LLM second-pass for low
// confidence inputs. Returns sentiment, intent, and a 0–1 confidence.

import { z } from "zod";
import type { LlmClient } from "./llm-client";

export const classifyInputSchema = z.object({
  text: z.string().min(1, "text required"),
});

export type ClassifyInput = z.infer<typeof classifyInputSchema>;

export type Sentiment = "positive" | "neutral" | "negative";

export type Intent =
  | "question"
  | "complaint"
  | "request"
  | "abuse"
  | "praise"
  | "smalltalk"
  | "cancel"
  | "purchase"
  | "support"
  | "other";

export interface ClassifyResult {
  sentiment: Sentiment;
  intent: Intent;
  confidence: number;
  source: "heuristic" | "llm" | "hybrid";
}

export interface ClassifyOptions {
  llm?: LlmClient | undefined;
  /** If heuristic confidence falls below this, consult the LLM. */
  llmThreshold?: number;
}

const POSITIVE_WORDS = [
  "love",
  "great",
  "awesome",
  "amazing",
  "excellent",
  "fantastic",
  "thank",
  "thanks",
  "perfect",
  "happy",
  "wonderful",
  "best",
  "good",
];

const NEGATIVE_WORDS = [
  "hate",
  "terrible",
  "awful",
  "horrible",
  "broken",
  "useless",
  "worst",
  "disappointed",
  "angry",
  "frustrated",
  "garbage",
  "scam",
  "fraud",
  "ripoff",
  "ridiculous",
];

const ABUSE_PATTERNS = [
  /\bfuck/i,
  /\bshit/i,
  /\bcunt/i,
  /\basshole/i,
  /\bbitch/i,
  /\b(kill yourself|kys)\b/i,
];

function countMatches(text: string, words: ReadonlyArray<string>): number {
  const lower = text.toLowerCase();
  let n = 0;
  for (const w of words) {
    const re = new RegExp(`\\b${w}\\b`, "g");
    const matches = lower.match(re);
    if (matches) n += matches.length;
  }
  return n;
}

function detectSentiment(text: string): { sentiment: Sentiment; strength: number } {
  const pos = countMatches(text, POSITIVE_WORDS);
  const neg = countMatches(text, NEGATIVE_WORDS);
  const exclamations = (text.match(/!/g) ?? []).length;
  const score = pos - neg + (exclamations > 2 ? (pos > neg ? 1 : -1) : 0);
  const strength = Math.min(1, Math.abs(score) * 0.3);
  if (score > 0) return { sentiment: "positive", strength };
  if (score < 0) return { sentiment: "negative", strength };
  return { sentiment: "neutral", strength: 0 };
}

function detectIntent(text: string): { intent: Intent; strength: number } {
  const lower = text.toLowerCase();
  const trimmed = text.trim();
  if (ABUSE_PATTERNS.some((re) => re.test(text))) {
    return { intent: "abuse", strength: 0.9 };
  }
  if (/\b(cancel|unsubscribe|refund|terminate)\b/.test(lower)) {
    return { intent: "cancel", strength: 0.8 };
  }
  if (/\b(complaint|complain|disappointed|worst)\b/.test(lower)) {
    return { intent: "complaint", strength: 0.7 };
  }
  if (/\b(broken|not working|issue|problem|error|bug)\b/.test(lower)) {
    return { intent: "support", strength: 0.7 };
  }
  // Questions take precedence over purchase to avoid "Where is my order?"
  // being classified as a purchase intent.
  if (trimmed.endsWith("?") || /\b(what|how|why|when|where|who|which)\b/.test(lower)) {
    return { intent: "question", strength: 0.6 };
  }
  if (/\b(buy|purchase|checkout|subscribe)\b/.test(lower)) {
    return { intent: "purchase", strength: 0.7 };
  }
  if (/\b(love|thank|thanks|appreciate|grateful|amazing)\b/.test(lower)) {
    return { intent: "praise", strength: 0.6 };
  }
  if (/\b(please|could you|can you|would you|need|want)\b/.test(lower)) {
    return { intent: "request", strength: 0.5 };
  }
  if (/\b(hi|hello|hey|sup|yo|good morning|good afternoon)\b/.test(lower)) {
    return { intent: "smalltalk", strength: 0.4 };
  }
  return { intent: "other", strength: 0.2 };
}

export function heuristicClassify(text: string): ClassifyResult {
  const s = detectSentiment(text);
  const i = detectIntent(text);
  const confidence = Math.min(1, (s.strength + i.strength) / 2 + 0.2);
  return {
    sentiment: s.sentiment,
    intent: i.intent,
    confidence: Number(confidence.toFixed(2)),
    source: "heuristic",
  };
}

const VALID_SENTIMENTS = new Set(["positive", "neutral", "negative"]);
const VALID_INTENTS = new Set([
  "question",
  "complaint",
  "request",
  "abuse",
  "praise",
  "smalltalk",
  "cancel",
  "purchase",
  "support",
  "other",
]);

function buildClassifyPrompt(text: string): string {
  return [
    "You classify a single message. Reply with exactly two lines:",
    "SENTIMENT: <positive|neutral|negative>",
    "INTENT: <question|complaint|request|abuse|praise|smalltalk|cancel|purchase|support|other>",
    "",
    `MESSAGE: ${text}`,
  ].join("\n");
}

function parseClassifyResponse(text: string): {
  sentiment?: Sentiment;
  intent?: Intent;
} {
  const sentMatch = text.match(/SENTIMENT:\s*(\w+)/i);
  const intentMatch = text.match(/INTENT:\s*(\w+)/i);
  const out: { sentiment?: Sentiment; intent?: Intent } = {};
  if (sentMatch?.[1]) {
    const s = sentMatch[1].toLowerCase();
    if (VALID_SENTIMENTS.has(s)) out.sentiment = s as Sentiment;
  }
  if (intentMatch?.[1]) {
    const i = intentMatch[1].toLowerCase();
    if (VALID_INTENTS.has(i)) out.intent = i as Intent;
  }
  return out;
}

export async function classify(
  input: ClassifyInput,
  opts: ClassifyOptions = {},
): Promise<ClassifyResult> {
  const heuristic = heuristicClassify(input.text);
  const threshold = opts.llmThreshold ?? 0.4;
  if (!opts.llm || heuristic.confidence >= threshold) {
    return heuristic;
  }
  try {
    const res = await opts.llm.complete({
      purpose: "classify",
      prompt: buildClassifyPrompt(input.text),
      maxTokens: 32,
      temperature: 0,
    });
    const parsed = parseClassifyResponse(res.text);
    return {
      sentiment: parsed.sentiment ?? heuristic.sentiment,
      intent: parsed.intent ?? heuristic.intent,
      confidence: Math.max(heuristic.confidence, 0.7),
      source: "hybrid",
    };
  } catch {
    return heuristic;
  }
}
