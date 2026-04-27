// ── Sentinel - 24/7 Competitive Intelligence Engine ─────────────────
// Monitors competitors, analyzes threats, and alerts the team.
// Runs as a long-lived Bun process with an HTTP health endpoint.

import { githubReleasesCollector } from "./collectors/github-releases";
import { githubCommitsCollector } from "./collectors/github-commits";
import { npmRegistryCollector } from "./collectors/npm-registry";
import { hackernewsCollector } from "./collectors/hackernews";
import { arxivCollector } from "./collectors/arxiv";
import { runDeadMansSwitch } from "./dead-mans-switch";
import { getItemCount } from "./storage/intelligence-store";
import { sendDailyDigest } from "./digest/daily-digest";
import { runCycle } from "./runner";
import type { Collector } from "./collectors/types";

// ── Configuration ───────────────────────────────────────────────────

const collectors: Collector[] = [
  githubReleasesCollector,
  githubCommitsCollector,
  npmRegistryCollector,
  hackernewsCollector,
  arxivCollector,
];

const startedAt = new Date();
let lastCollectionAt: string | null = null;
let totalCollections = 0;
let totalItemsCollected = 0;
let lastDigestAt: string | null = null;

// ── Collection Orchestrator ─────────────────────────────────────────
// Delegates to the shared runner in src/runner.ts so the long-lived
// scheduler and the one-shot CLI share a single code path.

async function runAllCollectors(): Promise<void> {
  const result = await runCycle(collectors, { emitAlerts: true });
  lastCollectionAt = result.finishedAt;
  totalCollections += 1;
  totalItemsCollected += result.itemsStored;
  console.info(
    `[sentinel] cycle: ${result.itemsCollected} collected, ${result.itemsStored} stored, ${result.threats} threats, ${result.opportunities} opportunities, ${result.techSignals} tech signals in ${result.durationMs}ms`,
  );
  if (result.collectorErrors.length > 0) {
    console.warn(`[sentinel] collector errors: ${result.collectorErrors.join("; ")}`);
  }
}

async function runSingleCollector(collector: Collector): Promise<void> {
  const result = await runCycle([collector], { emitAlerts: true });
  totalItemsCollected += result.itemsStored;
  if (result.collectorErrors.length > 0) {
    console.warn(
      `[sentinel] ${collector.name} errors: ${result.collectorErrors.join("; ")}`,
    );
  }
}

// ── Health Endpoint ─────────────────────────────────────────────────

function startHealthServer(): void {
  const port = Number(process.env["SENTINEL_PORT"]) || 3002;

  Bun.serve({
    port,
    fetch(req: Request): Response {
      const url = new URL(req.url);

      if (url.pathname === "/health" || url.pathname === "/") {
        return Response.json({
          status: "ok",
          service: "sentinel",
          startedAt: startedAt.toISOString(),
          uptime: Math.round((Date.now() - startedAt.getTime()) / 1000),
          collectors: collectors.map((c) => ({
            name: c.name,
            intervalMs: c.intervalMs,
            cronExpression: c.cronExpression,
          })),
          stats: {
            totalCollections,
            totalItemsCollected,
            storedItems: getItemCount(),
            lastCollectionAt,
            lastDigestAt,
          },
        });
      }

      if (url.pathname === "/digest") {
        // Trigger digest manually
        void sendDailyDigest().then((d) => {
          lastDigestAt = d.generatedAt;
        });
        return Response.json({ status: "digest_triggered" });
      }

      return Response.json({ error: "Not found" }, { status: 404 });
    },
  });

  console.info(`[sentinel] Health endpoint running on http://localhost:${port}/health`);
}

// ── Scheduler ───────────────────────────────────────────────────────

function startScheduler(): void {
  const now = new Date().toISOString();
  console.info(`[sentinel] ═══════════════════════════════════════════════`);
  console.info(`[sentinel] Sentinel Competitive Intelligence System`);
  console.info(`[sentinel] Started at: ${now}`);
  console.info(`[sentinel] Monitoring ${collectors.length} sources:`);
  for (const collector of collectors) {
    const intervalMin = Math.round(collector.intervalMs / 60_000);
    console.info(`[sentinel]   - ${collector.name} (every ${intervalMin}m, cron: ${collector.cronExpression})`);
  }
  console.info(`[sentinel] ═══════════════════════════════════════════════`);

  // Start health endpoint
  startHealthServer();

  // Run all collectors immediately on start
  void runAllCollectors();

  // Schedule each collector independently. Each tick delegates to
  // runSingleCollector which internally uses the shared runner.
  for (const collector of collectors) {
    setInterval(() => {
      void runSingleCollector(collector);
    }, collector.intervalMs);
  }

  // Dead man's switch check every 30 minutes
  setInterval(() => {
    void runDeadMansSwitch();
  }, 30 * 60 * 1000);

  // Daily digest every 24 hours (also run first digest 1 hour after start)
  setTimeout(() => {
    void sendDailyDigest().then((d) => {
      lastDigestAt = d.generatedAt;
    });
  }, 60 * 60 * 1000);

  setInterval(() => {
    void sendDailyDigest().then((d) => {
      lastDigestAt = d.generatedAt;
    });
  }, 24 * 60 * 60 * 1000);

  console.info(`[sentinel] All collectors scheduled. System is active.`);
}

startScheduler();
