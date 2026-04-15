// BLK-019 Build Theatre — SSE stream that tails the log + status of a
// single run in real time, so the /ops UI shows Vercel-style live logs
// without resorting to a WebSocket.

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { db } from "@back-to-the-future/db";
import { getRun, tailLogs } from "@back-to-the-future/theatre";

const theatreSseApp = new Hono();

const RunIdParam = z.string().uuid();

theatreSseApp.get("/theatre/runs/:runId/stream", async (c) => {
  const parse = RunIdParam.safeParse(c.req.param("runId"));
  if (!parse.success) {
    return c.json({ error: "Invalid run ID" }, 400);
  }
  const runId = parse.data;

  return streamSSE(
    c,
    async (stream) => {
      let lastLogSeq = 0;
      let lastStatus: string | null = null;
      const started = Date.now();
      const MAX_DURATION_MS = 60 * 60 * 1000; // 1 hour safety cap

      while (true) {
        const run = await getRun(db, runId);
        if (!run) {
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({ error: "Run not found" }),
            id: String(Date.now()),
          });
          return;
        }

        // Emit status change when it flips.
        if (run.status !== lastStatus) {
          await stream.writeSSE({
            event: "status",
            data: JSON.stringify({
              status: run.status,
              error: run.error,
              endedAt: run.endedAt?.toISOString() ?? null,
              steps: run.steps.map((s) => ({
                id: s.id,
                seq: s.seq,
                name: s.name,
                status: s.status,
                exitCode: s.exitCode,
                error: s.error,
              })),
            }),
            id: String(Date.now()),
          });
          lastStatus = run.status;
        }

        // Emit new log lines.
        const logs = await tailLogs(db, runId, lastLogSeq, 500);
        for (const log of logs) {
          await stream.writeSSE({
            event: "log",
            data: JSON.stringify({
              seq: log.seq,
              stepId: log.stepId,
              stream: log.stream,
              line: log.line,
              timestamp: log.timestamp.toISOString(),
            }),
            id: String(log.seq),
          });
          lastLogSeq = log.seq;
        }

        // Stop when the run is in a terminal state and we've drained logs.
        if (
          run.status === "succeeded" ||
          run.status === "failed" ||
          run.status === "cancelled"
        ) {
          await stream.writeSSE({
            event: "end",
            data: JSON.stringify({ status: run.status }),
            id: String(Date.now()),
          });
          return;
        }

        // Safety: do not hold a connection open forever.
        if (Date.now() - started > MAX_DURATION_MS) {
          await stream.writeSSE({
            event: "end",
            data: JSON.stringify({ status: "timeout" }),
            id: String(Date.now()),
          });
          return;
        }

        await new Promise((r) => setTimeout(r, 500));
      }
    },
    async (_error, stream) => {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ error: "Stream error" }),
        id: String(Date.now()),
      });
    },
  );
});

export { theatreSseApp };
