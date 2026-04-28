/**
 * Gluecron platform self-deploy webhook.
 *
 *   POST /api/hooks/gluecron/platform
 *      (the route is declared as "/hooks/gluecron/platform" because the
 *       parent api uses `new Hono().basePath("/api")` — the basePath is
 *       prepended automatically when the sub-app is mounted with
 *       `app.route("/", gluecronPlatformDeployApp)`. Declaring "/api/..."
 *       here would double the prefix to "/api/api/..." and 500 on hit.)
 *
 *   Authorization: Bearer ${GLUECRON_WEBHOOK_SECRET}
 *   Content-Type:  application/json
 *
 *   { repository, sha, branch, ref, source: "gluecron", timestamp? }
 *
 *   → 200 { ok: true, triggered: true, branch, sha }
 *   → 200 { ok: true, ignored: true, reason } when not Crontech-on-Main
 *   → 401 invalid bearer token
 *   → 400 malformed payload
 *   → 503 GLUECRON_WEBHOOK_SECRET or DEPLOY_AGENT_SECRET not configured
 *
 * Mirror of `platform-auto-deploy.ts` (which handles GitHub pushes via HMAC).
 * This endpoint is the Gluecron-source equivalent — the integration that
 * lets `git push gluecron Main` trigger a Vultr deploy with no GitHub or
 * GitHub Actions in the loop. Closes BLK-016.
 *
 * Sibling files:
 *   - apps/api/src/deploy/platform-auto-deploy.ts — GitHub-source twin
 *   - apps/api/src/webhooks/gluecron-push.ts      — tenant repo hook (single-app)
 */

import { Hono } from "hono";
import { z } from "zod";
import { log } from "../log";
import { timingSafeEqual } from "./gluecron-push";

const PLATFORM_REPO = "ccantynz-alt/Crontech";
const PLATFORM_BRANCH_ALLOWLIST = new Set(["Main", "main"]);

const PushPayloadSchema = z.object({
  repository: z
    .string()
    .min(3)
    .regex(/^[^\s/]+\/[^\s/]+$/, "repository must be in `owner/name` form"),
  sha: z.string().regex(/^[0-9a-f]{40}$/i, "sha must be 40 hex chars"),
  branch: z.string().min(1),
  ref: z.string().min(1),
  source: z.literal("gluecron"),
  timestamp: z.string().optional(),
});

export type PlatformDeployPayload = z.infer<typeof PushPayloadSchema>;

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? (match[1]?.trim() ?? null) : null;
}

export interface GluecronPlatformDeployDeps {
  /** Override the webhook auth secret (defaults to env). */
  getWebhookSecret?: () => string | undefined;
  /** Override the deploy-agent auth secret (defaults to env). */
  getAgentSecret?: () => string | undefined;
  /** Override the deploy-agent base URL (defaults to localhost:9091). */
  getAgentUrl?: () => string;
  /**
   * Background trigger. Returns immediately; the actual deploy runs detached
   * so we can ack Gluecron without holding the connection open for ~minutes.
   * Tests inject a sync mock that records calls without spawning real work.
   */
  triggerDeploy?: (input: {
    agentUrl: string;
    agentSecret: string;
    sha: string;
  }) => void;
}

function defaultTriggerDeploy(input: {
  agentUrl: string;
  agentSecret: string;
  sha: string;
}): void {
  void (async () => {
    try {
      const res = await fetch(`${input.agentUrl}/deploy`, {
        method: "POST",
        headers: { Authorization: `Bearer ${input.agentSecret}` },
        signal: AbortSignal.timeout(600_000),
      });
      // Drain the SSE stream so the connection doesn't hang and the
      // agent's mutex clears cleanly when it finishes.
      if (res.body) {
        const reader = res.body.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
      log.info(
        `[gluecron-platform-deploy] deploy finished sha=${input.sha.slice(0, 7)} status=${res.status}`,
      );
    } catch (err) {
      console.error(
        "[gluecron-platform-deploy] deploy error:",
        err instanceof Error ? err.message : err,
      );
    }
  })();
}

export function createGluecronPlatformDeployApp(deps: GluecronPlatformDeployDeps = {}): Hono {
  const getWebhookSecret = deps.getWebhookSecret ?? (() => process.env.GLUECRON_WEBHOOK_SECRET);
  const getAgentSecret = deps.getAgentSecret ?? (() => process.env.DEPLOY_AGENT_SECRET);
  const getAgentUrl =
    deps.getAgentUrl ?? (() => `http://127.0.0.1:${process.env.DEPLOY_AGENT_PORT ?? 9091}`);
  const triggerDeploy = deps.triggerDeploy ?? defaultTriggerDeploy;

  const app = new Hono();

  app.post("/hooks/gluecron/platform", async (c) => {
    // ── 1. Auth: bearer token ─────────────────────────────────────
    const secret = getWebhookSecret();
    const provided = extractBearer(c.req.header("Authorization"));
    if (!secret) {
      return c.json({ ok: false, error: "GLUECRON_WEBHOOK_SECRET not configured" }, 503);
    }
    if (!provided || !timingSafeEqual(provided, secret)) {
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }

    // ── 2. Payload validation ─────────────────────────────────────
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "invalid JSON body" }, 400);
    }
    const parsed = PushPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: "invalid payload",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        400,
      );
    }
    const payload = parsed.data;

    // ── 3. Filter to platform repo + allowlisted branch ───────────
    if (payload.repository !== PLATFORM_REPO) {
      return c.json({
        ok: true,
        ignored: true,
        reason: "wrong_repo",
        repository: payload.repository,
      });
    }
    if (!PLATFORM_BRANCH_ALLOWLIST.has(payload.branch)) {
      return c.json({
        ok: true,
        ignored: true,
        reason: "wrong_branch",
        branch: payload.branch,
      });
    }

    // ── 4. Trigger the deploy-agent ───────────────────────────────
    const agentSecret = getAgentSecret();
    if (!agentSecret) {
      return c.json({ ok: false, error: "DEPLOY_AGENT_SECRET not configured" }, 503);
    }
    const agentUrl = getAgentUrl();
    triggerDeploy({ agentUrl, agentSecret, sha: payload.sha });

    log.info(
      `[gluecron-platform-deploy] triggered branch=${payload.branch} sha=${payload.sha.slice(0, 7)}`,
    );
    return c.json({
      ok: true,
      triggered: true,
      branch: payload.branch,
      sha: payload.sha,
    });
  });

  return app;
}

/** Default-wired app for mounting on the main Hono tree. */
export const gluecronPlatformDeployApp = createGluecronPlatformDeployApp();
