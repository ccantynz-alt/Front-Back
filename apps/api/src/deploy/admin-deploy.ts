/**
 * Admin deploy trigger — POST /api/admin/deploy, GET /api/admin/deploy/status
 *
 * Proxies to the deploy-agent service on localhost:9091. The agent runs as
 * root and handles git pull → bun install → build → systemctl restart.
 *
 * Auth: admin session required (enforced by requireAdmin middleware).
 * Rate: one concurrent deploy at a time (enforced by the agent).
 */

import { Hono } from "hono";
import { requireAdmin } from "../middleware/require-admin";

const AGENT_URL = `http://127.0.0.1:${process.env["DEPLOY_AGENT_PORT"] ?? 9091}`;
const AGENT_SECRET = process.env["DEPLOY_AGENT_SECRET"] ?? "";

function agentHeaders(): HeadersInit {
  return { Authorization: `Bearer ${AGENT_SECRET}` };
}

export const adminDeployApp = new Hono();

// GET /api/admin/deploy/status — service health + current SHA + deploying flag
adminDeployApp.get("/admin/deploy/status", requireAdmin, async (c) => {
  if (!AGENT_SECRET) {
    return c.json({ ok: false, error: "DEPLOY_AGENT_SECRET not configured" }, 503);
  }
  try {
    const res = await fetch(`${AGENT_URL}/status`, {
      headers: agentHeaders(),
      signal: AbortSignal.timeout(5_000),
    });
    const body = await res.json() as Record<string, unknown>;
    return c.json(body, res.status as 200 | 503);
  } catch {
    return c.json({ ok: false, error: "deploy agent unreachable" }, 503);
  }
});

// POST /api/admin/deploy — full deploy (git pull → build → restart), SSE stream
adminDeployApp.post("/admin/deploy", requireAdmin, async (c) => {
  if (!AGENT_SECRET) {
    return c.json({ ok: false, error: "DEPLOY_AGENT_SECRET not configured" }, 503);
  }
  try {
    const res = await fetch(`${AGENT_URL}/deploy`, {
      method: "POST",
      headers: agentHeaders(),
      signal: AbortSignal.timeout(600_000), // 10-min max for build
    });
    // Pipe the SSE stream straight through to the browser
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return c.json({ ok: false, error: `deploy agent unreachable: ${msg}` }, 503);
  }
});

// POST /api/admin/restart — restart services only (no build)
adminDeployApp.post("/admin/restart", requireAdmin, async (c) => {
  if (!AGENT_SECRET) {
    return c.json({ ok: false, error: "DEPLOY_AGENT_SECRET not configured" }, 503);
  }
  try {
    const res = await fetch(`${AGENT_URL}/restart`, {
      method: "POST",
      headers: agentHeaders(),
      signal: AbortSignal.timeout(60_000),
    });
    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    return c.json({ ok: false, error: `deploy agent unreachable: ${msg}` }, 503);
  }
});

// ── Env var management ───────────────────────────────────────────────
// Proxies to the deploy agent's /env-vars endpoints so the admin UI can
// manage the platform .env file without SSH access.

// GET /api/admin/env-vars — list of { key, hint } (values never returned)
adminDeployApp.get("/admin/env-vars", requireAdmin, async (c) => {
  if (!AGENT_SECRET) {
    return c.json({ ok: false, error: "DEPLOY_AGENT_SECRET not configured" }, 503);
  }
  try {
    const res = await fetch(`${AGENT_URL}/env-vars`, {
      headers: agentHeaders(),
      signal: AbortSignal.timeout(5_000),
    });
    const body = await res.json() as Record<string, unknown>;
    return c.json(body, res.status as 200 | 503);
  } catch {
    return c.json({ ok: false, error: "deploy agent unreachable" }, 503);
  }
});

// PUT /api/admin/env-vars — set a key=value
adminDeployApp.put("/admin/env-vars", requireAdmin, async (c) => {
  if (!AGENT_SECRET) {
    return c.json({ ok: false, error: "DEPLOY_AGENT_SECRET not configured" }, 503);
  }
  let body: { key?: string; value?: string };
  try {
    body = await c.req.json() as { key?: string; value?: string };
  } catch {
    return c.json({ ok: false, error: "invalid JSON body" }, 400);
  }
  if (!body.key || typeof body.value !== "string") {
    return c.json({ ok: false, error: "key and value are required" }, 400);
  }
  try {
    const res = await fetch(`${AGENT_URL}/env-vars`, {
      method: "PUT",
      headers: { ...agentHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ key: body.key, value: body.value }),
      signal: AbortSignal.timeout(5_000),
    });
    const resBody = await res.json() as Record<string, unknown>;
    return c.json(resBody, res.status as 200 | 400 | 503);
  } catch {
    return c.json({ ok: false, error: "deploy agent unreachable" }, 503);
  }
});

// DELETE /api/admin/env-vars/:key — remove a key
adminDeployApp.delete("/admin/env-vars/:key", requireAdmin, async (c) => {
  if (!AGENT_SECRET) {
    return c.json({ ok: false, error: "DEPLOY_AGENT_SECRET not configured" }, 503);
  }
  const key = c.req.param("key");
  if (!key) {
    return c.json({ ok: false, error: "key param required" }, 400);
  }
  try {
    const res = await fetch(`${AGENT_URL}/env-vars/${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: agentHeaders(),
      signal: AbortSignal.timeout(5_000),
    });
    const resBody = await res.json() as Record<string, unknown>;
    return c.json(resBody, res.status as 200 | 404 | 503);
  } catch {
    return c.json({ ok: false, error: "deploy agent unreachable" }, 503);
  }
});
