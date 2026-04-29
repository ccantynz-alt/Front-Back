/**
 * HTTP API for the preview-deploys service.
 *
 * Routes:
 *   POST /pr-events            — receives GitHub PR webhook (HMAC validated).
 *   GET  /pr/:prId/status      — returns current preview state for the PR.
 *   POST /pr/:prId/teardown    — manual teardown (admin path).
 *   GET  /healthz              — liveness probe.
 *
 * The `prId` route param is URL-encoded `owner/repo#number`.
 *
 * Built on the platform's native `fetch`-style handler so it runs unchanged
 * on Bun, Cloudflare Workers, and Node 20+.
 */

import { verifySignature } from "./hmac";
import type { PreviewOrchestrator } from "./orchestrator";
import { parseGithubPrWebhook } from "./schemas";
import type { PullRequestEvent } from "./types";

export interface ServerConfig {
  readonly webhookSecret: string;
}

export interface ServerDeps {
  readonly orchestrator: PreviewOrchestrator;
  readonly config: ServerConfig;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export function createHandler(deps: ServerDeps): (req: Request) => Promise<Response> {
  const { orchestrator, config } = deps;

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "GET" && path === "/healthz") {
      return json(200, { ok: true });
    }

    if (req.method === "POST" && path === "/pr-events") {
      const raw = await req.text();
      const sig = req.headers.get("x-hub-signature-256");
      const ok = await verifySignature(config.webhookSecret, raw, sig);
      if (!ok) return json(401, { error: "invalid signature" });
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        return json(400, { error: "invalid JSON" });
      }
      const parsed = parseGithubPrWebhook(payload);
      if (!parsed.success) {
        return json(400, { error: "invalid payload", issues: parsed.issues });
      }
      const event: PullRequestEvent = {
        action: parsed.data.action,
        owner: parsed.data.repository.owner.login,
        repo: parsed.data.repository.name,
        number: parsed.data.number,
        headSha: parsed.data.pull_request.head.sha,
        headRef: parsed.data.pull_request.head.ref,
        baseRef: parsed.data.pull_request.base.ref,
        ...(parsed.data.pull_request.merged !== undefined
          ? { merged: parsed.data.pull_request.merged }
          : {}),
      };
      try {
        const state = await orchestrator.handlePrEvent(event);
        return json(202, { ok: true, state });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json(500, { error: "orchestrator failed", message });
      }
    }

    const statusMatch = path.match(/^\/pr\/(.+)\/status$/);
    if (req.method === "GET" && statusMatch) {
      const prIdRaw = statusMatch[1];
      if (prIdRaw === undefined) return json(400, { error: "missing prId" });
      const prId = decodeURIComponent(prIdRaw);
      const state = orchestrator.getState(prId);
      if (!state) return json(404, { error: "not found" });
      return json(200, { state });
    }

    const teardownMatch = path.match(/^\/pr\/(.+)\/teardown$/);
    if (req.method === "POST" && teardownMatch) {
      const prIdRaw = teardownMatch[1];
      if (prIdRaw === undefined) return json(400, { error: "missing prId" });
      const prId = decodeURIComponent(prIdRaw);
      const state = await orchestrator.manualTeardown(prId);
      if (!state) return json(404, { error: "not found" });
      return json(200, { state });
    }

    return json(404, { error: "not found" });
  };
}
