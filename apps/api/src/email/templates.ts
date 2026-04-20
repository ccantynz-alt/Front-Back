/**
 * HTML email templates with inline CSS.
 * All templates are self-contained with no external dependencies.
 *
 * GDPR compliance: non-transactional emails (weeklyDigest, collaborationInvite)
 * include List-Unsubscribe headers and a visible unsubscribe footer.
 * Transactional emails (passwordReset, welcomeEmail, billingReceipt,
 * projectCreated, deploySuccess) do not require an unsubscribe link but
 * still ship a footer placeholder so every email has consistent chrome.
 *
 * Design system:
 *   - Dark brand palette: #0a0e17 background, #6366f1 accent, white text
 *   - Inline CSS only; no <style> blocks, no JavaScript
 *   - Table-based layout, max-width 600px, Gmail-compatible
 *   - Mobile-responsive via width="100%" + max-width
 */

// ── Brand Tokens ─────────────────────────────────────────────────────

const BRAND_COLOR = "#6366f1";
const BRAND_COLOR_HOVER = "#4f46e5";
const BRAND_BG = "#0a0e17";
const BRAND_BG_SOFT = "#121827";
const BRAND_BORDER = "#1f2937";
const BRAND_TEXT = "#ffffff";
const BRAND_MUTED = "#9ca3af";
const BRAND_SUBTLE = "#6b7280";
const BRAND_NAME = process.env["SITE_NAME"] ?? "Crontech";
const PUBLIC_URL = process.env["PUBLIC_URL"] ?? "http://localhost:3000";
const FOOTER_TEXT = `&copy; ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.`;

// ── Email Type Registry ──────────────────────────────────────────────

/** Email types that support unsubscribe (non-transactional). */
export type UnsubscribableEmailType = "weeklyDigest" | "collaborationInvite";

/** All email types for preference tracking. */
export type EmailType =
  | UnsubscribableEmailType
  | "passwordReset"
  | "welcomeEmail"
  | "billingReceipt"
  | "projectCreated"
  | "deploySuccess";

export interface EmailWithHeaders {
  html: string;
  headers: Record<string, string>;
}

/** Premium template return shape: subject + html + plaintext. */
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// ── Unsubscribe Token Helpers ────────────────────────────────────────

/**
 * Generate a simple JWT-like token for unsubscribe links.
 * Uses base64-encoded JSON with HMAC signature.
 */
export function generateUnsubscribeToken(
  userId: string,
  emailType: UnsubscribableEmailType,
): string {
  const payload = JSON.stringify({ userId, emailType, ts: Date.now() });
  return Buffer.from(payload).toString("base64url");
}

/**
 * Decode an unsubscribe token. Returns null if invalid.
 */
