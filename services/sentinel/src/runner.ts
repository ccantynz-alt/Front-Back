// ── Sentinel Runner ─────────────────────────────────────────────────
// Extracted orchestration logic shared between the long-lived server
// (index.ts) and the one-shot CLI (run-once.ts). Runs collectors in
// parallel, persists results to the intelligence store, drives the
// analyzer suite, and fires critical alerts.
//
// This module is network-agnostic: consumers pass in whatever
// Collector instances they want. Tests pass fakes; production passes
// the real GitHub/npm/HN/ArXiv collectors.

import { analyzeThreats } from "./analyzers/threat-analyzer";
import { findOpportunities } from "./analyzers/opportunity-finder";
import { scoutTech } from "./analyzers/tech-scout";
import {
  type AlertMessage,
  sendSlackAlert,
  sendDiscordAlert,
} from "./alerts/types";
import { reportSuccess } from "./dead-mans-switch";
import { storeItems } from "./storage/intelligence-store";
import type {
  Collector,
  CollectorResult,
  IntelligenceItem,
} from "./collectors/types";

export interface RunCycleOptions {
  /**
   * Emit critical threat alerts via Slack + Discord. Disabled in
   * tests and one-shot CLI unless explicitly turned on.
   */
  emitAlerts?: boolean;
  /**
   * Called after each collector finishes. Useful for progress UIs
   * and structured logging sinks.
   */
  onCollectorResult?: (result: CollectorResult) => void;
  /** Override for testing. Defaults to console. */
  logger?: Pick<Console, "log" | "warn" | "error">;
  /**
   * Report success to the dead-man's switch. Defaults to true in
   * production; disabled in tests to keep the switch file clean.
   */
  reportLiveness?: boolean;
}

export interface RunCycleResult {
  itemsCollected: number;
  itemsStored: number;
  collectorsRun: number;
  collectorsSucceeded: number;
  collectorErrors: string[];
  threats: number;
  opportunities: number;
  techSignals: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

/**
 * Run a single collection cycle: invoke every collector, persist
 * results, run analyzers, optionally dispatch critical alerts.
 * Never throws — errors are captured in the result's
 * `collectorErrors` field so callers can report them structurally.
 */
export async function runCycle(
  collectors: readonly Collector[],
  opts: RunCycleOptions = {},
): Promise<RunCycleResult> {
  const logger = opts.logger ?? console;
  const startedAt = new Date().toISOString();
  const startMs = performance.now();
  const allItems: IntelligenceItem[] = [];
  const collectorErrors: string[] = [];
  let collectorsSucceeded = 0;

  const settled = await Promise.allSettled(
    collectors.map(async (collector) => {
      logger.log(`[sentinel:runner] running ${collector.name}`);
      try {
        const result = await collector.collect();
        if (result.success && opts.reportLiveness !== false) {
          reportSuccess(collector.name, collector.intervalMs);
        }
        opts.onCollectorResult?.(result);
        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : `Unknown error in ${collector.name}`;
        logger.error(`[sentinel:runner] ${collector.name} threw:`, err);
        return {
          source: collector.name,
          items: [],
          collectedAt: new Date().toISOString(),
          success: false,
          error: message,
          durationMs: 0,
        } satisfies CollectorResult;
      }
    }),
  );

  for (const outcome of settled) {
    if (outcome.status !== "fulfilled") continue;
    const result = outcome.value;
    allItems.push(...result.items);
    if (result.success) {
      collectorsSucceeded += 1;
    } else if (result.error !== undefined) {
      collectorErrors.push(`${result.source}: ${result.error}`);
    }
  }

  const itemsStored = allItems.length > 0 ? storeItems(allItems) : 0;
  const threats = analyzeThreats(allItems);
  const opportunities = findOpportunities(allItems);
  const techSignals = scoutTech(allItems);

  if (opts.emitAlerts === true) {
    for (const threat of threats) {
      if (threat.threatLevel !== "critical" && threat.threatLevel !== "high") {
        continue;
      }
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

  const finishedAt = new Date().toISOString();
  const durationMs = Math.round(performance.now() - startMs);
  return {
    itemsCollected: allItems.length,
    itemsStored,
    collectorsRun: collectors.length,
    collectorsSucceeded,
    collectorErrors,
    threats: threats.length,
    opportunities: opportunities.length,
    techSignals: techSignals.length,
    startedAt,
    finishedAt,
    durationMs,
  };
}
