// ── Sentinel Slack Alerter ──────────────────────────────────────────
// Low-level channel-aware Slack poster used by the daemon digests and
// the critical alerter. Distinct from the rich `sendSlackAlert` helper
// in `./types` — this is the plain-text entry point that the systemd
// timer reaches for.
//
// Design rules:
//   1. Graceful degradation: when SLACK_WEBHOOK_URL is unset, this
//      function returns { sent: false, reason: "..." } and never
//      throws. The daemon must run fine without Slack configured.
//   2. Secret scrubbing: outbound payloads are sanitised for API keys,
//      bearer tokens, and KEY/SECRET/TOKEN/PASSWORD env-style leaks
//      before they reach Slack. Even if an analyzer accidentally
//      embeds a secret in the digest, we redact it at the boundary.
//   3. Status is returned, not logged-and-forgotten. Callers decide
//      what to do when a post fails.
//
// See CLAUDE.md §5.3 (alert layer, tiered urgency) and §5A.3
// (audit trail — every action recorded).

import type { AlertPriority } from "./types";

export type SlackChannelName = AlertPriority;

export interface SlackPostOutcome {
  sent: boolean;
  reason?: string;
}

/**
 * Pattern for secrets we redact before outbound transmission.
 * Covers three common leak shapes:
 *   - OpenAI-style API keys: `sk-...`
 *   - Bearer tokens: `Bearer <token>`
 *   - Env-style assignments: `FOO_SECRET=...`, `API_KEY=...`, etc.
 */
const SECRET_PATTERN =
  /sk-[A-Za-z0-9_-]{20,}|Bearer [A-Za-z0-9_.-]+|[A-Z_]*(SECRET|TOKEN|KEY|PASSWORD)[A-Z_]*=\S+/g;

/**
 * Redact any substring that looks like a secret. Idempotent: repeated
 * application does not alter the output further.
 */
export function scrubSecrets(message: string): string {
  return message.replace(SECRET_PATTERN, "[REDACTED]");
}

/**
 * Which Slack webhook URL env var should this channel use? The three
 * tiers may eventually map to distinct webhooks (different Slack
 * channels). For now they all funnel through SLACK_WEBHOOK_URL and
 * rely on channel prefix in the message for differentiation — but the
 * dispatch table is here so we can split them without touching callers.
 */
const CHANNEL_ENV_VARS: Record<SlackChannelName, readonly string[]> = {
  critical: ["SLACK_WEBHOOK_CRITICAL", "SLACK_WEBHOOK_URL"],
  daily: ["SLACK_WEBHOOK_DAILY", "SLACK_WEBHOOK_URL"],
  weekly: ["SLACK_WEBHOOK_WEEKLY", "SLACK_WEBHOOK_URL"],
};

function resolveWebhookUrl(channel: SlackChannelName): string | undefined {
  for (const envVar of CHANNEL_ENV_VARS[channel]) {
    const value = process.env[envVar];
    if (value !== undefined && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

/**
 * Post a plain-text message to the configured Slack webhook for the
 * given channel. Never throws. Always resolves with a status object.
 *
 * @param channel  Tier: "critical" | "daily" | "weekly"
 * @param message  Human-readable text. Will be secret-scrubbed before
 *                 transmission.
 */
export async function postToSlack(
  channel: SlackChannelName,
  message: string,
): Promise<SlackPostOutcome> {
  const webhookUrl = resolveWebhookUrl(channel);
  if (webhookUrl === undefined) {
    return { sent: false, reason: "no webhook configured" };
  }

  const scrubbed = scrubSecrets(message);
  const prefix = `*[${channel.toUpperCase()}]*`;
  const text = `${prefix} ${scrubbed}`;

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (response.ok) {
      return { sent: true };
    }
    return { sent: false, reason: `http ${response.status}` };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "network error";
    return { sent: false, reason };
  }
}
