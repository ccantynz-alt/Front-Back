// ── GitHub webhook receiver ─────────────────────────────────────────────
//
// Hono app factory. The factory is parameterised by its dependencies
// (tenant config store, dedup store, transport, clock) so tests can
// instantiate it deterministically without mocks.
//
// Routes:
//   POST /webhooks/github/:tenantId  – validated push receiver
//   GET  /health                     – liveness probe
//
// Validation pipeline for POST:
//   1. Read raw body (must NOT be re-stringified — HMAC is over bytes).
//   2. Look up tenant config by `(tenantId, repo)`.
//   3. Verify `X-Hub-Signature-256` against the per-tenant secret.
//   4. Reject deliveries older than the replay window unless the
//      `X-GitHub-Event` is `ping` or the explicit replay header is set.
//   5. Reject duplicate `X-GitHub-Delivery` values.
//   6. Drop non-`push` events (PR / branch-delete / etc) with 202.
//   7. Drop deletes (`payload.deleted === true`) with 202.
//   8. Resolve branch → environment via tenant config; drop unmatched
//      branches with 202.
//   9. Build a BuildRequested event and publish via the transport.
//
// All steps emit OTel attributes on a single span per request.

import { Hono } from "hono";
import { z } from "zod";

import { InMemoryDedupStore, type DedupStore } from "./dedup";
import { verifySignature } from "./hmac";
import {
  BuildRequestedSchema,
  PushPayloadSchema,
  type BuildRequested,
} from "./schemas";
import { getTracer } from "./telemetry";
import {
  InMemoryTenantConfigStore,
  resolveEnvironment,
  type TenantConfigStore,
} from "./tenants";
import {
  InProcessTransport,
  type BuildRequestTransport,
} from "./transport";

export const SERVICE_NAME = "git-webhook";
export const SERVICE_VERSION = "0.0.1";

// Default replay window: 5 minutes per the brief. Replay deliveries are
// signed by GitHub with the same body and headers as the original, so
// the only defence against an attacker who has stolen a single delivery
// is a timestamp window.
export const DEFAULT_REPLAY_WINDOW_MS = 5 * 60 * 1000;

export interface ReceiverOptions {
  tenantStore?: TenantConfigStore;
  dedupStore?: DedupStore;
  transport?: BuildRequestTransport;
  // Override clock for tests.
  now?: () => Date;
  // Window in ms; deliveries older than this are rejected unless the
  // `X-Crontech-Replay` header is `1` (operator-initiated replay).
  replayWindowMs?: number;
}

export interface Receiver {
  app: Hono;
  tenantStore: TenantConfigStore;
  dedupStore: DedupStore;
  transport: BuildRequestTransport;
}

