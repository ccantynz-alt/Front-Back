/**
 * HTML email templates with inline CSS.
 * All templates are self-contained with no external dependencies.
 */

const BRAND_COLOR = "#6366f1";
const BRAND_NAME = "Back to the Future";
const FOOTER_TEXT = `&copy; ${new Date().getFullYear()} ${BRAND_NAME}. All rights reserved.`;

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color:${BRAND_COLOR};padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${BRAND_NAME}</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">${FOOTER_TEXT}</p>
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
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background-color:${BRAND_COLOR};border-radius:8px;padding:12px 28px;">
      <a href="${href}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;display:inline-block;">${text}</a>
    </td>
  </tr>
</table>`;
}

export function welcomeEmail(userName: string): string {
  return layout(
    `Welcome to ${BRAND_NAME}`,
    `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">Welcome, ${userName}!</h2>
<p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
  Thanks for joining ${BRAND_NAME} — the most advanced AI-native full-stack platform.
</p>
<p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
  Here is what you can do right away:
</p>
<ul style="margin:0 0 12px;padding-left:20px;font-size:15px;color:#374151;line-height:1.8;">
  <li>Build websites with our AI Builder</li>
  <li>Edit video with WebGPU-accelerated tools</li>
  <li>Collaborate in real-time with your team and AI agents</li>
</ul>
${button("Get Started", "https://example.com/dashboard")}
<p style="margin:0;font-size:13px;color:#9ca3af;">If you did not create this account, you can ignore this email.</p>`,
  );
}

export function passwordResetEmail(resetLink: string): string {
  return layout(
    "Reset Your Credentials",
    `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">Reset Your Credentials</h2>
<p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
  We received a request to reset your account credentials. Click the button below to proceed.
</p>
${button("Reset Credentials", resetLink)}
<p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">This link expires in 1 hour.</p>
<p style="margin:0;font-size:13px;color:#9ca3af;">If you did not request this, please ignore this email. Your account is secure.</p>`,
  );
}

export function billingReceiptEmail(
  amount: string,
  planName: string,
  date: string,
): string {
  return layout(
    "Payment Receipt",
    `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">Payment Receipt</h2>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
  Thank you for your payment. Here are the details:
</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
  <tr>
    <td style="padding:12px 16px;background-color:#fafafa;font-size:14px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Plan</td>
    <td style="padding:12px 16px;background-color:#fafafa;font-size:14px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb;text-align:right;">${planName}</td>
  </tr>
  <tr>
    <td style="padding:12px 16px;font-size:14px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Amount</td>
    <td style="padding:12px 16px;font-size:14px;color:#111827;font-weight:600;border-bottom:1px solid #e5e7eb;text-align:right;">${amount}</td>
  </tr>
  <tr>
    <td style="padding:12px 16px;font-size:14px;color:#6b7280;">Date</td>
    <td style="padding:12px 16px;font-size:14px;color:#111827;font-weight:600;text-align:right;">${date}</td>
  </tr>
</table>
${button("View Billing", "https://example.com/billing")}
<p style="margin:0;font-size:13px;color:#9ca3af;">If you have questions about this charge, contact support.</p>`,
  );
}

export function collaborationInviteEmail(
  inviterName: string,
  roomName: string,
  joinLink: string,
): string {
  return layout(
    "Collaboration Invite",
    `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">You have been invited to collaborate</h2>
<p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
  <strong>${inviterName}</strong> has invited you to join the room <strong>${roomName}</strong> on ${BRAND_NAME}.
</p>
<p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.6;">
  Collaborate in real-time with team members and AI agents using CRDT-powered editing.
</p>
${button("Join Room", joinLink)}
<p style="margin:0;font-size:13px;color:#9ca3af;">If you did not expect this invite, you can ignore this email.</p>`,
  );
}

interface WeeklyDigestStats {
  projectsCreated: number;
  aiGenerations: number;
  collaborationSessions: number;
  videoEdits: number;
}

export function weeklyDigestEmail(stats: WeeklyDigestStats): string {
  return layout(
    "Your Weekly Summary",
    `<h2 style="margin:0 0 16px;font-size:22px;color:#111827;">Your Weekly Summary</h2>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
  Here is what you accomplished this week on ${BRAND_NAME}:
</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;">
  <tr>
    <td style="padding:16px;background-color:#f0f0ff;border-radius:8px;text-align:center;width:25%;">
      <div style="font-size:28px;font-weight:700;color:${BRAND_COLOR};">${stats.projectsCreated}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">Projects</div>
    </td>
    <td style="width:8px;"></td>
    <td style="padding:16px;background-color:#f0fdf4;border-radius:8px;text-align:center;width:25%;">
      <div style="font-size:28px;font-weight:700;color:#16a34a;">${stats.aiGenerations}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">AI Generations</div>
    </td>
    <td style="width:8px;"></td>
    <td style="padding:16px;background-color:#fffbeb;border-radius:8px;text-align:center;width:25%;">
      <div style="font-size:28px;font-weight:700;color:#ca8a04;">${stats.collaborationSessions}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">Collab Sessions</div>
    </td>
    <td style="width:8px;"></td>
    <td style="padding:16px;background-color:#fef2f2;border-radius:8px;text-align:center;width:25%;">
      <div style="font-size:28px;font-weight:700;color:#dc2626;">${stats.videoEdits}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">Video Edits</div>
    </td>
  </tr>
</table>
${button("View Dashboard", "https://example.com/dashboard")}
<p style="margin:0;font-size:13px;color:#9ca3af;">You are receiving this because you opted in to weekly digests. Unsubscribe in Settings.</p>`,
  );
}

export type { WeeklyDigestStats };
