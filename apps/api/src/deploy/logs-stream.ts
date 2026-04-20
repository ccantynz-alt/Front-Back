// ── BLK-009 Deployment Logs SSE Stream ─────────────────────────────
// Server-Sent Events endpoint for live deployment log tailing. The
// build-runner writes rows into the `deployment_logs` table as a build
// progresses; this stream replays existing rows and then polls for new
// ones on a 1s tick until the deployment reaches a terminal state.
//
// Endpoint: GET /api/deployments/:id/logs/stream
// Auth:    ?token=<session-token> query param (EventSource cannot set
//          Authorization headers) OR Authorization: Bearer <token>
//          for non-browser consumers. Tokens are validated against
//          `sessions` + the caller must own the parent project.
//
// Event shape (per SSE frame):
//   event: log
//   data:  {"id":"...","stream":"stdout"|"stderr"|"event","line":"...",
//           "timestamp":"2026-04-18T12:00:00.000Z"}
//
// Control frames:
//   event: status        → {"status":"building"|"deploying"|...}
//   event: end           → {"status":"live"|"failed"|"rolled_back"|"cancelled"}
//   event: error         → {"error":"..."}

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { and, asc, eq, gt } from "drizzle-orm";
import {
  deployments,
  deploymentLogs,
  projects,
  db as defaultDb,
} from "@back-to-the-future/db";
import { validateSession } from "../auth/session";

// ── Types ────────────────────────────────────────────────────────────

type Database = typeof defaultDb;

type TerminalStatus = "live" | "failed" | "rolled_back" | "cancelled";

const TERMINAL_STATUSES: ReadonlySet<TerminalStatus> = new Set<TerminalStatus>([
  "live",
  "failed",
  "rolled_back",
  "cancelled",
]);

function isTerminal(status: string): status is TerminalStatus {
  return TERMINAL_STATUSES.has(status as TerminalStatus);
}

// ── Dependency seam (makes the handler testable without a real DB) ──

export interface LogsStreamDeps {
  readonly db: Database;
  /** Validate a session token → userId, or null. */
  readonly validateSession: (token: string, db: Database) => Promise<string | null>;
  /** Poll interval in milliseconds (default 1000). */
  readonly pollIntervalMs?: number;
  /** Safety cap on stream duration in ms (default 1h). */
  readonly maxDurationMs?: number;
}

const DEFAULT_POLL_MS = 1_000;
const DEFAULT_MAX_DURATION_MS = 60 * 60 * 1_000;

// ── App factory ──────────────────────────────────────────────────────

