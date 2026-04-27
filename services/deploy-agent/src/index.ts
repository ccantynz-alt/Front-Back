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
 *   GET  /health          → { ok: true }
 *   GET  /status          → { services, sha, deploying }
 *   POST /deploy          → SSE stream of deploy steps (git pull → install → build → restart)
 *   POST /restart         → SSE stream of service restarts only
 *   GET  /env-vars        → { ok: true, vars: [{ key, hint, set }] }
 *   PUT  /env-vars        → set a key=value in the .env file
 *   DELETE /env-vars/:key → remove a key from the .env file
 *   GET  /git/log         → { ok: true, commits: [{ sha, subject, date }] }
 *   GET  /git/drift       → { ok: true, localSha, originSha, ahead, behind, dirty }
 *   GET  /diagnose        → { ok: true, services, checks: [{ name, ok, detail }] }
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

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

// ── Env var file management ──────────────────────────────────────────

const ENV_FILE_PATH = path.join(APP_DIR, ".env");

function readEnvMap(): Map<string, string> {
  if (!existsSync(ENV_FILE_PATH)) return new Map();
  const content = readFileSync(ENV_FILE_PATH, "utf8");
  const map = new Map<string, string>();
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    map.set(k, v);
  }
  return map;
}

function writeEnvMap(map: Map<string, string>): void {
  const lines = Array.from(map.entries()).map(([k, v]) => {
    const needsQuotes = /[\s"'\\#]/.test(v);
    return needsQuotes ? `${k}="${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : `${k}=${v}`;
  });
  writeFileSync(ENV_FILE_PATH, lines.join("\n") + "\n", "utf8");
}

function valueHint(v: string): string {
  if (!v) return "(empty)";
  if (v.length <= 4) return "••••";
  return `${v.slice(0, 4)}${"•".repeat(Math.min(8, v.length - 4))}`;
}

// ── Git log + drift helpers (BLK /admin/ops) ─────────────────────────
// `git log` and `git rev-list` run in APP_DIR. We pin the format so the
// parse is deterministic. `parseGitLog` is exported as a pure helper for
// unit testing — the deploy-agent has no test harness yet, but the shape
// is identical to what `parseDriftCounts` is to keep it test-friendly.

export interface GitCommit {
  sha: string;
  subject: string;
  date: string;
}

export function parseGitLog(stdout: string): GitCommit[] {
  if (!stdout) return [];
  const commits: GitCommit[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    // Format: %h\x1f%s\x1f%ar — using ASCII unit-separator so commit
    // subjects containing pipes / commas still parse cleanly.
    const parts = line.split("\x1f");
    if (parts.length !== 3) continue;
    const [sha, subject, date] = parts;
    if (!sha || !subject || !date) continue;
    commits.push({ sha, subject, date });
  }
  return commits;
}

export interface DriftCounts {
  ahead: number;
  behind: number;
}

export function parseDriftCounts(stdout: string): DriftCounts {
  // `git rev-list --left-right --count origin/Main...HEAD` returns
  // "<behind>\t<ahead>" — left side is origin, right side is HEAD.
  const trimmed = stdout.trim();
  if (!trimmed) return { ahead: 0, behind: 0 };
  const parts = trimmed.split(/\s+/);
  const behind = Number.parseInt(parts[0] ?? "0", 10);
  const ahead = Number.parseInt(parts[1] ?? "0", 10);
  return {
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
  };
}

async function getGitLog(limit = 20): Promise<GitCommit[]> {
  const { stdout } = await runCommand(
    [
      "git",
      "log",
      `-${Math.max(1, Math.min(100, limit))}`,
      "--pretty=format:%h\x1f%s\x1f%ar",
    ],
    APP_DIR,
  );
  return parseGitLog(stdout);
}

async function getGitDrift(): Promise<{
  localSha: string;
  originSha: string;
  ahead: number;
  behind: number;
  dirty: boolean;
}> {
  // Fetch first so origin/Main reflects reality. `--quiet` keeps stderr
  // free of "From origin/Main..." chatter that would otherwise confuse
  // the JSON response.
  await runCommand(["git", "fetch", "--quiet", "origin", "Main"], APP_DIR);

  const [{ stdout: localSha }, { stdout: originSha }, { stdout: drift }, { stdout: status }] =
    await Promise.all([
      runCommand(["git", "rev-parse", "--short", "HEAD"], APP_DIR),
      runCommand(["git", "rev-parse", "--short", "origin/Main"], APP_DIR),
      runCommand(
        ["git", "rev-list", "--left-right", "--count", "origin/Main...HEAD"],
        APP_DIR,
      ),
      runCommand(["git", "status", "--porcelain"], APP_DIR),
    ]);

  const counts = parseDriftCounts(drift);
  return {
    localSha: localSha.trim(),
    originSha: originSha.trim(),
    ahead: counts.ahead,
    behind: counts.behind,
    dirty: status.trim().length > 0,
  };
}

// ── Diagnose helper ──────────────────────────────────────────────────
// Runs a battery of fast read-only checks. Used by `/admin/ops`'s
// "Diagnose" button so an admin can see at a glance whether the box
// is actually serving traffic without SSH-ing in.

interface DiagnoseCheck {
  name: string;
  ok: boolean;
  detail: string;
}

async function runDiagnose(): Promise<{
  services: Record<string, string>;
  checks: DiagnoseCheck[];
}> {
  const status = await getStatus();
  const checks: DiagnoseCheck[] = [];

  // Hit the local API health endpoint
  try {
    const res = await fetch("http://127.0.0.1:3001/api/health", {
      signal: AbortSignal.timeout(3_000),
    });
    const body = await res.text();
    checks.push({
      name: "api-health",
      ok: res.ok && body.includes('"status":"ok"'),
      detail: `HTTP ${res.status}`,
    });
  } catch (err) {
    checks.push({
      name: "api-health",
      ok: false,
      detail: err instanceof Error ? err.message : "fetch failed",
    });
  }

  // Hit the local web origin
  try {
    const res = await fetch("http://127.0.0.1:3000/", {
      signal: AbortSignal.timeout(3_000),
    });
    checks.push({
      name: "web-origin",
      ok: res.ok,
      detail: `HTTP ${res.status}`,
    });
  } catch (err) {
    checks.push({
      name: "web-origin",
      ok: false,
      detail: err instanceof Error ? err.message : "fetch failed",
    });
  }

  // Confirm services are active
  for (const [svc, state] of Object.entries(status.services)) {
    checks.push({
      name: `systemd-${svc}`,
      ok: state === "active",
      detail: state,
    });
  }

  return { services: status.services, checks };
}

// ── Server ───────────────────────────────────────────────────────────

Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",

  async fetch(req) {
    const { pathname } = new URL(req.url);
    const method = req.method;

    if (pathname === "/health" && method === "GET") {
      return json({ ok: true, pid: process.pid });
    }

    if (!authorised(req)) {
      return json({ ok: false, error: "unauthorized" }, 401);
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

    if (pathname === "/env-vars" && method === "GET") {
      const map = readEnvMap();
      const vars = Array.from(map.entries()).map(([key, value]) => ({
        key,
        hint: valueHint(value),
        set: true,
      }));
      return json({ ok: true, vars });
    }

    if (pathname === "/env-vars" && method === "PUT") {
      let body: { key?: string; value?: string };
      try {
        body = await req.json() as { key?: string; value?: string };
      } catch {
        return json({ ok: false, error: "invalid JSON body" }, 400);
      }
      const k = body.key?.trim();
      if (!k || typeof body.value !== "string") {
        return json({ ok: false, error: "key and value required" }, 400);
      }
      const map = readEnvMap();
      map.set(k, body.value);
      writeEnvMap(map);
      return json({ ok: true, key: k, action: map.has(k) ? "updated" : "created" });
    }

    const envVarsDeleteMatch = /^\/env-vars\/([^/]+)$/.exec(pathname);
    if (envVarsDeleteMatch && method === "DELETE") {
      const key = decodeURIComponent(envVarsDeleteMatch[1] ?? "");
      const map = readEnvMap();
      if (!map.has(key)) {
        return json({ ok: false, error: "key not found" }, 404);
      }
      map.delete(key);
      writeEnvMap(map);
      return json({ ok: true, key, action: "deleted" });
    }

    if (pathname === "/git/log" && method === "GET") {
      const url = new URL(req.url);
      const limit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
      try {
        const commits = await getGitLog(Number.isFinite(limit) ? limit : 20);
        return json({ ok: true, commits });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "git log failed";
        return json({ ok: false, error: msg }, 500);
      }
    }

    if (pathname === "/git/drift" && method === "GET") {
      try {
        const drift = await getGitDrift();
        return json({ ok: true, ...drift });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "git drift failed";
        return json({ ok: false, error: msg }, 500);
      }
    }

    if (pathname === "/diagnose" && method === "GET") {
      try {
        const result = await runDiagnose();
        return json({ ok: true, ...result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "diagnose failed";
        return json({ ok: false, error: msg }, 500);
      }
    }

    return json({ ok: false, error: "not found" }, 404);
  },
});

console.info(`[deploy-agent] Listening on http://127.0.0.1:${PORT}`);
console.info(`[deploy-agent] APP_DIR=${APP_DIR}`);
