// ── Daily Digest Generator ──────────────────────────────────────────
// Summarizes all intelligence items collected in the last 24 hours.
// Produces a structured digest suitable for Slack/Discord alerts.

import type { IntelligenceItem, Severity } from "../collectors/types";
import { getItemsSince, type StoredEntry } from "../storage/intelligence-store";
import { analyzeThreats, type ThreatAnalysis } from "../analyzers/threat-analyzer";
import { findOpportunities, type Opportunity } from "../analyzers/opportunity-finder";
import { scoutTech, type TechScoutResult } from "../analyzers/tech-scout";
import { type AlertMessage, sendSlackAlert, sendDiscordAlert } from "../alerts/types";

export interface DailyDigest {
  generatedAt: string;
  periodStart: string;
  periodEnd: string;
  totalItems: number;
  bySeverity: Record<Severity, number>;
  bySource: Record<string, number>;
  threats: ThreatAnalysis[];
  opportunities: Opportunity[];
  techSignals: TechScoutResult[];
  summary: string;
}

/** Generate a digest for items collected in the last `hours` hours. Default: 24. */
export function generateDigest(hours: number = 24): DailyDigest {
  const now = new Date();
  const periodStart = new Date(now.getTime() - hours * 60 * 60 * 1000);
  const recentEntries: StoredEntry[] = getItemsSince(periodStart.toISOString());
  const items: IntelligenceItem[] = recentEntries.map((e) => e.item);

  const bySeverity: Record<Severity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const bySource: Record<string, number> = {};

  for (const item of items) {
    bySeverity[item.severity]++;
    bySource[item.source] = (bySource[item.source] ?? 0) + 1;
  }

  const threats = analyzeThreats(items);
  const opportunities = findOpportunities(items);
  const techSignals = scoutTech(items);

  const criticalCount = threats.filter(
    (t) => t.threatLevel === "critical" || t.threatLevel === "high",
  ).length;

  const sourceList = Object.entries(bySource)
    .map(([src, count]) => `${src}: ${count}`)
    .join(", ");

  const summary = items.length === 0
    ? `No new intelligence items collected in the last ${hours} hours.`
    : [
        `Collected ${items.length} items from ${Object.keys(bySource).length} source(s) (${sourceList}).`,
        `Severity breakdown: ${bySeverity.critical} critical, ${bySeverity.high} high, ${bySeverity.medium} medium, ${bySeverity.low} low.`,
        `Identified ${threats.length} threats (${criticalCount} high/critical), ${opportunities.length} opportunities, ${techSignals.length} tech signals.`,
      ].join("\n");

  return {
    generatedAt: now.toISOString(),
    periodStart: periodStart.toISOString(),
    periodEnd: now.toISOString(),
    totalItems: items.length,
    bySeverity,
    bySource,
    threats,
    opportunities,
    techSignals,
    summary,
  };
}

/** Generate and send the daily digest via Slack and Discord. */
export async function sendDailyDigest(): Promise<DailyDigest> {
  const digest = generateDigest(24);

  const alert: AlertMessage = {
    priority: "daily",
    title: `Sentinel Daily Digest - ${digest.totalItems} items`,
    body: digest.summary,
    timestamp: digest.generatedAt,
  };

  console.info(`[sentinel:digest] ${digest.summary}`);

  await sendSlackAlert(alert);
  await sendDiscordAlert(alert);

  return digest;
}
