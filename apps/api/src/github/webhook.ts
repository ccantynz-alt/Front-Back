/**
 * BLK-009 GitHub webhook receiver.
 *
 *   POST /api/webhook/github
 *   Content-Type:           application/json
 *   X-GitHub-Event:         push | ping | ...
 *   X-Hub-Signature-256:    sha256=<hex hmac of raw body with GITHUB_WEBHOOK_SECRET>
 *
 * Flow:
 *   1. Verify `X-Hub-Signature-256` using timing-safe compare
 *   2. Parse the push payload — extract repo full_name, commit sha, branch,
 *      author, commit message
 *   3. Look up a project by `projects.repoUrl` (matches the canonical
 *      `https://github.com/<owner>/<name>.git` form as well as the bare
 *      `owner/name` and `https://github.com/<owner>/<name>` variants)
 *   4. Create a `deployments` row (status=queued, triggeredBy=webhook)
 *   5. Enqueue the build via `apps/api/src/automation/build-runner.ts`
 *   6. Return `{ ok: true, deploymentId, status }`
 *
 * Errors:
 *   400  missing/invalid payload
 *   401  missing/invalid signature
 *   404  no project configured for this repository
 *   500  unexpected failure
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, or } from "drizzle-orm";
import { db as defaultDb, deployments, projects } from "@back-to-the-future/db";
import { enqueueBuild } from "../automation/build-runner";
import { emitDataChange } from "../realtime/live-updates";

export type DbClient = typeof defaultDb;

// ── Dependency seam ──────────────────────────────────────────────────

export interface GithubWebhookDeps {
  db?: DbClient;
  getSecret?: () => string | undefined;
  enqueue?: (deploymentId: string) => void;
}

// ── Payload schema ───────────────────────────────────────────────────

const PushPayloadSchema = z.object({
  ref: z.string().min(1),
  after: z.string().min(7).optional(),
  head_commit: z
    .object({
      id: z.string().min(7).optional(),
      message: z.string().optional(),
      author: z
        .object({
          name: z.string().optional(),
          username: z.string().optional(),
          email: z.string().optional(),
        })
        .optional(),
    })
    .nullable()
    .optional(),
  repository: z.object({
    full_name: z.string().min(3),
    html_url: z.string().url().optional(),
    clone_url: z.string().url().optional(),
    default_branch: z.string().optional(),
  }),
  pusher: z
    .object({
      name: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
  deleted: z.boolean().optional(),
});

export type PushPayload = z.infer<typeof PushPayloadSchema>;

// ── Signature verification ───────────────────────────────────────────

/**
 * Timing-safe string compare. Never exits early on mismatch so an
 * attacker cannot probe the secret via response-time measurement.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verify `x-hub-signature-256: sha256=<hex>` against the HMAC-SHA256 of the
 * raw body using the shared webhook secret. Uses SubtleCrypto so this runs
 * on Bun, Node, and Cloudflare Workers unchanged.
 */
export async function verifyGithubSignature(
  secret: string,
  header: string | undefined | null,
  rawBody: string,
): Promise<boolean> {
  if (!header) return false;
  const match = /^sha256=([0-9a-f]+)$/i.exec(header.trim());
  if (!match) return false;
  const provided = match[1];
  if (!provided) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(rawBody),
  );
  const expected = Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqual(provided.toLowerCase(), expected.toLowerCase());
}

// ── Repo-URL normalisation ───────────────────────────────────────────

/**
 * Build the set of URL shapes a customer may have saved in
 * `projects.repoUrl` for this repository. We match against any of them so
 * users do not have to format the string exactly the way GitHub does.
 */
export function candidateRepoUrls(fullName: string): string[] {
  return [
    `https://github.com/${fullName}`,
    `https://github.com/${fullName}.git`,
    `http://github.com/${fullName}`,
    `http://github.com/${fullName}.git`,
    `git@github.com:${fullName}.git`,
    fullName,
  ];
}

/**
 * Extract the short branch name from a `refs/heads/...` git ref.
 * Returns null for tag refs or unparseable strings.
 */
export function refToBranch(ref: string): string | null {
  if (ref.startsWith("refs/heads/")) {
    return ref.slice("refs/heads/".length);
  }
  return null;
}

// ── Route factory ────────────────────────────────────────────────────

