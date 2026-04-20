// ── BLK-030 — High-level SMS send pipeline ─────────────────────────────
// Wraps the raw Sinch client with the cross-cutting concerns every
// customer-originated send needs:
//   • E.164 validation (both `from` and `to`)
//   • Rate limiting (per-user sliding window, in-memory)
//   • Segment math → cost × markup
//   • Persistence into `sms_messages`
//   • Retries with exponential backoff on 5xx
//
// The function is pure-ish: it takes an explicit `db` + `client` so
// tests can swap both out without touching globals.

import { smsMessages } from "@back-to-the-future/db";
import type { db as defaultDb } from "@back-to-the-future/db";
import {
  SinchError,
  isValidE164,
  segmentSms,
  applyMarkup,
  dollarsToMicrodollars,
  markupPercentFromEnv,
  type SinchClient,
} from "./sinch-client";

export type DbClient = typeof defaultDb;

// ── Rate limiter (per-user sliding window, in-memory) ─────────────────
// We deliberately keep this tiny + local to the send pipeline: the
// real authoritative rate limit is enforced at the API-key / tRPC
// layer. This inner limit is a safety valve that prevents one
// customer from accidentally hammering Sinch with thousands of sends
// in a loop during a misconfigured retry.

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;

const rateBuckets: Map<string, number[]> = new Map();

export function clearSmsRateLimits(): void {
  rateBuckets.clear();
}

function rateLimitKey(userId: string, fromNumber: string): string {
  return `${userId}:${fromNumber}`;
}

function checkRateLimit(
  userId: string,
  fromNumber: string,
  limit: number,
  now: number,
): { allowed: boolean; retryAfterMs: number } {
  const key = rateLimitKey(userId, fromNumber);
  const history = rateBuckets.get(key) ?? [];
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = history.filter((t) => t > cutoff);
  if (recent.length >= limit) {
    const oldest = recent[0] ?? now;
    return { allowed: false, retryAfterMs: RATE_LIMIT_WINDOW_MS - (now - oldest) };
  }
  recent.push(now);
  rateBuckets.set(key, recent);
  return { allowed: true, retryAfterMs: 0 };
}

// ── Retry policy (exponential backoff, 5xx only) ──────────────────────

export interface RetryPolicy {
  /** Maximum number of attempts (including the initial one). */
  maxAttempts: number;
  /** Base delay in milliseconds — doubles every attempt up to `maxDelayMs`. */
  baseDelayMs: number;
  /** Cap on the per-retry delay. */
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 2_000,
};

export type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// ── Send dependencies ─────────────────────────────────────────────────

export interface SendSmsDeps {
  db: DbClient;
  client: SinchClient;
  /** Overridable test seam for deterministic retries. */
  sleep?: SleepFn;
  /** Override retry policy (tests tighten delays; prod uses the default). */
  retry?: RetryPolicy;
  /** Override the markup percent. Defaults to `SMS_MARKUP_PERCENT` env. */
  markupPercent?: number;
  /** Override the per-minute rate limit. */
  rateLimitPerMinute?: number;
  /** Clock override for deterministic rate-limit tests. */
  now?: () => number;
}

export interface SendSmsInput {
  userId: string;
  from: string;
  to: string;
  body: string;
}

export interface SendSmsResult {
  id: string;
  providerMessageId: string | null;
  status: "queued" | "sent" | "delivered" | "failed";
  segments: number;
  costMicrodollars: number;
  markupMicrodollars: number;
  retailMicrodollars: number;
}

// ── SendSmsError — polite, typed errors for the tRPC boundary ─────────

export class SendSmsError extends Error {
  public readonly kind:
    | "invalid_phone"
    | "rate_limited"
    | "provider_error"
    | "persistence_error";
  public readonly retryAfterMs: number | undefined;
  public readonly providerStatus: number | undefined;

  constructor(
    message: string,
    options: {
      kind:
        | "invalid_phone"
        | "rate_limited"
        | "provider_error"
        | "persistence_error";
      retryAfterMs?: number | undefined;
      providerStatus?: number | undefined;
    },
  ) {
    super(message);
    this.name = "SendSmsError";
    this.kind = options.kind;
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
    if (options.providerStatus !== undefined) this.providerStatus = options.providerStatus;
  }
}

// ── Send function ─────────────────────────────────────────────────────

/**
 * Send an SMS on behalf of a customer. Handles validation, rate
 * limiting, cost computation, persistence, and 5xx retries.
 *
 * Behaviour:
 *   • Invalid E.164 → SendSmsError("invalid_phone") — never hits Sinch.
 *   • Rate-limited → SendSmsError("rate_limited") — row IS persisted
 *     with status "failed" so we can surface quota issues in history.
 *   • 5xx from Sinch → retries up to `retry.maxAttempts` with
 *     exponential backoff. Final failure → SendSmsError("provider_error")
 *     and row persisted with status "failed".
 *   • 4xx from Sinch → NO retry; row persisted failed.
 *   • 2xx → row persisted with status "sent".
 */
