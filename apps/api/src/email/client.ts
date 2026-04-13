/**
 * Email client abstraction with provider failover.
 *
 * Provider priority:
 *   1. AlecRae MTA (ALECRAE_API_URL + ALECRAE_API_KEY) — our own infrastructure
 *   2. Resend (RESEND_API_KEY) — third-party fallback
 *   3. Console log — development fallback
 *
 * AlecRae and Crontech are separate legal entities. Communication between
 * them happens exclusively via public API — never shared internal code.
 * This is intentional for legal isolation.
 */

import { z } from "zod";

// ── Schemas ────────────────────────────────────────────────────

const SendEmailInputSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
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
  error?: string;
  message?: string;
}

async function sendViaAlecRae(
  to: string,
  subject: string,
  html: string,
  headers?: Record<string, string>,
): Promise<SendEmailResult> {
  const baseUrl = process.env["ALECRAE_API_URL"];
  const apiKey = process.env["ALECRAE_API_KEY"];

  if (!baseUrl || !apiKey) return { success: false, error: "not_configured" };

  try {
    const response = await fetch(`${baseUrl}/api/email/send`, {
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
        headers,
      }),
    });

    if (!response.ok) {
      const body = (await response.json()) as AlecRaeResponse;
      return {
        success: false,
        provider: "alecrae",
        error: body.error ?? body.message ?? `HTTP ${response.status}`,
      };
    }

    const body = (await response.json()) as AlecRaeResponse;
    return { success: true, id: body.id, provider: "alecrae" };
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
  const siteName = process.env["SITE_NAME"] ?? "Crontech";
  const fromEmail = process.env["EMAIL_FROM"] ?? "noreply@crontech.ai";
  return `${siteName} <${fromEmail}>`;
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Send an email using the best available provider.
 * Tries AlecRae MTA first, falls back to Resend, then console.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  headers?: Record<string, string>,
): Promise<SendEmailResult> {
  // Validate input
  const parsed = SendEmailInputSchema.safeParse({ to, subject, html, headers });
  if (!parsed.success) {
    return { success: false, error: `Invalid input: ${parsed.error.message}` };
  }

  // 1. Try AlecRae MTA (our own infrastructure)
  const alecRaeResult = await sendViaAlecRae(to, subject, html, headers);
  if (alecRaeResult.success) return alecRaeResult;
  if (alecRaeResult.error !== "not_configured") {
    // AlecRae was configured but failed — log and try fallback
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
  if (process.env["ALECRAE_API_URL"] && process.env["ALECRAE_API_KEY"]) {
    return "alecrae";
  }
  if (process.env["RESEND_API_KEY"]) {
    return "resend";
  }
  return "console";
}

export { SendEmailInputSchema };
export type { SendEmailInput, SendEmailResult };
