/**
 * Renders the body of the preview-deploy PR comment.
 *
 * Always begins with the hidden COMMENT_MARKER so the comment can be located
 * idempotently on subsequent sync events.
 */

import type { PreviewState } from "../types";
import { COMMENT_MARKER } from "./comments";

const STATUS_BADGE: Record<PreviewState["status"], string> = {
  pending: "⏳ Pending",
  building: "🔨 Building",
  deploying: "🚀 Deploying",
  live: "✅ Live",
  failed: "❌ Failed",
  "torn-down": "🪦 Torn down",
};

export function renderCommentBody(state: PreviewState): string {
  const badge = STATUS_BADGE[state.status];
  const url = `https://${state.hostname}`;
  const lines: string[] = [];
  lines.push(COMMENT_MARKER);
  lines.push("**Crontech Preview Deploy**");
  lines.push("");
  lines.push(`| Status | ${badge} |`);
  lines.push("| --- | --- |");
  lines.push(`| URL | ${state.status === "live" ? `[${url}](${url})` : url} |`);
  lines.push(`| Commit | \`${state.lastSha.slice(0, 7)}\` |`);
  lines.push(
    `| Updated | <code>${new Date(state.updatedAt).toISOString()}</code> |`,
  );
  if (state.status === "failed" && state.errorMessage) {
    lines.push("");
    lines.push("> **Build failed**");
    lines.push("> ```");
    lines.push(`> ${state.errorMessage.replace(/```/g, "''")}`);
    lines.push("> ```");
  }
  if (state.status === "torn-down") {
    lines.push("");
    lines.push("Preview environment was torn down when the PR was closed.");
  }
  return lines.join("\n");
}
