// ── BLK-030 — Sinch SMS REST API client ───────────────────────────────
// Thin HTTP client for the Sinch SMS REST API (JSON over HTTPS, Bearer
// token auth). Exposes a small typed surface — `sendSms`, `getMessage`,
// `listMessages` — so callers (the tRPC router, admin CLIs, etc.)
// never have to think about the wire format.
//
// Dependency injection: pass a custom `fetch` for tests. In production
// we default to the platform `fetch` and the creds live in env:
//   SINCH_SERVICE_PLAN_ID, SINCH_API_TOKEN, SINCH_BASE_URL.
//
// Iron rules honoured (CLAUDE.md §6.1):
//   • Zod at the boundary — every response is parsed before we return.
//   • TS strict — no `any`, no `@ts-ignore`, no silenced errors.
//   • DI fetch so tests never hit the network.
//   • Polite error text — tone rules apply to runtime messages that
//     may surface in the UI.

import {
  E164Schema,
  SinchSendResponseSchema,
  SinchMessageSchema,
  SinchListMessagesResponseSchema,
  type SinchSendResponse,
  type SinchMessage,
  type SinchListMessagesResponse,
  type SmsSegmentation,
} from "./sinch-types";

// ── Config ────────────────────────────────────────────────────────────

export interface SinchConfig {
  /** Sinch service plan id. `SINCH_SERVICE_PLAN_ID` in the environment. */
  servicePlanId: string;
  /** Sinch API token. `SINCH_API_TOKEN` in the environment. */
  apiToken: string;
  /** Base URL. Defaults to the zt.sinch.com XMS endpoint. */
  baseUrl: string;
}

export interface SinchClientDeps {
  fetchImpl?: typeof fetch;
  /** Overridable clock for deterministic tests. */
  now?: () => number;
}

/** Construct config from the standard environment variables. */
export function configFromEnv(): SinchConfig {
  return {
    servicePlanId: process.env["SINCH_SERVICE_PLAN_ID"] ?? "",
    apiToken: process.env["SINCH_API_TOKEN"] ?? "",
    baseUrl: process.env["SINCH_BASE_URL"] ?? "https://zt.sinch.com/xms/v1",
  };
}

// ── SinchError ────────────────────────────────────────────────────────
// Thrown whenever Sinch returns a non-2xx response OR a body that fails
// schema validation. Callers inspect `status` to decide whether to
// retry (5xx) or surface (4xx) the error.

export class SinchError extends Error {
  public readonly status: number | undefined;
  public readonly code: string | undefined;
  public readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      status?: number | undefined;
      code?: string | undefined;
      retryable?: boolean | undefined;
    } = {},
  ) {
    super(message);
    this.name = "SinchError";
    if (options.status !== undefined) this.status = options.status;
    if (options.code !== undefined) this.code = options.code;
    this.retryable = options.retryable ?? false;
  }
}

// ── E.164 validation (small regex, exported for router Zod refine) ───

/**
 * Strict E.164 check — leading '+', first digit non-zero, 8 to 15
 * digits total. Any other format (local number, trunk prefix, etc.)
 * is rejected so we never hand Sinch an ambiguous MSISDN.
 */
export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/u.test(value);
}

/** Zod-friendly assertion helper. Returns the input if valid, throws otherwise. */
export function assertE164(value: string): string {
  return E164Schema.parse(value);
}

// ── GSM-7 detection + segment math ────────────────────────────────────
// GSM-7 default alphabet with the standard extension table (Unicode
// chars mapped via 0x1B escape). Non-GSM characters force UCS-2 which
// halves the per-segment payload.
// Single-segment limits: GSM-7 = 160 chars, UCS-2 = 70 chars.
// Concatenated multipart: GSM-7 = 153/seg, UCS-2 = 67/seg (UDH overhead).

const GSM7_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);
const GSM7_EXTENDED = new Set("\f^{}\\[~]|€");

function isGsm7(body: string): boolean {
  for (const ch of body) {
    if (!GSM7_BASIC.has(ch) && !GSM7_EXTENDED.has(ch)) return false;
  }
  return true;
}

function gsm7EncodedLength(body: string): number {
  let length = 0;
  for (const ch of body) {
    length += GSM7_EXTENDED.has(ch) ? 2 : 1;
  }
  return length;
}

/**
 * Compute segment count + encoding for a given SMS body. Matches what
 * Sinch bills per segment so our cost + markup math stays honest.
 */
export function segmentSms(body: string): SmsSegmentation {
  if (body.length === 0) {
    return { segments: 1, encoding: "gsm7", length: 0 };
  }
  if (isGsm7(body)) {
    const length = gsm7EncodedLength(body);
    if (length <= 160) return { segments: 1, encoding: "gsm7", length };
    return {
      segments: Math.ceil(length / 153),
      encoding: "gsm7",
      length,
    };
  }
  // UCS-2: count UTF-16 code units.
  let length = 0;
  for (const ch of body) {
    length += ch.length; // surrogate pairs → 2
  }
  if (length <= 70) return { segments: 1, encoding: "ucs2", length };
  return {
    segments: Math.ceil(length / 67),
    encoding: "ucs2",
    length,
  };
}

// ── Markup helper (shared with send.ts / router) ──────────────────────

/**
 * Apply the configured markup percentage to a wholesale cost. Expressed
 * in microdollars (1 USD = 1_000_000 µ$) so we never round floating
 * point dollars mid-calculation.
 */
