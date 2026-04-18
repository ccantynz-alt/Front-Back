/**
 * BLK-009 E2E: GitHub webhook → build-runner → deployment_logs → deployments.
 *
 * Honest end-to-end integration test. Exercises:
 *  - The real Hono webhook app from `apps/api/src/github/webhook.ts`
 *    (HMAC-SHA256 signature verification, payload parsing, repo lookup,
 *    deployment-row insert).
 *  - The real build-runner from `apps/api/src/automation/build-runner.ts`
 *    spawning real `git clone`, `bun install`, `bun run build` against a
 *    local fixture repo that is `git init`'d at test startup.
 *  - Only the orchestrator deploy handoff is mocked (we cannot actually
 *    Docker-deploy to Vultr inside CI). The mock is injected via the
 *    `deploy` DI hook on `runBuild`.
 *
 * The shared `apps/api/test/setup.ts` preload wipes `local.db` and runs
 * all drizzle migrations before the suite loads, so the tables we insert
 * into below always exist.
 *
 * Fixture: `apps/api/test/fixtures/hello-world-repo/`
 *   - Trivial TypeScript entrypoint, zero dependencies.
 *   - Copied to a tmp dir, `git init`'d, committed, and exposed over a
 *     `file://` URL so the runner's `git clone` step hits a real repo
 *     without any network access.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import {
  db,
  deploymentLogs,
  deployments,
  projects,
  users,
} from "@back-to-the-future/db";
import {
  _resetQueueForTests,
  type DeployFn,
  runBuild,
} from "../src/automation/build-runner";
import { createGithubWebhookApp } from "../src/github/webhook";

// ── Fixtures & constants ────────────────────────────────────────────

const WEBHOOK_SECRET = "whsec_blk009_e2e_test_secret_1234567890";
const REPO_FULL_NAME = "crontech-test/hello-world";
const FIXTURE_SRC = resolve(import.meta.dir, "fixtures", "hello-world-repo");

/** Tmp dir holding the `git init`'d copy of the fixture. Set in beforeAll. */
let gitRepoPath = "";
/** `file://` URL the runner's `git clone` step points at. */
let gitRepoUrl = "";
/** Tmp workspace root the runner clones into (isolates from `/tmp/crontech-build`). */
let workspaceRoot = "";

interface SeededProject {
  userId: string;
  projectId: string;
  projectSlug: string;
  repoUrl: string;
}

async function wipeTables(): Promise<void> {
  // Child rows first — FK cascades cover the rest but explicit is safer.
  await db.delete(deploymentLogs);
  await db.delete(deployments);
  await db.delete(projects);
  await db.delete(users);
}