export function createGithubWebhookApp(deps: GithubWebhookDeps = {}): Hono {
  const db = deps.db ?? defaultDb;
  const getSecret =
    deps.getSecret ?? ((): string | undefined => process.env["GITHUB_WEBHOOK_SECRET"]);
  const enqueue = deps.enqueue ?? enqueueBuild;

  const app = new Hono();

  app.post("/webhook/github", async (c) => {
    // ── 1. Grab the raw body FIRST so HMAC verification is byte-exact ──
    let rawBody: string;
    try {
      rawBody = await c.req.text();
    } catch {
      return c.json({ ok: false, error: "invalid body" }, 400);
    }

    // ── 2. Verify signature ───────────────────────────────────────────
    const secret = getSecret();
    if (!secret) {
      console.warn(
        "[github-webhook] GITHUB_WEBHOOK_SECRET not set — rejecting request",
      );
      return c.json({ ok: false, error: "webhook secret not configured" }, 401);
    }
    const sigHeader =
      c.req.header("x-hub-signature-256") ??
      c.req.header("X-Hub-Signature-256") ??
      null;
    const verified = await verifyGithubSignature(secret, sigHeader, rawBody);
    if (!verified) {
      return c.json({ ok: false, error: "invalid signature" }, 401);
    }

    // ── 3. Parse event type ──────────────────────────────────────────
    const event =
      c.req.header("x-github-event") ?? c.req.header("X-GitHub-Event") ?? "";
    if (event === "ping") {
      return c.json({ ok: true, event: "ping" });
    }
    if (event !== "push") {
      // We only act on push events for now — everything else is ack'd but
      // does not trigger a deployment.
      return c.json({ ok: true, event, ignored: true });
    }

    // ── 4. Parse JSON + validate shape ───────────────────────────────
    let raw: unknown;
    try {
      raw = JSON.parse(rawBody);
    } catch {
      return c.json({ ok: false, error: "invalid JSON body" }, 400);
    }
    const parsed = PushPayloadSchema.safeParse(raw);
    if (!parsed.success) {
      return c.json(
        {
          ok: false,
          error: "invalid push payload",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        400,
      );
    }
    const payload = parsed.data;

    // Ignore branch-delete pushes.
    if (payload.deleted === true) {
      return c.json({ ok: true, event, ignored: true, reason: "branch_deleted" });
    }

    const branch = refToBranch(payload.ref);
    if (!branch) {
      return c.json({ ok: true, event, ignored: true, reason: "non_branch_ref", ref: payload.ref });
    }

    const commitSha = payload.head_commit?.id ?? payload.after ?? null;
    if (!commitSha) {
      return c.json({ ok: false, error: "push payload missing commit sha" }, 400);
    }

    // ── 5. Look up project by repoUrl ────────────────────────────────
    const urls = candidateRepoUrls(payload.repository.full_name);
    const projectRows = await db
      .select()
      .from(projects)
      .where(
        or(
          eq(projects.repoUrl, urls[0] ?? ""),
          eq(projects.repoUrl, urls[1] ?? ""),
          eq(projects.repoUrl, urls[2] ?? ""),
          eq(projects.repoUrl, urls[3] ?? ""),
          eq(projects.repoUrl, urls[4] ?? ""),
          eq(projects.repoUrl, urls[5] ?? ""),
        ),
      )
      .limit(1);
    const project = projectRows[0];
    if (!project) {
      return c.json(
        {
          ok: false,
          error: "no project configured for this repository",
          repository: payload.repository.full_name,
        },
        404,
      );
    }

    // If the project pins a branch and this push is on a different one,
    // ack the webhook but do NOT deploy.
    const pinnedBranch = project.repoBranch ?? "main";
    if (branch !== pinnedBranch) {
      return c.json({
        ok: true,
        ignored: true,
        reason: "branch_not_tracked",
        pushBranch: branch,
        trackedBranch: pinnedBranch,
      });
    }

    // ── 6. Create deployment row ─────────────────────────────────────
    const deploymentId = crypto.randomUUID();
    const now = new Date();
    const commitMessage = payload.head_commit?.message ?? null;
    const commitAuthor =
      payload.head_commit?.author?.username ??
      payload.head_commit?.author?.name ??
      payload.pusher?.name ??
      null;

    const values: typeof deployments.$inferInsert = {
      id: deploymentId,
      projectId: project.id,
      userId: project.userId,
      commitSha,
      commitMessage,
      commitAuthor,
      branch,
      status: "queued",
      triggeredBy: "webhook",
      isCurrent: false,
      createdAt: now,
    };
    try {
      await db.insert(deployments).values(values);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[github-webhook] failed to insert deployment:", message);
      return c.json({ ok: false, error: "failed to queue deployment" }, 500);
    }

    // ── 7. Enqueue build (fire-and-forget, non-fatal on failure) ─────
    try {
      enqueue(deploymentId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[github-webhook] enqueueBuild failed for ${deploymentId}: ${message}`,
      );
    }

    emitDataChange(["projects", "deployments"], "webhook deployment queued");

    return c.json({
      ok: true,
      deploymentId,
      projectId: project.id,
      status: "queued" as const,
      repository: payload.repository.full_name,
      branch,
      commitSha,
    });
  });

  return app;
}

/** Default-wired app for mounting on the main Hono tree. */
export const githubWebhookApp = createGithubWebhookApp();