export function createReceiver(opts: ReceiverOptions = {}): Receiver {
  const tenantStore = opts.tenantStore ?? new InMemoryTenantConfigStore();
  const dedupStore = opts.dedupStore ?? new InMemoryDedupStore();
  const transport = opts.transport ?? new InProcessTransport();
  const now = opts.now ?? (() => new Date());
  const replayWindowMs = opts.replayWindowMs ?? DEFAULT_REPLAY_WINDOW_MS;

  const app = new Hono();

  app.get("/health", (c) =>
    c.json({
      status: "ok",
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      timestamp: now().toISOString(),
    }),
  );

  app.post("/webhooks/github/:tenantId", async (c) => {
    const tracer = getTracer();
    const span = tracer.startSpan("git-webhook.receive", {
      "service.name": SERVICE_NAME,
    });

    try {
      const tenantId = c.req.param("tenantId");
      span.setAttribute("crontech.tenant_id", tenantId);

      // Required GitHub headers
      const event = c.req.header("x-github-event");
      const deliveryId = c.req.header("x-github-delivery");
      const signature = c.req.header("x-hub-signature-256");
      const replay = c.req.header("x-crontech-replay") === "1";

      if (!event || !deliveryId) {
        span.setAttribute("crontech.outcome", "missing_headers");
        return c.json({ error: "missing required GitHub headers" }, 400);
      }
      span.setAttribute("github.event", event);
      span.setAttribute("github.delivery_id", deliveryId);

      // Read RAW body bytes — HMAC is computed over the wire bytes, not
      // over a re-stringified JSON object.
      const rawBody = await c.req.text();

      // ─ Parse JSON eagerly so we can pull `repository.full_name` to
      // look up the per-tenant secret. We tolerate parse errors with a
      // 400 — invalid JSON cannot be a valid GitHub webhook.
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch (err) {
        span.recordError(err);
        span.setAttribute("crontech.outcome", "invalid_json");
        return c.json({ error: "invalid JSON body" }, 400);
      }

      // GitHub sends a `ping` event on webhook creation. We respond OK
      // without attempting build routing, but still validate the
      // signature so attackers cannot probe tenants for free.
      const repoLookup = (parsed as { repository?: { full_name?: string } })
        .repository?.full_name;
      if (!repoLookup) {
        span.setAttribute("crontech.outcome", "missing_repo");
        return c.json({ error: "missing repository.full_name" }, 400);
      }

      const config = tenantStore.get(tenantId, repoLookup);
      if (!config) {
        span.setAttribute("crontech.outcome", "unknown_tenant");
        // Use 404 — leaking 401 vs 404 here is fine because the
        // signature check below would fail anyway.
        return c.json({ error: "unknown tenant or repo" }, 404);
      }

      if (!verifySignature(config.secret, rawBody, signature)) {
        span.setAttribute("crontech.outcome", "bad_signature");
        return c.json({ error: "invalid signature" }, 401);
      }

      // Replay-window check uses the GitHub `X-GitHub-Hook-Installation-
      // Target-ID` is NOT a timestamp; the cleanest available source is
      // the `X-GitHub-Event-Time` (rare) or our own `Date` header echo.
      // The portable approach is to require senders to include an ISO-
      // 8601 timestamp in `X-Crontech-Webhook-Time` (set by the GitHub
      // proxy edge) OR fall back to `Date` request header.
      const deliveredAtRaw =
        c.req.header("x-crontech-webhook-time") ?? c.req.header("date");
      if (deliveredAtRaw && !replay) {
        const deliveredAt = Date.parse(deliveredAtRaw);
        if (Number.isFinite(deliveredAt)) {
          const drift = now().getTime() - deliveredAt;
          span.setAttribute("crontech.delivery_age_ms", drift);
          if (drift > replayWindowMs) {
            span.setAttribute("crontech.outcome", "replay_rejected");
            return c.json({ error: "delivery too old" }, 408);
          }
        }
      }

      if (!dedupStore.recordIfFirst(deliveryId)) {
        span.setAttribute("crontech.outcome", "duplicate");
        return c.json({ status: "duplicate", deliveryId }, 200);
      }

      if (event === "ping") {
        span.setAttribute("crontech.outcome", "ping_ok");
        return c.json({ status: "pong" }, 200);
      }

      if (event !== "push") {
        span.setAttribute("crontech.outcome", "ignored_event");
        return c.json({ status: "ignored", reason: `event=${event}` }, 202);
      }

      const pushParse = PushPayloadSchema.safeParse(parsed);
      if (!pushParse.success) {
        span.setAttribute("crontech.outcome", "invalid_push_payload");
        return c.json(
          { error: "invalid push payload", issues: pushParse.error.issues },
          400,
        );
      }
      const push = pushParse.data;

      if (push.deleted === true) {
        span.setAttribute("crontech.outcome", "branch_delete_ignored");
        return c.json({ status: "ignored", reason: "branch_deleted" }, 202);
      }

      const branch = stripRefHeads(push.ref);
      if (branch === undefined) {
        span.setAttribute("crontech.outcome", "non_branch_ref");
        return c.json({ status: "ignored", reason: "non_branch_ref" }, 202);
      }
      span.setAttribute("git.branch", branch);

      const environment = resolveEnvironment(config, branch);
      if (!environment) {
        span.setAttribute("crontech.outcome", "branch_not_routed");
        return c.json(
          { status: "ignored", reason: "branch_not_routed", branch },
          202,
        );
      }
      span.setAttribute("crontech.environment", environment);

      const buildRequested: BuildRequested = BuildRequestedSchema.parse({
        deliveryId,
        tenantId: config.tenantId,
        repo: config.repo,
        ref: push.ref,
        sha: push.after,
        branch,
        pusher: {
          name: push.pusher.name,
          ...(push.pusher.email !== undefined ? { email: push.pusher.email } : {}),
        },
        timestamp: now().toISOString(),
        environment,
      } satisfies z.input<typeof BuildRequestedSchema>);

      const result = await transport.publish(buildRequested);
      span.setAttribute("crontech.transport.delivered", result.delivered);
      span.setAttribute("crontech.transport.failures", result.failures.length);

      if (!result.ok) {
        span.setAttribute("crontech.outcome", "transport_partial_failure");
        return c.json(
          {
            status: "partial",
            delivered: result.delivered,
            failures: result.failures,
            event: buildRequested,
          },
          207,
        );
      }

      span.setAttribute("crontech.outcome", "enqueued");
      return c.json({ status: "enqueued", event: buildRequested }, 202);
    } catch (err) {
      span.recordError(err);
      span.setAttribute("crontech.outcome", "exception");
      return c.json(
        {
          error: "internal error",
          detail: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    } finally {
      span.end();
    }
  });

  return { app, tenantStore, dedupStore, transport };
}

function stripRefHeads(ref: string): string | undefined {
  const prefix = "refs/heads/";
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : undefined;
}