export function createLogsStreamApp(deps: LogsStreamDeps): Hono {
  const app = new Hono();
  const pollMs = deps.pollIntervalMs ?? DEFAULT_POLL_MS;
  const maxMs = deps.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;

  app.get("/deployments/:id/logs/stream", async (c) => {
    const deploymentId = c.req.param("id");
    if (!deploymentId || !isUuid(deploymentId)) {
      return c.json({ error: "Invalid deployment id." }, 400);
    }

    // Accept token via `?token=` OR `Authorization: Bearer ...`. EventSource
    // cannot set headers so browser clients always use the query param.
    const queryToken = c.req.query("token");
    const authHeader = c.req.header("Authorization");
    const bearerToken =
      authHeader && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : null;
    const token = queryToken && queryToken.length > 0 ? queryToken : bearerToken;
    if (!token) {
      return c.json({ error: "Missing session token." }, 401);
    }

    const userId = await deps.validateSession(token, deps.db);
    if (!userId) {
      return c.json({ error: "Invalid or expired session." }, 401);
    }

    // Verify deployment exists and caller owns the parent project.
    const deploymentRows = await deps.db
      .select({
        id: deployments.id,
        projectId: deployments.projectId,
        status: deployments.status,
      })
      .from(deployments)
      .where(eq(deployments.id, deploymentId))
      .limit(1);
    const deployment = deploymentRows[0];
    if (!deployment) {
      return c.json({ error: "Deployment not found." }, 404);
    }

    const projectRows = await deps.db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, deployment.projectId), eq(projects.userId, userId)))
      .limit(1);
    if (projectRows.length === 0) {
      // Do not leak existence: same response as missing deployment.
      return c.json({ error: "Deployment not found." }, 404);
    }

    return streamSSE(c, async (stream) => {
      const started = Date.now();
      let lastTimestamp = new Date(0);
      let lastStatus = deployment.status;

      // Emit initial status frame.
      await stream.writeSSE({
        event: "status",
        data: JSON.stringify({ status: lastStatus }),
        id: String(Date.now()),
      });

      // Replay any pre-existing log rows.
      const initialLogs = await deps.db
        .select({
          id: deploymentLogs.id,
          stream: deploymentLogs.stream,
          line: deploymentLogs.line,
          timestamp: deploymentLogs.timestamp,
        })
        .from(deploymentLogs)
        .where(eq(deploymentLogs.deploymentId, deploymentId))
        .orderBy(asc(deploymentLogs.timestamp));
      for (const row of initialLogs) {
        await stream.writeSSE({
          event: "log",
          data: JSON.stringify({
            id: row.id,
            stream: row.stream,
            line: row.line,
            timestamp: row.timestamp.toISOString(),
          }),
          id: row.id,
        });
        if (row.timestamp.getTime() > lastTimestamp.getTime()) {
          lastTimestamp = row.timestamp;
        }
      }

      // If the deployment is already terminal, drain and close.
      if (isTerminal(lastStatus)) {
        await stream.writeSSE({
          event: "end",
          data: JSON.stringify({ status: lastStatus }),
          id: String(Date.now()),
        });
        return;
      }

      // Tail loop — poll for new rows + status flips every `pollMs`.
      while (true) {
        if (Date.now() - started > maxMs) {
          await stream.writeSSE({
            event: "end",
            data: JSON.stringify({ status: "timeout" }),
            id: String(Date.now()),
          });
          return;
        }

        await sleep(pollMs);

        // Pull new log rows with timestamp > lastTimestamp.
        const newLogs = await deps.db
          .select({
            id: deploymentLogs.id,
            stream: deploymentLogs.stream,
            line: deploymentLogs.line,
            timestamp: deploymentLogs.timestamp,
          })
          .from(deploymentLogs)
          .where(
            and(
              eq(deploymentLogs.deploymentId, deploymentId),
              gt(deploymentLogs.timestamp, lastTimestamp),
            ),
          )
          .orderBy(asc(deploymentLogs.timestamp));
        for (const row of newLogs) {
          await stream.writeSSE({
            event: "log",
            data: JSON.stringify({
              id: row.id,
              stream: row.stream,
              line: row.line,
              timestamp: row.timestamp.toISOString(),
            }),
            id: row.id,
          });
          if (row.timestamp.getTime() > lastTimestamp.getTime()) {
            lastTimestamp = row.timestamp;
          }
        }

        // Re-check deployment status for terminal transitions.
        const latestRows = await deps.db
          .select({ status: deployments.status })
          .from(deployments)
          .where(eq(deployments.id, deploymentId))
          .limit(1);
        const latest = latestRows[0];
        if (!latest) {
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({ error: "Deployment disappeared." }),
            id: String(Date.now()),
          });
          return;
        }
        if (latest.status !== lastStatus) {
          lastStatus = latest.status;
          await stream.writeSSE({
            event: "status",
            data: JSON.stringify({ status: lastStatus }),
            id: String(Date.now()),
          });
        }

        if (isTerminal(latest.status)) {
          await stream.writeSSE({
            event: "end",
            data: JSON.stringify({ status: latest.status }),
            id: String(Date.now()),
          });
          return;
        }
      }
    });
  });

  return app;
}

// ── Default app (wired with the real db + session validator) ────────

export const deploymentLogsStreamApp = createLogsStreamApp({
  db: defaultDb,
  validateSession,
});

// ── Helpers ─────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