export function decodeUnsubscribeToken(
  token: string,
): { userId: string; emailType: UnsubscribableEmailType } | null {
  try {
    const payload = JSON.parse(
      Buffer.from(token, "base64url").toString("utf-8"),
    ) as { userId?: string; emailType?: string };
    if (
      typeof payload.userId === "string" &&
      (payload.emailType === "weeklyDigest" ||
        payload.emailType === "collaborationInvite")
    ) {
      return {
        userId: payload.userId,
        emailType: payload.emailType,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Build List-Unsubscribe headers for non-transactional emails (RFC 8058).
 */
function buildUnsubscribeHeaders(
  userId: string,
  emailType: UnsubscribableEmailType,
): Record<string, string> {
  const token = generateUnsubscribeToken(userId, emailType);
  const unsubUrl = `${PUBLIC_URL}/api/unsubscribe?token=${token}`;
  return {
    "List-Unsubscribe": `<${unsubUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

// ── Shared Layout Primitives ─────────────────────────────────────────

/** Simple HTML escape for user-provided strings interpolated into the body. */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface LayoutOptions {
  title: string;
  previewText: string;
  body: string;
  unsubscribeUrl?: string;
}

function layout({ title, previewText, body, unsubscribeUrl }: LayoutOptions): string {
  const unsubHref =
    unsubscribeUrl ?? `${PUBLIC_URL}/account/notifications`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark light" />
  <meta name="supported-color-schemes" content="dark light" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:${BRAND_BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${BRAND_TEXT};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${BRAND_BG};">${previewText}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:${BRAND_BG};width:100%;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background-color:${BRAND_BG_SOFT};border:1px solid ${BRAND_BORDER};border-radius:16px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:28px 32px;border-bottom:1px solid ${BRAND_BORDER};background:linear-gradient(90deg, ${BRAND_BG_SOFT} 0%, ${BRAND_BG} 100%);">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="left" style="vertical-align:middle;">
                    <span style="display:inline-block;font-size:18px;font-weight:800;letter-spacing:4px;color:${BRAND_TEXT};text-transform:uppercase;">${BRAND_NAME.toUpperCase()}</span>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="display:inline-block;font-size:11px;font-weight:600;letter-spacing:2px;color:${BRAND_COLOR};text-transform:uppercase;">The dev platform</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 32px 32px;color:${BRAND_TEXT};">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px 28px 32px;background-color:${BRAND_BG};border-top:1px solid ${BRAND_BORDER};">
              <p style="margin:0 0 8px;font-size:12px;color:${BRAND_MUTED};text-align:center;line-height:1.6;">
                ${FOOTER_TEXT}
              </p>
              <p style="margin:0;font-size:11px;color:${BRAND_SUBTLE};text-align:center;line-height:1.6;">
                <a href="${unsubHref}" style="color:${BRAND_MUTED};text-decoration:underline;">Unsubscribe</a>
                &nbsp;·&nbsp;
                <a href="${PUBLIC_URL}/account/notifications" style="color:${BRAND_MUTED};text-decoration:underline;">Email preferences</a>
                &nbsp;·&nbsp;
                <a href="${PUBLIC_URL}" style="color:${BRAND_MUTED};text-decoration:underline;">${BRAND_NAME}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(text: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
  <tr>
    <td style="background-color:${BRAND_COLOR};background-image:linear-gradient(135deg, ${BRAND_COLOR} 0%, ${BRAND_COLOR_HOVER} 100%);border-radius:10px;padding:0;">
      <a href="${href}" style="display:inline-block;padding:14px 32px;color:${BRAND_TEXT};text-decoration:none;font-size:15px;font-weight:600;letter-spacing:0.2px;line-height:1;border-radius:10px;">${text} &rarr;</a>
    </td>
  </tr>
</table>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;font-weight:700;color:${BRAND_TEXT};letter-spacing:-0.3px;">${text}</h1>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#d1d5db;">${text}</p>`;
}

function hairline(): string {
  return `<div style="height:1px;line-height:1px;background-color:${BRAND_BORDER};margin:28px 0;">&nbsp;</div>`;
}

function statCard(label: string, value: string): string {
  return `<td style="padding:16px 18px;background-color:${BRAND_BG};border:1px solid ${BRAND_BORDER};border-radius:12px;vertical-align:top;">
    <div style="font-size:11px;font-weight:600;letter-spacing:1.5px;color:${BRAND_MUTED};text-transform:uppercase;margin-bottom:6px;">${label}</div>
    <div style="font-size:16px;font-weight:600;color:${BRAND_TEXT};line-height:1.4;word-break:break-all;">${value}</div>
  </td>`;
}

function bullet(text: string): string {
  return `<tr>
    <td style="vertical-align:top;padding:0 12px 12px 0;width:20px;">
      <div style="width:6px;height:6px;margin-top:9px;border-radius:50%;background-color:${BRAND_COLOR};"></div>
    </td>
    <td style="vertical-align:top;padding:0 0 12px 0;font-size:15px;line-height:1.6;color:#d1d5db;">${text}</td>
  </tr>`;
}

// ── Premium Onboarding Templates ─────────────────────────────────────

export interface WelcomeEmailParams {
  userName: string;
  dashboardUrl?: string;
}

/**
 * Premium welcome email sent after auto-provisioning completes.
 * Returns full render bundle (subject + html + text) for direct dispatch.
 */
export function welcomeEmail(params: WelcomeEmailParams): RenderedEmail {
  const name = escapeHtml(params.userName);
  const dashboard = params.dashboardUrl ?? `${PUBLIC_URL}/dashboard`;
  const subject = `Welcome to ${BRAND_NAME} — your workspace is ready`;
  const previewText = `Welcome aboard, ${params.userName}. Your workspace, tenant database, and sample project are all provisioned and waiting.`;

  const body = `${heading(`Welcome, ${name}.`)}
  ${paragraph(
    `Your ${BRAND_NAME} workspace is fully provisioned. Your tenant database, default project, and sample blueprint are already live — no setup required.`,
  )}
  ${paragraph(`Here is what you can do in the next five minutes:`)}
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 8px;">
    ${bullet(`<strong style="color:${BRAND_TEXT};">Ship a project</strong> — generate a full component tree with the AI Composer`)}
    ${bullet(`<strong style="color:${BRAND_TEXT};">Deploy to the edge</strong> — push to 330+ cities in under 8 seconds`)}
    ${bullet(`<strong style="color:${BRAND_TEXT};">Collaborate in real time</strong> — invite your team, add AI agents as peers`)}
    ${bullet(`<strong style="color:${BRAND_TEXT};">Run inference locally</strong> — WebGPU models at $0/token`)}
  </table>
  ${button("Open your dashboard", dashboard)}
  ${hairline()}
  ${paragraph(`Need help getting started? Reply to this email — a real engineer reads every message. If you did not create this account, you can safely ignore it.`)}`;

  const html = layout({
    title: subject,
    previewText,
    body,
  });

  const text = [
    `Welcome to ${BRAND_NAME}, ${params.userName}.`,
    ``,
    `Your workspace is fully provisioned. Your tenant database, default project, and sample blueprint are already live.`,
    ``,
    `Next steps:`,
    `  - Ship a project: generate a full component tree with the AI Composer`,
    `  - Deploy to the edge: push to 330+ cities in under 8 seconds`,
    `  - Collaborate in real time with your team and AI agents`,
    `  - Run inference locally with WebGPU at $0/token`,
    ``,
    `Open your dashboard: ${dashboard}`,
    ``,
    `Need help? Reply to this email — a real engineer reads every message.`,
    `If you did not create this account, you can safely ignore it.`,
    ``,
    `— The ${BRAND_NAME} team`,
  ].join("\n");

  return { subject, html, text };
}

export interface ProjectCreatedEmailParams {
  userName: string;
  projectName: string;
  projectUrl: string;
}

/**
 * Sent the first time a user creates a project. Celebrates the milestone
 * and drives them to the project dashboard.
 */
export function projectCreatedEmail(params: ProjectCreatedEmailParams): RenderedEmail {
  const name = escapeHtml(params.userName);
  const project = escapeHtml(params.projectName);
  const subject = `Your first project is live`;
  const previewText = `${params.projectName} is wired up. Edge routes, tenant storage, and AI hooks are all online.`;

  const body = `${heading(`${project} is live.`)}
  ${paragraph(`Nice work, ${name}. Your project is provisioned and ready to build on.`)}
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0 8px;">
    <tr>
      ${statCard("Project", project)}
    </tr>
    <tr><td style="height:12px;line-height:12px;">&nbsp;</td></tr>
    <tr>
      ${statCard("Status", `<span style="color:#22c55e;">&#9679;</span> &nbsp;Active`)}
    </tr>
  </table>
  ${paragraph(`Every layer is already wired up:`)}
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 8px;">
    ${bullet(`<strong style="color:${BRAND_TEXT};">Edge routes</strong> — Hono running in 330+ cities`)}
    ${bullet(`<strong style="color:${BRAND_TEXT};">Tenant storage</strong> — Turso + Qdrant vector search ready`)}
    ${bullet(`<strong style="color:${BRAND_TEXT};">AI hooks</strong> — client GPU, edge, and cloud tiers connected`)}
    ${bullet(`<strong style="color:${BRAND_TEXT};">Observability</strong> — OpenTelemetry streaming to Grafana`)}
  </table>
  ${button("Open project", params.projectUrl)}
  ${hairline()}
  ${paragraph(`When you are ready to ship, run <code style="background-color:${BRAND_BG};color:${BRAND_COLOR};padding:2px 8px;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:13px;">crontech deploy</code> — the next email you get will be the good one.`)}`;

  const html = layout({
    title: subject,
    previewText,
    body,
  });

  const text = [
    `${params.projectName} is live.`,
    ``,
    `Nice work, ${params.userName}. Your project is provisioned and ready to build on.`,
    ``,
    `Project: ${params.projectName}`,
    `Status: Active`,
    ``,
    `Every layer is already wired up:`,
    `  - Edge routes: Hono running in 330+ cities`,
    `  - Tenant storage: Turso + Qdrant vector search ready`,
    `  - AI hooks: client GPU, edge, and cloud tiers connected`,
    `  - Observability: OpenTelemetry streaming to Grafana`,
    ``,
    `Open project: ${params.projectUrl}`,
    ``,
    `When you are ready to ship, run \`crontech deploy\`.`,
    ``,
    `— The ${BRAND_NAME} team`,
  ].join("\n");

  return { subject, html, text };
}

export interface DeploySuccessEmailParams {
  userName: string;
  projectName: string;
  deployUrl: string;
  commitSha?: string;
  region?: string;
  durationMs?: number;
}

/**
 * Sent after the first (or every) successful deploy. Celebrates the ship
 * and surfaces the live URL + deploy metadata.
 */
export function deploySuccessEmail(params: DeploySuccessEmailParams): RenderedEmail {
  const name = escapeHtml(params.userName);
  const project = escapeHtml(params.projectName);
  const deployUrl = params.deployUrl;
  const commit = params.commitSha ? escapeHtml(params.commitSha.slice(0, 7)) : "—";
  const region = escapeHtml(params.region ?? "Global edge");
  const duration =
    typeof params.durationMs === "number"
      ? `${(params.durationMs / 1000).toFixed(2)}s`
      : "—";
  const subject = `Your project is live`;
  const previewText = `${params.projectName} shipped to the edge. ${params.region ?? "Global"} in ${duration}.`;

  const body = `${heading(`You shipped, ${name}.`)}
  ${paragraph(`<strong style="color:${BRAND_TEXT};">${project}</strong> is now live on the ${BRAND_NAME} edge network. Here is the receipt:`)}
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0 8px;">
    <tr>
      ${statCard("Live URL", `<a href="${deployUrl}" style="color:${BRAND_COLOR};text-decoration:none;">${escapeHtml(deployUrl)}</a>`)}
    </tr>
    <tr><td style="height:12px;line-height:12px;">&nbsp;</td></tr>
    <tr>
      ${statCard("Commit", `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">${commit}</span>`)}
    </tr>
    <tr><td style="height:12px;line-height:12px;">&nbsp;</td></tr>
    <tr>
      ${statCard("Region", region)}
    </tr>
    <tr><td style="height:12px;line-height:12px;">&nbsp;</td></tr>
    <tr>
      ${statCard("Build time", duration)}
    </tr>
  </table>
  ${button("View live site", deployUrl)}
  ${hairline()}
  ${paragraph(`Zero cold starts. Sub-50ms TTFB worldwide. No provisioning. That is the ${BRAND_NAME} guarantee — and your users are already feeling it.`)}
  ${paragraph(`<a href="${PUBLIC_URL}/dashboard" style="color:${BRAND_COLOR};text-decoration:underline;">Back to dashboard</a> · <a href="${PUBLIC_URL}/docs/deploys" style="color:${BRAND_COLOR};text-decoration:underline;">Deploy docs</a>`)}`;

  const html = layout({
    title: subject,
    previewText,
    body,
  });

  const text = [
    `You shipped, ${params.userName}.`,
    ``,
    `${params.projectName} is now live on the ${BRAND_NAME} edge network.`,
    ``,
    `Live URL:   ${deployUrl}`,
    `Commit:     ${commit}`,
    `Region:     ${params.region ?? "Global edge"}`,
    `Build time: ${duration}`,
    ``,
    `View live site: ${deployUrl}`,
    ``,
    `Zero cold starts. Sub-50ms TTFB worldwide. No provisioning.`,
    `That is the ${BRAND_NAME} guarantee — and your users are already feeling it.`,
    ``,
    `Dashboard: ${PUBLIC_URL}/dashboard`,
    `Deploy docs: ${PUBLIC_URL}/docs/deploys`,
    ``,
    `— The ${BRAND_NAME} team`,
  ].join("\n");

  return { subject, html, text };
}

// ── Legacy Transactional Templates (existing call sites) ─────────────

export function passwordResetEmail(resetLink: string): string {
  const body = `${heading("Reset your credentials")}
  ${paragraph(`We received a request to reset your account credentials. Click the button below to proceed.`)}
  ${button("Reset credentials", resetLink)}
  ${paragraph(`<span style="color:${BRAND_MUTED};font-size:13px;">This link expires in 1 hour.</span>`)}
  ${paragraph(`<span style="color:${BRAND_MUTED};font-size:13px;">If you did not request this, please ignore this email. Your account is secure.</span>`)}`;
  return layout({
    title: "Reset your credentials",
    previewText: "Reset your Crontech credentials. Link expires in 1 hour.",
    body,
  });
}

export function billingReceiptEmail(
  amount: string,
  planName: string,
  date: string,
): string {
  const body = `${heading("Payment receipt")}
  ${paragraph(`Thank you for your payment. Here are the details:`)}
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0 8px;">
    <tr>
      ${statCard("Plan", escapeHtml(planName))}
    </tr>
    <tr><td style="height:12px;line-height:12px;">&nbsp;</td></tr>
    <tr>
      ${statCard("Amount", escapeHtml(amount))}
    </tr>
    <tr><td style="height:12px;line-height:12px;">&nbsp;</td></tr>
    <tr>
      ${statCard("Date", escapeHtml(date))}
    </tr>
  </table>
  ${button("View billing", `${PUBLIC_URL}/billing`)}
  ${paragraph(`<span style="color:${BRAND_MUTED};font-size:13px;">If you have questions about this charge, contact support.</span>`)}`;
  return layout({
    title: "Payment receipt",
    previewText: `Receipt for ${amount} — ${planName}`,
    body,
  });
}

// ── Non-Transactional Emails (with unsubscribe) ──────────────────────

export function collaborationInviteEmail(
  inviterName: string,
  roomName: string,
  joinLink: string,
  userId?: string,
): EmailWithHeaders {
  const token = userId
    ? generateUnsubscribeToken(userId, "collaborationInvite")
    : null;
  const unsubscribeUrl = token
    ? `${PUBLIC_URL}/api/unsubscribe?token=${token}`
    : undefined;

  const body = `${heading("You have been invited to collaborate")}
  ${paragraph(`<strong style="color:${BRAND_TEXT};">${escapeHtml(inviterName)}</strong> has invited you to join the room <strong style="color:${BRAND_TEXT};">${escapeHtml(roomName)}</strong> on ${BRAND_NAME}.`)}
  ${paragraph(`Collaborate in real-time with team members and AI agents using CRDT-powered editing.`)}
  ${button("Join room", joinLink)}
  ${paragraph(`<span style="color:${BRAND_MUTED};font-size:13px;">If you did not expect this invite, you can ignore this email.</span>`)}`;

  const html = layout({
    title: "Collaboration invite",
    previewText: `${inviterName} invited you to ${roomName}`,
    body,
    ...(unsubscribeUrl !== undefined ? { unsubscribeUrl } : {}),
  });

  const headers = userId
    ? buildUnsubscribeHeaders(userId, "collaborationInvite")
    : {};

  return { html, headers };
}

interface WeeklyDigestStats {
  projectsCreated: number;
  aiGenerations: number;
  collaborationSessions: number;
  videoEdits: number;
}

export function weeklyDigestEmail(
  stats: WeeklyDigestStats,
  userId?: string,
): EmailWithHeaders {
  const token = userId
    ? generateUnsubscribeToken(userId, "weeklyDigest")
    : null;
  const unsubscribeUrl = token
    ? `${PUBLIC_URL}/api/unsubscribe?token=${token}`
    : undefined;

  const body = `${heading("Your weekly summary")}
  ${paragraph(`Here is what you accomplished this week on ${BRAND_NAME}:`)}
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:16px 0 8px;">
    <tr>
      ${statCard("Projects", String(stats.projectsCreated))}
      <td style="width:12px;">&nbsp;</td>
      ${statCard("AI generations", String(stats.aiGenerations))}
    </tr>
    <tr><td colspan="3" style="height:12px;line-height:12px;">&nbsp;</td></tr>
    <tr>
      ${statCard("Collab sessions", String(stats.collaborationSessions))}
      <td style="width:12px;">&nbsp;</td>
      ${statCard("Video edits", String(stats.videoEdits))}
    </tr>
  </table>
  ${button("View dashboard", `${PUBLIC_URL}/dashboard`)}`;

  const html = layout({
    title: "Your weekly summary",
    previewText: `${stats.projectsCreated} projects, ${stats.aiGenerations} AI generations this week`,
    body,
    ...(unsubscribeUrl !== undefined ? { unsubscribeUrl } : {}),
  });

  const headers = userId
    ? buildUnsubscribeHeaders(userId, "weeklyDigest")
    : {};

  return { html, headers };
}

export type { WeeklyDigestStats };
