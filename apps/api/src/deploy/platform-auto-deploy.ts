/**
 * Platform auto-deploy webhook.
 *
 * POST /api/hooks/github/platform
 *
 * GitHub sends this on every push. We verify the HMAC, check it is a push
 * to refs/heads/Main of ccantynz-alt/Crontech, then trigger the deploy agent
 * in the background and ack GitHub immediately.
 *
 * Env vars required:
 *   GITHUB_WEBHOOK_SECRET    – shared secret set when registering the webhook
 *   DEPLOY_AGENT_SECRET      – internal auth for the deploy agent
 *   DEPLOY_AGENT_PORT        – optional, defaults to 9091
 */

import { Hono } from "hono";
import { verifyGithubSignature } from "../github/webhook";
import { log } from "../log";

const AGENT_URL = `http://127.0.0.1:${process.env["DEPLOY_AGENT_PORT"] ?? 9091}`;
const AGENT_SECRET = process.env["DEPLOY_AGENT_SECRET"] ?? "";
const WEBHOOK_SECRET = process.env["GITHUB_WEBHOOK_SECRET"] ?? "";
const PLATFORM_REPO = "ccantynz-alt/Crontech";
const PLATFORM_BRANCH = "Main";

interface PushPayloadMinimal {
  ref?: string;
  deleted?: boolean;
  repository?: { full_name?: string };
}

export const platformAutoDeployApp = new Hono();

platformAutoDeployApp.post("/api/hooks/github/platform", async (c) => {
  let rawBody: string;
  try {
    rawBody = await c.req.text();
  } catch {
    return c.json({ ok: false, error: "invalid body" }, 400);
  }

  if (!WEBHOOK_SECRET) {
    return c.json({ ok: false, error: "GITHUB_WEBHOOK_SECRET not configured" }, 503);
  }

  const sigHeader =
    c.req.header("x-hub-signature-256") ??
    c.req.header("X-Hub-Signature-256") ??
    null;
  const verified = await verifyGithubSignature(WEBHOOK_SECRET, sigHeader, rawBody);
  if (!verified) {
    return c.json({ ok: false, error: "invalid signature" }, 401);
  }

  const event =
    c.req.header("x-github-event") ?? c.req.header("X-GitHub-Event") ?? "";
  if (event === "ping") {
    return c.json({ ok: true, event: "ping" });
  }
  if (event !== "push") {
    return c.json({ ok: true, event, ignored: true });
  }

  let payload: PushPayloadMinimal;
  try {
    payload = JSON.parse(rawBody) as PushPayloadMinimal;
  } catch {
    return c.json({ ok: false, error: "invalid JSON" }, 400);
  }

  if (payload.deleted === true) {
    return c.json({ ok: true, ignored: true, reason: "branch_deleted" });
  }
  if (payload.repository?.full_name !== PLATFORM_REPO) {
    return c.json({ ok: true, ignored: true, reason: "wrong_repo" });
  }
  if (payload.ref !== `refs/heads/${PLATFORM_BRANCH}`) {
    return c.json({ ok: true, ignored: true, reason: "wrong_branch", ref: payload.ref });
  }

  if (!AGENT_SECRET) {
    return c.json({ ok: false, error: "DEPLOY_AGENT_SECRET not configured" }, 503);
  }

  // Ack GitHub immediately — deploy runs in background
  void (async () => {
    try {
      const res = await fetch(`${AGENT_URL}/deploy`, {
        method: "POST",
        headers: { Authorization: `Bearer ${AGENT_SECRET}` },
        signal: AbortSignal.timeout(600_000),
      });
      // Drain SSE stream so connection doesn't hang
      if (res.body) {
        const reader = res.body.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
      log.info(`[platform-auto-deploy] deploy finished (${res.status})`);
    } catch (err) {
      console.error(
        "[platform-auto-deploy] deploy error:",
        err instanceof Error ? err.message : err,
      );
    }
  })();

  log.info(`[platform-auto-deploy] triggered by push to ${PLATFORM_BRANCH}`);
  return c.json({ ok: true, triggered: true, branch: PLATFORM_BRANCH });
});
