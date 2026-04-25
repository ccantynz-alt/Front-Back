/**
 * Crontech Deploy Agent
 *
 * A root-privileged Bun HTTP server that runs on localhost:9091 ONLY.
 * Never exposed externally — Caddy does not proxy this port. The Crontech
 * API admin endpoint calls it via localhost.
 *
 * Auth: Authorization: Bearer ${DEPLOY_AGENT_SECRET}
 *
 * Endpoints:
 *   GET  /health  → { ok: true }
 *   GET  /status  → { services, sha, deploying }
 *   POST /deploy  → SSE stream of deploy steps (git pull → install → build → restart)
 *   POST /restart → SSE stream of service restarts only
 */

const PORT = Number(process.env["DEPLOY_AGENT_PORT"] ?? 9091);
const SECRET = process.env["DEPLOY_AGENT_SECRET"] ?? "";
const APP_DIR = process.env["APP_DIR"] ?? "/opt/crontech";

if (!SECRET) {
  console.error("[deploy-agent] DEPLOY_AGENT_SECRET env var is required — refusing to start");
  process.exit(1);
}

// ── Auth ────────────────────────────────────────────────────────────

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

function authorised(req: Request): boolean {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && timingSafeEqual(token, SECRET);
}

// ── Helpers ─────────────────────────────────────────────────────────

type EventPayload = Record<string, unknown>;

function encodeEvent(payload: EventPayload): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

async function runCommand(
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(args, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}

// ── Deploy state ─────────────────────────────────────────────────────

let deployInProgress = false;

// ── Deploy pipeline ──────────────────────────────────────────────────

const DEPLOY_STEPS: Array<{ label: string; cmd: string[] }> = [
  { label: "git fetch", cmd: ["git", "fetch", "origin", "Main"] },
  { label: "git reset", cmd: ["git", "reset", "--hard", "origin/Main"] },
  { label: "bun install", cmd: ["bun", "install", "--frozen-lockfile"] },
  { label: "bun build", cmd: ["bun", "run", "build"] },
  { label: "migrate db", cmd: ["bun", "run", "--cwd", "apps/api", "-e",
    'import("@back-to-the-future/db/migrate").then(m=>m.runMigrations()).then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})'] },
  { label: "restart crontech-api", cmd: ["systemctl", "restart", "crontech-api"] },
  { label: "restart crontech-web", cmd: ["systemctl", "restart", "crontech-web"] },
];

async function runDeploy(writer: WritableStreamDefaultWriter<Uint8Array>): Promise<void> {
  try {
    for (const step of DEPLOY_STEPS) {
      await writer.write(encodeEvent({ step: step.label, status: "running" }));
      const result = await runCommand(step.cmd, APP_DIR);
      if (result.exitCode !== 0) {
        await writer.write(
          encodeEvent({
            step: step.label,
            status: "error",
            detail: result.stderr || result.stdout,
          }),
        );
        await writer.write(encodeEvent({ done: true, ok: false, failedStep: step.label }));
        return;
      }
      await writer.write(encodeEvent({ step: step.label, status: "ok" }));
    }
    await writer.write(encodeEvent({ done: true, ok: true }));
  } finally {
    writer.close().catch(() => {});
  }
}

// ── Status ──────────────────────────────────────────────────────────

const WATCHED_SERVICES = ["crontech-api", "crontech-web", "caddy"] as const;

async function getStatus(): Promise<{
  services: Record<string, string>;
  sha: string;
  deploying: boolean;
  uptime: string;
}> {
  const services: Record<string, string> = {};
  for (const svc of WATCHED_SERVICES) {
    const { stdout } = await runCommand(["systemctl", "is-active", svc], "/");
    services[svc] = stdout || "unknown";
  }

  const { stdout: sha } = await runCommand(
    ["git", "rev-parse", "--short", "HEAD"],
    APP_DIR,
  );

  const { stdout: uptime } = await runCommand(["uptime", "-p"], "/");

  return { services, sha, deploying: deployInProgress, uptime };
}

// ── Restart-only pipeline ────────────────────────────────────────────

async function runRestart(writer: WritableStreamDefaultWriter<Uint8Array>): Promise<void> {
  try {
    for (const svc of ["crontech-api", "crontech-web"] as const) {
      await writer.write(encodeEvent({ step: `restart ${svc}`, status: "running" }));
      const result = await runCommand(["systemctl", "restart", svc], "/");
      const status = result.exitCode === 0 ? "ok" : "error";
      await writer.write(encodeEvent({ step: `restart ${svc}`, status }));
    }
    await writer.write(encodeEvent({ done: true, ok: true }));
  } finally {
    writer.close().catch(() => {});
  }
}

// ── SSE response factory ─────────────────────────────────────────────

function sseStream(
  handler: (writer: WritableStreamDefaultWriter<Uint8Array>) => Promise<void>,
): Response {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  handler(writer); // fire-and-forget; handler closes writer when done
  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Server ───────────────────────────────────────────────────────────

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",

  async fetch(req) {
    if (!authorised(req)) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const { pathname } = new URL(req.url);
    const method = req.method;

    if (pathname === "/health" && method === "GET") {
      return json({ ok: true, pid: process.pid });
    }

    if (pathname === "/status" && method === "GET") {
      const status = await getStatus();
      return json({ ok: true, ...status });
    }

    if (pathname === "/deploy" && method === "POST") {
      if (deployInProgress) {
        return json({ ok: false, error: "deploy already in progress" }, 409);
      }
      deployInProgress = true;
      return sseStream((writer) =>
        runDeploy(writer).finally(() => {
          deployInProgress = false;
        }),
      );
    }

    if (pathname === "/restart" && method === "POST") {
      return sseStream(runRestart);
    }

    return json({ ok: false, error: "not found" }, 404);
  },
});

console.log(`[deploy-agent] Listening on http://127.0.0.1:${PORT}`);
console.log(`[deploy-agent] APP_DIR=${APP_DIR}`);
