// ── Alerts Types ────────────────────────────────────────────────────
// Zod-first schemas for the Sentinel alerting layer. Types are derived
// from the Zod enums so the compiler and the runtime share one source
// of truth. See CLAUDE.md §6.3 (component schemas) and the equivalent
// pattern in collectors/types.ts.

import { z } from "zod";

export const AlertPrioritySchema = z.enum(["critical", "daily", "weekly"]);
export type AlertPriority = z.infer<typeof AlertPrioritySchema>;

/**
 * Runtime type guard for AlertPriority. Useful when narrowing a raw
 * string (CLI arg, env var, queued job) without throwing.
 */
export function isAlertPriority(value: unknown): value is AlertPriority {
  return AlertPrioritySchema.safeParse(value).success;
}

export const AlertMessageSchema = z.object({
  priority: AlertPrioritySchema,
  title: z.string(),
  body: z.string(),
  url: z.string().optional(),
  timestamp: z.string(),
});
export type AlertMessage = z.infer<typeof AlertMessageSchema>;

// ── Discord embed colors, keyed exhaustively on priority ─────────────
// Record<AlertPriority, number> forces the compiler to flag this map
// if a new priority is added to AlertPrioritySchema without updating it.
const DISCORD_EMBED_COLOR: Record<AlertPriority, number> = {
  critical: 0xff0000,
  daily: 0xffaa00,
  weekly: 0x0099ff,
};

// ── Slack ────────────────────────────────────────────────────────────

export async function sendSlackAlert(message: AlertMessage): Promise<void> {
  const webhookUrl = process.env["SLACK_WEBHOOK_URL"];
  if (!webhookUrl) {
    console.info(`[sentinel:slack] No webhook configured. Alert: ${message.title}`);
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `*[${message.priority.toUpperCase()}]* ${message.title}`,
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: `*${message.title}*\n${message.body}` },
          },
          ...(message.url
            ? [{ type: "section", text: { type: "mrkdwn", text: `<${message.url}|View details>` } }]
            : []),
        ],
      }),
    });
  } catch (err) {
    console.error(`[sentinel:slack] Failed to send alert:`, err);
  }
}

// ── Discord ──────────────────────────────────────────────────────────

export async function sendDiscordAlert(message: AlertMessage): Promise<void> {
  const webhookUrl = process.env["DISCORD_WEBHOOK_URL"];
  if (!webhookUrl) {
    console.info(`[sentinel:discord] No webhook configured. Alert: ${message.title}`);
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `**[${message.priority.toUpperCase()}]** ${message.title}`,
        embeds: [
          {
            title: message.title,
            description: message.body,
            url: message.url,
            timestamp: message.timestamp,
            color: DISCORD_EMBED_COLOR[message.priority],
          },
        ],
      }),
    });
  } catch (err) {
    console.error(`[sentinel:discord] Failed to send alert:`, err);
  }
}
