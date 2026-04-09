// ── Sentinel - 24/7 Competitive Intelligence Engine ─────────────────
// Monitors competitors, analyzes threats, and alerts the team.
// Runs as a long-lived Bun process with an HTTP health endpoint.

import { githubReleasesCollector } from "./collectors/github-releases";
import { githubCommitsCollector } from "./collectors/github-commits";
import { npmRegistryCollector } from "./collectors/npm-registry";
import { hackernewsCollector } from "./collectors/hackernews";
import { arxivCollector } from "./collectors/arxiv";
import { analyzeThreats } from "./analyzers/threat-analyzer";
import { findOpportunities } from "./analyzers/opportunity-finder";
import { scoutTech } from "./analyzers/tech-scout";
import { type AlertMessage, sendSlackAlert, sendDiscordAlert } from "./alerts/types";
import { reportSuccess, runDeadMansSwitch } from "./dead-mans-switch";
import { storeItems, getItemCount } from "./storage/intelligence-store";
import { sendDailyDigest } from "./digest/daily-digest";
import type { Collector, CollectorResult, IntelligenceItem } from "./collectors/types";

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

// ── Collector Runner ────────────────────────────────────────────────

async function runCollector(collector: Collector): Promise<CollectorResult> {
  console.log(`[sentinel] Running collector: ${collector.name}`);
  try {
    const result = await collector.collect();
    if (result.success) {
      reportSuccess(collector.name, collector.intervalMs);
    }
    console.log(
      `[sentinel] ${collector.name}: ${result.items.length} items in ${result.durationMs}ms${result.error ? ` (errors: ${result.error})` : ""}`,
    );
    return result;
  } catch (err) {
    console.error(`[sentinel] ${collector.name} failed:`, err);
    return {
      source: collector.name,
      items: [],
      collectedAt: new Date().toISOString(),
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
      durationMs: 0,
    };
  }
}

// ── Intelligence Processing ─────────────────────────────────────────

async function processIntelligence(items: IntelligenceItem[]): Promise<void> {
  if (items.length === 0) return;

  // Persist to store
  const newCount = storeItems(items);
  totalItemsCollected += newCount;

  const threats = analyzeThreats(items);
  const opportunities = findOpportunities(items);
  const techScouting = scoutTech(items);

  console.log(
    `[sentinel] Analysis: ${threats.length} threats, ${opportunities.length} opportunities, ${techScouting.length} tech signals (${newCount} new items stored)`,
  );

  // Send critical alerts immediately
  for (const threat of threats) {
    if (threat.threatLevel === "critical" || threat.threatLevel === "high") {
      const alert: AlertMessage = {
        priority: "critical",
        title: threat.item.title,
        body: `${threat.impact}\n\nRecommendation: ${threat.recommendation}`,
        url: threat.item.url,
        timestamp: new Date().toISOString(),
      };
      await sendSlackAlert(alert);
      await sendDiscordAlert(alert);
    }
  }
}

// ── Collection Orchestrator ─────────────────────────────────────────

async function runAllCollectors(): Promise<void> {
  const results = await Promise.allSettled(collectors.map(runCollector));
  const allItems: IntelligenceItem[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      allItems.push(...result.value.items);
    }
  }

  lastCollectionAt = new Date().toISOString();
  totalCollections++;

  await processIntelligence(allItems);
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

  console.log(`[sentinel] Health endpoint running on http://localhost:${port}/health`);
}

// ── Scheduler ───────────────────────────────────────────────────────

function startScheduler(): void {
  const now = new Date().toISOString();
  console.log(`[sentinel] ═══════════════════════════════════════════════`);
  console.log(`[sentinel] Sentinel Competitive Intelligence System`);
  console.log(`[sentinel] Started at: ${now}`);
  console.log(`[sentinel] Monitoring ${collectors.length} sources:`);
  for (const collector of collectors) {
    const intervalMin = Math.round(collector.intervalMs / 60_000);
    console.log(`[sentinel]   - ${collector.name} (every ${intervalMin}m, cron: ${collector.cronExpression})`);
  }
  console.log(`[sentinel] ═══════════════════════════════════════════════`);

  // Start health endpoint
  startHealthServer();

  // Run all collectors immediately on start
  void runAllCollectors();

  // Schedule each collector independently
  for (const collector of collectors) {
    setInterval(() => {
      void runCollector(collector).then((result) => {
        if (result.items.length > 0) {
          void processIntelligence(result.items);
        }
      });
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

  console.log(`[sentinel] All collectors scheduled. System is active.`);
}

startScheduler();