async function seedUserAndProject(
  overrides: {
    slug?: string;
    buildCommand?: string;
    installCommand?: string;
    repoUrl?: string;
  } = {},
): Promise<SeededProject> {
  const userId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const now = new Date();
  const slug = overrides.slug ?? `hello-world-${projectId.slice(0, 8)}`;
  // The webhook handler matches `projects.repoUrl` against a fixed set of
  // GitHub URL shapes derived from the push's `repository.full_name`. We
  // seed with the canonical https:// form so the lookup succeeds. The
  // happy-path test swaps this to the local `file://` fixture URL AFTER
  // the webhook runs, before kicking `runBuild`, so the runner's real
  // `git clone` step hits the fixture rather than the public internet.
  const repoUrl = overrides.repoUrl ?? `https://github.com/${REPO_FULL_NAME}`;

  await db.insert(users).values({
    id: userId,
    email: `blk009-${userId.slice(0, 8)}@crontech.test`,
    displayName: "BLK-009 Test User",
    role: "editor",
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(projects).values({
    id: projectId,
    userId,
    name: "hello-world",
    slug,
    repoUrl,
    repoBranch: "main",
    framework: "static",
    installCommand: overrides.installCommand ?? "bun install",
    buildCommand: overrides.buildCommand ?? "bun run build",
    runtime: "bun",
    port: 3000,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  return { userId, projectId, projectSlug: slug, repoUrl };
}

// ── Webhook HMAC helpers ────────────────────────────────────────────

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function makePushPayload(
  opts: {
    fullName?: string;
    branch?: string;
    sha?: string;
    message?: string;
  } = {},
): string {
  const fullName = opts.fullName ?? REPO_FULL_NAME;
  const sha = opts.sha ?? "a".repeat(40);
  const branch = opts.branch ?? "main";
  return JSON.stringify({
    ref: `refs/heads/${branch}`,
    after: sha,
    head_commit: {
      id: sha,
      message: opts.message ?? "feat: trigger BLK-009 e2e build",
      author: {
        name: "BLK-009 Test Author",
        username: "blk009-tester",
        email: "tester@crontech.test",
      },
    },
    repository: {
      full_name: fullName,
      html_url: `https://github.com/${fullName}`,
      clone_url: `https://github.com/${fullName}.git`,
      default_branch: "main",
    },
    pusher: {
      name: "blk009-tester",
      email: "tester@crontech.test",
    },
  });
}

async function makeSignedRequest(
  body: string,
  opts: { secret?: string; signature?: string | null; event?: string } = {},
): Promise<Request> {
  const secret = opts.secret ?? WEBHOOK_SECRET;
  const sig =
    opts.signature === null
      ? undefined
      : (opts.signature ?? `sha256=${await hmacSha256Hex(secret, body)}`);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-GitHub-Event": opts.event ?? "push",
  };
  if (sig !== undefined) headers["X-Hub-Signature-256"] = sig;
  return new Request("http://localhost/webhook/github", {
    method: "POST",
    headers,
    body,
  });
}

function buildAppWithCapturedEnqueue(): {
  app: ReturnType<typeof createGithubWebhookApp>;
  enqueued: string[];
} {
  const enqueued: string[] = [];
  const app = createGithubWebhookApp({
    db,
    getSecret: () => WEBHOOK_SECRET,
    // Capture the deployment id instead of kicking the real async queue —
    // this keeps the test deterministic. We drive `runBuild` ourselves
    // below so we can `await` the full pipeline.
    enqueue: (id: string) => {
      enqueued.push(id);
    },
  });
  return { app, enqueued };
}

// ── Fake deployer (only mocked integration point) ──────────────────

interface DeployCall {
  appName: string;
  repoUrl: string;
  branch: string;
  domain: string;
  port: number;
  runtime: string;
}

function makeSuccessDeployer(): { deploy: DeployFn; calls: DeployCall[] } {
  const calls: DeployCall[] = [];
  const deploy: DeployFn = async (input) => {
    calls.push({
      appName: input.appName,
      repoUrl: input.repoUrl,
      branch: input.branch,
      domain: input.domain,
      port: input.port,
      runtime: input.runtime,
    });
    return {
      containerId: "ctr_blk009_fake_12345",
      appName: input.appName,
      domain: input.domain,
      url: `https://${input.domain}`,
      status: "running",
      healthCheck: "healthy",
    };
  };
  return { deploy, calls };
}

// ── git helpers ─────────────────────────────────────────────────────

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    env: {
      ...process.env,
      // Disable commit signing — CI/sandbox environments block the
      // signing server, and the fixture commit does not need to be
      // attestable.
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
      GIT_AUTHOR_NAME: "BLK-009 Fixture",
      GIT_AUTHOR_EMAIL: "fixture@crontech.test",
      GIT_COMMITTER_NAME: "BLK-009 Fixture",
      GIT_COMMITTER_EMAIL: "fixture@crontech.test",
    },
  });
}

function initFixtureRepo(): { repoPath: string; repoUrl: string } {
  const repoPath = mkdtempSync(resolve(tmpdir(), "blk009-repo-"));
  cpSync(FIXTURE_SRC, repoPath, { recursive: true });
  git(repoPath, ["init", "-q", "-b", "main"]);
  git(repoPath, ["-c", "commit.gpgsign=false", "add", "-A"]);
  git(repoPath, [
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-q",
    "-m",
    "BLK-009 fixture initial commit",
  ]);
  return { repoPath, repoUrl: `file://${repoPath}` };
}

// ── Setup / teardown ────────────────────────────────────────────────

beforeAll(() => {
  const { repoPath, repoUrl } = initFixtureRepo();
  gitRepoPath = repoPath;
  gitRepoUrl = repoUrl;
  workspaceRoot = mkdtempSync(resolve(tmpdir(), "blk009-ws-"));
});

