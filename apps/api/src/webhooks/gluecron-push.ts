/**
 * Gluecron push-notification receiver.
 *
 * Wire contract reference: see chat-defined spec for Gluecron → Crontech
 * push notification. This file is Crontech's OWN copy per the HTTP-only
 * coupling rule — we do NOT import types or code from the Gluecron repo.
 *
 *   POST /api/hooks/gluecron/push
 *   Authorization: Bearer ${GLUECRON_WEBHOOK_SECRET}
 *   Content-Type:  application/json
 *
 *   { repository, sha, branch, ref, source, timestamp? }
 *
 *   → 200 { ok: true, deploymentId, status: "queued" | "skipped" }
 *   → 401 invalid bearer token
 *   → 400 malformed payload
 *   → 404 repository not configured for auto-deploy on Crontech
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db as defaultDb } from "@back-to-the-future/db";
import { tenantGitRepos } from "@back-to-the-future/db";
import {
  orchestratorDeploy,
  type OrchestratorDeployInput,
} from "../deploy/orchestrator-client";
import {
  classifyDeployError,
  emitDeployFailed,
  emitDeploySucceeded,
} from "../events/deploy-event-emitter";

export type DbClient = typeof defaultDb;

// ── Auth: timing-safe bearer-token comparison ───────────────────────

/**
 * Constant-time string equality. We compare byte-by-byte after length check
 * so an attacker cannot probe the secret via response-time measurement.
 * Uses a branchless XOR accumulator so the loop always touches every byte
 * of the longer string.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a dummy comparison so the early-exit path does not leak
    // length information via timing (this is belt-and-braces — length
    // alone already reveals the mismatch, but the real secret's length
    // is fixed so this only protects the constant-length compare below).
    let dummy = 0;
    for (let i = 0; i < a.length; i++) {
      dummy |= a.charCodeAt(i) ^ a.charCodeAt(i);
    }
    return dummy === 1;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1]!.trim() : null;
}

// ── Payload schema ──────────────────────────────────────────────────

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

export type PushPayload = z.infer<typeof PushPayloadSchema>;

// ── Dependency seam for tests ───────────────────────────────────────

export interface GluecronHookDeps {
  db?: DbClient;
  /** Overrideable deploy trigger so tests can mock the orchestrator. */
  deploy?: (input: OrchestratorDeployInput) => Promise<{ containerId: string }>;
  /** Overrideable secret accessor so tests can inject without mutating env. */
  getSecret?: () => string | undefined;
}

// ── Route factory ───────────────────────────────────────────────────

export function createGluecronPushApp(
  deps: GluecronHookDeps = {},
): Hono {
  const db = deps.db ?? defaultDb;
  const deploy =
    deps.deploy ??
    (async (input) => {
      const result = await orchestratorDeploy(input);
      return { containerId: result.containerId };
    });
  const getSecret =
    deps.getSecret ?? (() => process.env["GLUECRON_WEBHOOK_SECRET"]);

  const app = new Hono();

  app.post("/hooks/gluecron/push", async (c) => {
    // ── 1. Auth: bearer token ─────────────────────────────────────
    const secret = getSecret();
    const provided = extractBearer(c.req.header("Authorization"));
    if (!secret || !provided || !timingSafeEqual(provided, secret)) {
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

    // ── 3. Lookup tenant_git_repos by repository ──────────────────
    const rows = await db
      .select()
      .from(tenantGitRepos)
      .where(eq(tenantGitRepos.repository, payload.repository))
      .limit(1);

    const config = rows[0];
    if (!config) {
      return c.json(
        {
          ok: false,
          error: "repository not configured for auto-deploy on Crontech",
          repository: payload.repository,
        },
        404,
      );
    }

    // ── 4. Skip when autoDeploy disabled ──────────────────────────
    const deploymentId = crypto.randomUUID();
    if (!config.autoDeploy) {
      return c.json({
        ok: true,
        deploymentId,
        status: "skipped" as const,
        reason: "autoDeploy disabled for this repository",
      });
    }

    // ── 5. Reuse tenant.deploy logic via shared helper ────────────
    const runtime =
      config.runtime === "nextjs" || config.runtime === "bun"
        ? config.runtime
        : "bun";
    const envVarsParsed: Record<string, string> | undefined = (() => {
      if (!config.envVars) return undefined;
      try {
        const v = JSON.parse(config.envVars) as unknown;
        if (v && typeof v === "object" && !Array.isArray(v)) {
          return v as Record<string, string>;
        }
      } catch {
        // Malformed envVars blob — treat as absent. We do not fail the
        // deploy for this; tenant admins can fix the config without
        // blocking a push.
      }
      return undefined;
    })();

    const deployInput: OrchestratorDeployInput = {
      appName: config.appName,
      repoUrl: `https://github.com/${payload.repository}.git`,
      branch: config.branch,
      domain: config.domain,
      port: config.port,
      runtime,
      ...(envVarsParsed !== undefined ? { envVars: envVarsParsed } : {}),
    };

    // ── 6. Trigger deploy + emit Signal Bus P1 event (E3/E4) ───────
    //
    // Deploy events go out DOWNSTREAM of the orchestrator call as a
    // fire-and-forget HTTP POST to Gluecron. The emitter itself never
    // throws, so `void emitDeployX(...)` is safe — we do NOT await it
    // and we do NOT let its result affect the hook's HTTP response.
    const deployStartedAt = Date.now();
    try {
      await deploy(deployInput);
    } catch (err) {
      const durationMs = Date.now() - deployStartedAt;
      const message = err instanceof Error ? err.message : "deploy failed";
      console.warn(
        `[gluecron-push] deploy trigger failed for ${payload.repository}:`,
        message,
      );
      void emitDeployFailed({
        repository: payload.repository,
        sha: payload.sha,
        deploymentId,
        errorCategory: classifyDeployError(err),
        errorSummary: message,
        durationMs,
      });
      return c.json(
        { ok: false, error: "deploy trigger failed", detail: message },
        502,
      );
    }

    const durationMs = Date.now() - deployStartedAt;
    void emitDeploySucceeded({
      repository: payload.repository,
      sha: payload.sha,
      deploymentId,
      durationMs,
    });

    return c.json({
      ok: true,
      deploymentId,
      status: "queued" as const,
      repository: payload.repository,
      sha: payload.sha,
      branch: payload.branch,
    });
  });

  return app;
}

/** Default-wired app for mounting on the main Hono tree. */
export const gluecronPushApp = createGluecronPushApp();