export function applyMarkup(
  wholesaleMicrodollars: number,
  markupPercent: number,
): { retailMicrodollars: number; markupMicrodollars: number } {
  const markup = Math.round((wholesaleMicrodollars * markupPercent) / 100);
  return {
    retailMicrodollars: wholesaleMicrodollars + markup,
    markupMicrodollars: markup,
  };
}

/** Parse a Sinch dollar amount (string or number) into microdollars. */
export function dollarsToMicrodollars(value: string | number | undefined): number {
  if (value === undefined) return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 1_000_000);
}

export function markupPercentFromEnv(): number {
  const raw = process.env["SMS_MARKUP_PERCENT"];
  const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return 30;
  return parsed;
}

// ── Core transport ────────────────────────────────────────────────────

export class SinchClient {
  private readonly config: SinchConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(config: SinchConfig, deps: SinchClientDeps = {}) {
    this.config = config;
    this.fetchImpl = deps.fetchImpl ?? fetch;
  }

  private endpoint(path: string): string {
    const base = this.config.baseUrl.replace(/\/+$/u, "");
    const plan = encodeURIComponent(this.config.servicePlanId);
    return `${base}/${plan}${path}`;
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = this.endpoint(path);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiToken}`,
      Accept: "application/json",
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await this.fetchImpl(url, init);
    } catch (err) {
      throw new SinchError(
        err instanceof Error
          ? `Unable to reach the SMS carrier: ${err.message}`
          : "Unable to reach the SMS carrier.",
        { retryable: true },
      );
    }

    const text = await res.text();
    let json: unknown = null;
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }

    if (!res.ok) {
      const code = extractErrorCode(json);
      const message = extractErrorMessage(json) ??
        `Sinch ${method} ${path} failed with HTTP ${res.status}.`;
      throw new SinchError(message, {
        status: res.status,
        ...(code !== undefined ? { code } : {}),
        retryable: res.status >= 500 && res.status < 600,
      });
    }
    return json;
  }

  /**
   * Send an SMS batch. Returns the raw Sinch response parsed through
   * Zod so callers get a typed object they can trust.
   */
  async sendSms(input: {
    from: string;
    to: string;
    body: string;
    deliveryReport?: "none" | "summary" | "full" | "per_recipient" | "per_recipient_final";
    callbackUrl?: string;
  }): Promise<SinchSendResponse> {
    if (!isValidE164(input.from)) {
      throw new SinchError(
        "The `from` number must be in E.164 format, e.g. +14155551234.",
        { status: 400 },
      );
    }
    if (!isValidE164(input.to)) {
      throw new SinchError(
        "The `to` number must be in E.164 format, e.g. +14155551234.",
        { status: 400 },
      );
    }
    const body: Record<string, unknown> = {
      from: input.from,
      to: [input.to],
      body: input.body,
    };
    if (input.deliveryReport !== undefined) {
      body["delivery_report"] = input.deliveryReport;
    }
    if (input.callbackUrl !== undefined) {
      body["callback_url"] = input.callbackUrl;
    }
    const raw = await this.request("POST", "/batches", body);
    return SinchSendResponseSchema.parse(raw);
  }

  /** Fetch a single batch (message) by its Sinch id. */
  async getMessage(input: { messageId: string }): Promise<SinchMessage> {
    const path = `/batches/${encodeURIComponent(input.messageId)}`;
    const raw = await this.request("GET", path);
    return SinchMessageSchema.parse(raw);
  }

  /**
   * List messages (batches). `cursor` is opaque — pass back the string
   * the previous call returned. `limit` maps to Sinch `page_size`.
   */
  async listMessages(
    input: { cursor?: string; limit?: number } = {},
  ): Promise<SinchListMessagesResponse> {
    const params = new URLSearchParams();
    if (input.cursor !== undefined) params.set("page", input.cursor);
    if (input.limit !== undefined) params.set("page_size", String(input.limit));
    const suffix = params.toString().length > 0 ? `?${params.toString()}` : "";
    const raw = await this.request("GET", `/batches${suffix}`);
    return SinchListMessagesResponseSchema.parse(raw);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function extractErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  const text = record["text"];
  if (typeof text === "string" && text.length > 0) return text;
  const message = record["message"];
  if (typeof message === "string" && message.length > 0) return message;
  const detail = record["detail"];
  if (typeof detail === "string" && detail.length > 0) return detail;
  return undefined;
}

function extractErrorCode(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  const code = record["code"];
  if (typeof code === "string" && code.length > 0) return code;
  if (typeof code === "number") return String(code);
  return undefined;
}

// ── HMAC signature verification (inbound webhook) ─────────────────────
// Sinch signs inbound MO payloads by HMAC-SHA256 over the raw body
// using the shared webhook secret. The signature arrives in either
// `x-sinch-signature` or `x-sinch-webhook-signature`. We verify it
// with a constant-time compare so timing does not leak the secret.

export async function verifySinchSignature(input: {
  rawBody: string;
  provided: string | null | undefined;
  secret: string;
}): Promise<boolean> {
  if (!input.provided || input.secret.length === 0) return false;
  const { createHmac } = await import("node:crypto");
  const computed = createHmac("sha256", input.secret)
    .update(input.rawBody, "utf8")
    .digest("hex");
  // Some Sinch deployments prefix with the algorithm, e.g. "sha256=...".
  const normalised = input.provided.startsWith("sha256=")
    ? input.provided.slice("sha256=".length)
    : input.provided;
  return timingSafeEqual(computed, normalised.toLowerCase());
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