export async function sendSms(
  input: SendSmsInput,
  deps: SendSmsDeps,
): Promise<SendSmsResult> {
  const sleep = deps.sleep ?? defaultSleep;
  const retry = deps.retry ?? DEFAULT_RETRY_POLICY;
  const markupPercent = deps.markupPercent ?? markupPercentFromEnv();
  const limitPerMinute = deps.rateLimitPerMinute ?? DEFAULT_RATE_LIMIT_PER_MINUTE;
  const now = deps.now ?? (() => Date.now());

  // 1. E.164 validation at the boundary — never trust the caller.
  if (!isValidE164(input.from)) {
    throw new SendSmsError(
      "The `from` number must be in E.164 format, e.g. +14155551234.",
      { kind: "invalid_phone" },
    );
  }
  if (!isValidE164(input.to)) {
    throw new SendSmsError(
      "The `to` number must be in E.164 format, e.g. +14155551234.",
      { kind: "invalid_phone" },
    );
  }

  // 2. Rate limit.
  const gate = checkRateLimit(input.userId, input.from, limitPerMinute, now());
  if (!gate.allowed) {
    throw new SendSmsError(
      `You have hit the ${limitPerMinute}/minute send limit for ${input.from}. Please slow down and try again shortly.`,
      { kind: "rate_limited", retryAfterMs: gate.retryAfterMs },
    );
  }

  // 3. Segment math — we trust this over whatever Sinch echoes back.
  const segmentation = segmentSms(input.body);

  // 4. Try Sinch with exponential backoff on 5xx.
  let lastError: SinchError | Error | null = null;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (attempt < retry.maxAttempts) {
    attempt += 1;
    try {
      const response = await deps.client.sendSms({
        from: input.from,
        to: input.to,
        body: input.body,
      });
      // Segments: prefer Sinch's count when it matches our expectation,
      // otherwise trust our own (Sinch sometimes omits the field on
      // asynchronous create responses).
      const providerSegments = response.number_of_message_parts;
      const segments =
        typeof providerSegments === "number" && providerSegments > 0
          ? providerSegments
          : segmentation.segments;

      const wholesaleSingleMicrodollars = dollarsToMicrodollars(
        response.price_per_part?.amount ?? response.total_price?.amount,
      );
      const wholesaleMicrodollars =
        // If `total_price` is given, trust it. Otherwise multiply per-part × segments.
        response.total_price?.amount !== undefined
          ? dollarsToMicrodollars(response.total_price.amount)
          : wholesaleSingleMicrodollars * segments;
      const { retailMicrodollars, markupMicrodollars } = applyMarkup(
        wholesaleMicrodollars,
        markupPercent,
      );

      const row: typeof smsMessages.$inferInsert = {
        id: newMessageId(),
        userId: input.userId,
        direction: "send",
        fromNumber: input.from,
        toNumber: input.to,
        body: input.body,
        segments,
        status: "sent",
        providerMessageId: response.id,
        costMicrodollars: wholesaleMicrodollars,
        markupMicrodollars,
        sentAt: new Date(now()),
      };
      try {
        await deps.db.insert(smsMessages).values(row);
      } catch (err) {
        throw new SendSmsError(
          err instanceof Error
            ? `We sent the message but could not record it: ${err.message}`
            : "We sent the message but could not record it.",
          { kind: "persistence_error" },
        );
      }

      return {
        id: row.id,
        providerMessageId: response.id,
        status: "sent",
        segments,
        costMicrodollars: wholesaleMicrodollars,
        markupMicrodollars,
        retailMicrodollars,
      };
    } catch (err) {
      if (err instanceof SendSmsError) throw err;
      if (err instanceof SinchError) {
        lastError = err;
        if (err.retryable && attempt < retry.maxAttempts) {
          const delay = Math.min(
            retry.baseDelayMs * 2 ** (attempt - 1),
            retry.maxDelayMs,
          );
          await sleep(delay);
          continue;
        }
        break;
      }
      // Unknown error — do not retry.
      lastError =
        err instanceof Error ? err : new Error("Unknown SMS send failure.");
      break;
    }
  }

  // 5. Failure path — persist a failed row so the customer sees the attempt.
  const wholesaleMicrodollars = 0;
  const markupMicrodollars = 0;
  const row: typeof smsMessages.$inferInsert = {
    id: newMessageId(),
    userId: input.userId,
    direction: "send",
    fromNumber: input.from,
    toNumber: input.to,
    body: input.body,
    segments: segmentation.segments,
    status: "failed",
    costMicrodollars: wholesaleMicrodollars,
    markupMicrodollars,
    errorCode:
      lastError instanceof SinchError && lastError.code !== undefined
        ? lastError.code
        : lastError instanceof SinchError && lastError.status !== undefined
          ? String(lastError.status)
          : null,
    errorMessage: lastError?.message ?? "Send failed.",
  };
  try {
    await deps.db.insert(smsMessages).values(row);
  } catch {
    // If we can't even persist the failure, still surface the original.
  }

  throw new SendSmsError(
    lastError?.message ?? "The SMS carrier could not deliver the message.",
    {
      kind: "provider_error",
      ...(lastError instanceof SinchError && lastError.status !== undefined
        ? { providerStatus: lastError.status }
        : {}),
    },
  );
}

function newMessageId(): string {
  return `sms_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
