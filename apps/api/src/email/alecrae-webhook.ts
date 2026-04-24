/**
 * Inbound webhook receiver for AlecRae delivery events.
 *
 * AlecRae POSTs to https://crontech.ai/api/alecrae/webhook on each of:
 *   delivered, bounced, complained, opened, clicked
 *
 * Payload is signed with ALECRAE_WEBHOOK_SECRET using HMAC-SHA256.
 * Signature arrives as `X-AlecRae-Signature` (or `X-Signature`), hex
 * string, optionally prefixed with `sha256=`.
 *
 * Current behaviour:
 *   - Verify HMAC signature (timing-safe).
 *   - Parse JSON payload (permissive — missing fields are OK).
 *   - Structured console log so observability picks the event up.
 *   - Return 200 `{received: true}` on success, 401 on signature
 *     mismatch, 400 on malformed JSON.
 *
 * Follow-up (tracked in STRATEGY.md): persist events to an
 * `email_events` table, update user suppression list on hard bounce +
 * complaint, surface metrics on /admin.
 */

import { Hono } from "hono";

async function timingSafeEqualHex(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  const aBuf = new TextEncoder().encode(a);
  const bBuf = new TextEncoder().encode(b);
  let diff = 0;
  for (let i = 0; i < aBuf.length; i++) {
    diff |= (aBuf[i] ?? 0) ^ (bBuf[i] ?? 0);
  }
  return diff === 0;
}

async function computeHmacSha256Hex(
  secret: string,
  payload: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const app = new Hono();

app.post("/alecrae/webhook", async (c) => {
  const rawBody = await c.req.text();
  const secret = process.env["ALECRAE_WEBHOOK_SECRET"];

  if (secret) {
    const providedSig =
      c.req.header("x-alecrae-signature") ??
      c.req.header("x-signature") ??
      "";
    const normalisedSig = providedSig.replace(/^sha256=/i, "").trim();
    if (!normalisedSig) {
      return c.json({ error: "missing_signature" }, 401);
    }
    const expected = await computeHmacSha256Hex(secret, rawBody);
    const ok = await timingSafeEqualHex(normalisedSig, expected);
    if (!ok) {
      const ua = c.req.header("user-agent") ?? "unknown";
      console.warn(`[alecrae-webhook] invalid signature from ${ua}`);
      return c.json({ error: "invalid_signature" }, 401);
    }
  } else {
    // No secret configured — safe for local dev but DANGEROUS in prod.
    // Warn loudly so any forgotten env setup is visible in logs.
    console.warn(
      "[alecrae-webhook] ALECRAE_WEBHOOK_SECRET not set — signature verification SKIPPED",
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const event = typeof payload["event"] === "string" ? payload["event"] : "unknown";
  const messageId =
    typeof payload["message_id"] === "string" ? payload["message_id"] : "unknown";
  const to = typeof payload["to"] === "string" ? payload["to"] : "unknown";
  const timestamp =
    typeof payload["timestamp"] === "number" || typeof payload["timestamp"] === "string"
      ? String(payload["timestamp"])
      : new Date().toISOString();

  // Known event names from AlecRae's onboarding checklist:
  //   delivered | bounced | complained | opened | clicked
  const knownEvents = new Set([
    "delivered",
    "bounced",
    "complained",
    "opened",
    "clicked",
  ]);

  if (!knownEvents.has(event)) {
    console.warn(
      `[alecrae-webhook] unrecognised event="${event}" message_id=${messageId}`,
    );
  }

  console.log(
    `[alecrae-webhook] event=${event} message_id=${messageId} to=${to} ts=${timestamp}`,
  );

  // TODO: persist to email_events table once schema exists.
  // TODO: on bounced/complained, add to suppression list.
  // TODO: surface metrics on /admin.

  return c.json({ received: true });
});

export { app as alecRaeWebhookApp };