afterAll(() => {
  if (gitRepoPath) rmSync(gitRepoPath, { recursive: true, force: true });
  if (workspaceRoot) rmSync(workspaceRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  _resetQueueForTests();
  await wipeTables();
});

afterEach(() => {
  _resetQueueForTests();
});

// ── Tests ───────────────────────────────────────────────────────────

describe("BLK-009 E2E: webhook → build-runner → deploy", () => {
  test("a signed webhook push triggers build, streams logs, marks deployment live", async () => {
    const seeded = await seedUserAndProject();
    const { app, enqueued } = buildAppWithCapturedEnqueue();

    // 1. Webhook receives signed push → creates queued deployment.
    const body = makePushPayload({});
    const req = await makeSignedRequest(body);
    const res = await app.fetch(req);

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      deploymentId: string;
      projectId: string;
      status: string;
      branch: string;
      commitSha: string;
    };
    expect(json.ok).toBe(true);
    expect(json.status).toBe("queued");
    expect(json.projectId).toBe(seeded.projectId);
    expect(json.branch).toBe("main");
    expect(typeof json.deploymentId).toBe("string");
    expect(enqueued).toEqual([json.deploymentId]);

    const queuedRows = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, json.deploymentId));
    expect(queuedRows.length).toBe(1);
    const queued = queuedRows[0];
    if (!queued) throw new Error("queued row missing");
    expect(queued.status).toBe("queued");
    expect(queued.triggeredBy).toBe("webhook");
    expect(queued.projectId).toBe(seeded.projectId);
    expect(queued.userId).toBe(seeded.userId);

    // 2. Swap the project's repoUrl to the local fixture so the runner's
    //    `git clone` step hits a real repo without needing network. This
    //    is the "honest E2E" trade-off: the webhook must match on the
    //    canonical GitHub URL for the lookup to succeed (that's the whole
    //    point of the webhook path), but the runner needs something it
    //    can actually clone in CI.
    await db
      .update(projects)
      .set({ repoUrl: gitRepoUrl })
      .where(eq(projects.id, seeded.projectId));

    // 3. Run the real pipeline: real spawn for clone+install+build, mocked deploy.
    const { deploy, calls } = makeSuccessDeployer();
    const result = await runBuild(json.deploymentId, {
      db,
      deploy,
      workspaceRoot,
      // Short enough to fail loudly if the pipeline stalls, long enough
      // for a cold `bun install` on slow CI runners.
      totalTimeoutMs: 120_000,
    });

    expect(result.deploymentId).toBe(json.deploymentId);
    expect(result.status).toBe("live");
    expect(result.deployUrl).toBe(
      `https://${seeded.projectSlug}.crontech.ai`,
    );
    expect(result.errorMessage).toBeNull();

    // 3. Deployer was called exactly once with the project's config.
    expect(calls.length).toBe(1);
    const call = calls[0];
    if (!call) throw new Error("deploy call missing");
    expect(call.appName).toBe(seeded.projectSlug);
    expect(call.branch).toBe("main");
    expect(call.domain).toBe(`${seeded.projectSlug}.crontech.ai`);
    expect(call.runtime).toBe("bun");

    // 4. Terminal row reflects the live deployment.
    const finalRows = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, json.deploymentId));
    const final = finalRows[0];
    if (!final) throw new Error("final row missing");
    expect(final.status).toBe("live");
    expect(final.deployUrl).toBe(`https://${seeded.projectSlug}.crontech.ai`);
    expect(final.url).toBe(`https://${seeded.projectSlug}.crontech.ai`);
    expect(final.isCurrent).toBe(true);
    expect(final.completedAt).not.toBeNull();
    expect(final.errorMessage).toBeNull();

    // 5. Logs contain rows for every canonical step plus real stdout/event lines.
    const logs = await db
      .select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.deploymentId, json.deploymentId));
    expect(logs.length).toBeGreaterThanOrEqual(4);

    const stdoutLines = logs.filter((l) => l.stream === "stdout");
    const eventLines = logs.filter((l) => l.stream === "event");
    expect(stdoutLines.length).toBeGreaterThanOrEqual(1);
    expect(eventLines.length).toBeGreaterThanOrEqual(1);

    const joined = logs.map((l) => l.line).join("\n");
    expect(joined).toContain("clone");
    expect(joined).toContain("install");
    expect(joined).toContain("build");
    expect(joined).toMatch(/deploy/i);
  }, 120_000);

  test("a build failure marks deployment failed and leaves error message", async () => {
    // Point the project's build command at something that will exit non-zero.
    // `false` is the POSIX no-op-that-fails command — guaranteed to exist,
    // guaranteed to exit 1.
    await seedUserAndProject({ buildCommand: "false" });
    const { app } = buildAppWithCapturedEnqueue();

    const body = makePushPayload({});
    const req = await makeSignedRequest(body);
    const res = await app.fetch(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { deploymentId: string };

    // Same swap as the happy-path test — webhook looked up the project by
    // canonical URL, runner needs a cloneable local URL.
    await db
      .update(projects)
      .set({ repoUrl: gitRepoUrl })
      .where(eq(projects.userId, projects.userId));

    const { deploy, calls } = makeSuccessDeployer();
    const result = await runBuild(json.deploymentId, {
      db,
      deploy,
      workspaceRoot,
      totalTimeoutMs: 120_000,
    });

    // Build failed → runner returns failed, deployer never invoked.
    expect(result.status).toBe("failed");
    expect(result.errorMessage).not.toBeNull();
    expect(result.errorMessage).toMatch(/build/i);
    expect(calls.length).toBe(0);

    // Row state: failed, not current, error message populated.
    const rows = await db
      .select()
      .from(deployments)
      .where(eq(deployments.id, json.deploymentId));
    const row = rows[0];
    if (!row) throw new Error("row missing");
    expect(row.status).toBe("failed");
    expect(row.errorMessage).toBeTruthy();
    expect(row.isCurrent).toBe(false);
    expect(row.completedAt).not.toBeNull();

    // A failure event is always written — important for the UI timeline.
    const logs = await db
      .select()
      .from(deploymentLogs)
      .where(eq(deploymentLogs.deploymentId, json.deploymentId));
    const failureEvent = logs.find(
      (l) => l.stream === "event" && l.line.toLowerCase().includes("failed"),
    );
    expect(failureEvent).toBeDefined();

    // Workspace cleanup: the build-runner's `finally` must `rm -rf`
    // the deployment's tmp dir even on failure.
    const { existsSync } = await import("node:fs");
    expect(existsSync(`${workspaceRoot}/${json.deploymentId}`)).toBe(false);
  }, 120_000);

  test("a malformed or unsigned webhook payload is rejected 401/403", async () => {
    // Seed a project so that, if signature verification were somehow
    // bypassed, a deployment row would be created — and the assertion
    // at the bottom of this test would catch it.
    await seedUserAndProject();
    const { app, enqueued } = buildAppWithCapturedEnqueue();

    // 1. No signature header → 401.
    const unsignedBody = makePushPayload({});
    const unsignedReq = await makeSignedRequest(unsignedBody, {
      signature: null,
    });
    const unsignedRes = await app.fetch(unsignedReq);
    expect([401, 403]).toContain(unsignedRes.status);

    // 2. Wrong signature → 401.
    const tamperedReq = await makeSignedRequest(unsignedBody, {
      signature: "sha256=deadbeef",
    });
    const tamperedRes = await app.fetch(tamperedReq);
    expect([401, 403]).toContain(tamperedRes.status);

    // 3. Signature computed over a different body (payload mutated
    //    post-signing) → 401. This is the most important case — proves
    //    the handler reads the *raw* body for HMAC, not the parsed one.
    const originalBody = makePushPayload({});
    const validSig = `sha256=${await hmacSha256Hex(WEBHOOK_SECRET, originalBody)}`;
    const mutatedBody = makePushPayload({ message: "different body" });
    const mutatedReq = new Request("http://localhost/webhook/github", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "push",
        "X-Hub-Signature-256": validSig,
      },
      body: mutatedBody,
    });
    const mutatedRes = await app.fetch(mutatedReq);
    expect([401, 403]).toContain(mutatedRes.status);

    // None of the rejected requests created a deployment row or called
    // the build queue.
    const rows = await db.select().from(deployments);
    expect(rows.length).toBe(0);
    expect(enqueued.length).toBe(0);
  });
});
