/**
 * Email client abstraction with provider failover.
 *
 * Provider priority:
 *   1. AlecRae MTA (ALECRAE_BASE_URL + ALECRAE_API_KEY) — our own infrastructure
 *   2. Resend (RESEND_API_KEY) — third-party fallback
 *   3. Console log — development fallback
 *
 * AlecRae and Crontech are separate legal entities. Communication between
 * them happens exclusively via public API — never shared internal code.
 * This is intentional for legal isolation.
 *
 * Env var names match the AlecRae onboarding checklist (2026-04-22):
 *   ALECRAE_BASE_URL      — e.g. https://api.alecrae.com/v1 (includes /v1)
 *   ALECRAE_API_KEY       — tenant-scoped key from AlecRae's seed.ts output
 *   ALECRAE_FROM_ADDRESS  — e.g. Crontech <noreply@mail.crontech.ai>
 *   ALECRAE_WEBHOOK_SECRET — shared secret for inbound webhook verification
 *
 * The older env names (ALECRAE_API_URL, EMAIL_FROM) are still read as a
 * deprecated fallback so pre-existing deployments don't silently break.
 * Remove after a safe grace period.
 */

import { z } from "zod";

// ── Schemas ────────────────────────────────────────────────────

const SendEmailInputSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
  messageId: z.string().optional(),
});

type SendEmailInput = z.infer<typeof SendEmailInputSchema>;

interface SendEmailResult {
  success: boolean;
  id?: string | undefined;
  provider?: "alecrae" | "resend" | "console" | undefined;
  error?: string | undefined;
}

// ── Provider: AlecRae MTA ──────────────────────────────────────

interface AlecRaeResponse {
  id?: string;
  status?: string;
  error?: string;
  message?: string;
}

function getAlecRaeBaseUrl(): string | undefined {
  // Preferred name per AlecRae onboarding checklist.
  const preferred = process.env["ALECRAE_BASE_URL"];
  if (preferred) return preferred;
  // Legacy fallback — warn so we notice stale envs in logs.
  const legacy = process.env["ALECRAE_API_URL"];
  if (legacy) {
    console.warn(
      "[EMAIL] ALECRAE_API_URL is deprecated — rename to ALECRAE_BASE_URL",
    );
    return legacy;
  }
  return undefined;
}

async function sendViaAlecRae(
  to: string,
  subject: string,
  html: string,
  options: { headers?: Record<string, string>; messageId?: string },
): Promise<SendEmailResult> {
  const baseUrl = getAlecRaeBaseUrl();
  const apiKey = process.env["ALECRAE_API_KEY"];

  if (!baseUrl || !apiKey) return { success: false, error: "not_configured" };

  // AlecRae's onboarding checklist: POST {ALECRAE_BASE_URL}/send
  // where ALECRAE_BASE_URL already includes the /v1 suffix.
  const endpoint = `${baseUrl.replace(/\/$/, "")}/send`;

  // message_id is required for AlecRae's idempotency guarantee. Generate
  // one if the caller didn't supply one — retries with the same id will
  // not double-send.
  const messageId = options.messageId ?? crypto.randomUUID();

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getFromAddress(),
        to,
        subject,
        html,
        message_id: messageId,
        headers: options.headers,
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as AlecRaeResponse;
      return {
        success: false,
        provider: "alecrae",
        error: body.error ?? body.message ?? `HTTP ${response.status}`,
      };
    }

    const body = (await response.json()) as AlecRaeResponse;
    return { success: true, id: body.id ?? messageId, provider: "alecrae" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.warn("[EMAIL] AlecRae MTA failed, will try fallback:", message);
    return { success: false, provider: "alecrae", error: message };
  }
}

// ── Provider: Resend (Fallback) ────────────────────────────────

const RESEND_API_URL = "https://api.resend.com/emails";

interface ResendSuccessResponse {
  id: string;
}

interface ResendErrorResponse {
  message: string;
}

async function sendViaResend(
  to: string,
  subject: string,
  html: string,
): Promise<SendEmailResult> {
  const apiKey = process.env["RESEND_API_KEY"];

  if (!apiKey) return { success: false, error: "not_configured" };

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getFromAddress(),
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const body = (await response.json()) as ResendErrorResponse;
      return {
        success: false,
        provider: "resend",
        error: body.message ?? `HTTP ${response.status}`,
      };
    }

    const body = (await response.json()) as ResendSuccessResponse;
    return { success: true, id: body.id, provider: "resend" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, provider: "resend", error: message };
  }
}

// ── Provider: Console (Development) ────────────────────────────

function sendViaConsole(
  to: string,
  subject: string,
  html: string,
): SendEmailResult {
  console.log("[EMAIL DEV] Logging email (no provider configured):");
  console.log(`  To: ${to}`);
  console.log(`  Subject: ${subject}`);
  console.log(`  HTML length: ${html.length} chars`);
  return { success: true, id: `dev-${Date.now()}`, provider: "console" };
}

// ── Helpers ────────────────────────────────────────────────────

function getFromAddress(): string {
  // Prefer AlecRae's onboarding name. If it already has a display name
  // ("Crontech <noreply@...>"), use as-is. Otherwise wrap with SITE_NAME.
  const alec = process.env["ALECRAE_FROM_ADDRESS"];
  if (alec) {
    if (alec.includes("<")) return alec;
    const siteName = process.env["SITE_NAME"] ?? "Crontech";
    return `${siteName} <${alec}>`;
  }
  // Legacy fallback.
  const siteName = process.env["SITE_NAME"] ?? "Crontech";
  const fromEmail = process.env["EMAIL_FROM"] ?? "noreply@crontech.ai";
  if (fromEmail.includes("<")) return fromEmail;
  return `${siteName} <${fromEmail}>`;
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Send an email using the best available provider.
 * Tries AlecRae MTA first, falls back to Resend, then console.
 *
 * `options.messageId` enables end-to-end idempotency: retries with the
 * same id never double-send. Auto-generated if not supplied.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  options?: { headers?: Record<string, string>; messageId?: string },
): Promise<SendEmailResult> {
  // Validate input
  const parsed = SendEmailInputSchema.safeParse({
    to,
    subject,
    html,
    headers: options?.headers,
    messageId: options?.messageId,
  });
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  const opts = {
    ...(options?.headers !== undefined && { headers: options.headers }),
    ...(options?.messageId !== undefined && { messageId: options.messageId }),
  };

  // 1. Try AlecRae MTA (our own infrastructure)
  const alecRaeResult = await sendViaAlecRae(to, subject, html, opts);
  if (alecRaeResult.success) return alecRaeResult;
  if (alecRaeResult.error !== "not_configured") {
    console.warn("[EMAIL] AlecRae failed:", alecRaeResult.error);
  }

  // 2. Fall back to Resend
  const resendResult = await sendViaResend(to, subject, html);
  if (resendResult.success) return resendResult;
  if (resendResult.error !== "not_configured") {
    console.warn("[EMAIL] Resend failed:", resendResult.error);
  }

  // 3. Fall back to console (development)
  return sendViaConsole(to, subject, html);
}

/**
 * Check which email provider is currently active.
 */
export function getActiveProvider(): "alecrae" | "resend" | "console" {
  if (getAlecRaeBaseUrl() && process.env["ALECRAE_API_KEY"]) {
    return "alecrae";
  }
  if (process.env["RESEND_API_KEY"]) {
    return "resend";
  }
  return "console";
}

export { SendEmailInputSchema };
export type { SendEmailInput, SendEmailResult };
