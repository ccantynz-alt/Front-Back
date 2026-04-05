/**
 * Email client abstraction.
 * Uses Resend API when RESEND_API_KEY is set, otherwise falls back to console.log.
 */

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

interface ResendSuccessResponse {
  id: string;
}

interface ResendErrorResponse {
  message: string;
}

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "Back to the Future <noreply@example.com>";

function getApiKey(): string | undefined {
  return process.env.RESEND_API_KEY;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<SendEmailResult> {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.log("[EMAIL FALLBACK] No RESEND_API_KEY set. Logging email:");
    console.log(`  To: ${to}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  HTML length: ${html.length} chars`);
    return { success: true, id: `local-${Date.now()}` };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const body = (await response.json()) as ResendErrorResponse;
      return {
        success: false,
        error: body.message ?? `HTTP ${response.status}`,
      };
    }

    const body = (await response.json()) as ResendSuccessResponse;
    return { success: true, id: body.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[EMAIL ERROR]", message);
    return { success: false, error: message };
  }
}

export type { SendEmailOptions, SendEmailResult };
