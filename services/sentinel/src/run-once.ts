// ── Sentinel One-Shot CLI ───────────────────────────────────────────
// Runs a single collection cycle and exits. Useful for:
//   - Bootstrapping the intelligence store on a fresh install
//   - Cron-triggered runs in CI or external schedulers
//   - Manual "refresh the feed" from a developer terminal
//   - Smoke testing the collector pipeline
//
// Usage: bun run services/sentinel/src/run-once.ts
// Exits 0 on success, 1 if any collector errored.

import { arxivCollector } from "./collectors/arxiv";
import { githubCommitsCollector } from "./collectors/github-commits";
import { githubReleasesCollector } from "./collectors/github-releases";
import { hackernewsCollector } from "./collectors/hackernews";
import { npmRegistryCollector } from "./collectors/npm-registry";
import { runCycle } from "./runner";
import { getItemCount } from "./storage/intelligence-store";
import type { Collector } from "./collectors/types";

const DEFAULT_COLLECTORS: readonly Collector[] = [
  githubReleasesCollector,
  githubCommitsCollector,
  npmRegistryCollector,
  hackernewsCollector,
  arxivCollector,
];

/**
 * Parse CLI flags. Supported:
 *   --collectors=name1,name2   Only run these collectors.
 *   --alerts                   Emit Slack/Discord critical alerts.
 *   --json                     Print the result as a JSON blob.
 */
interface CliFlags {
  collectorNames: string[] | null;
  emitAlerts: boolean;
  jsonOutput: boolean;
}

function parseFlags(argv: readonly string[]): CliFlags {
  let collectorNames: string[] | null = null;
  let emitAlerts = false;
  let jsonOutput = false;
  for (const arg of argv) {
    if (arg.startsWith("--collectors=")) {
      collectorNames = arg
        .slice("--collectors=".length)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    } else if (arg === "--alerts") {
      emitAlerts = true;
    } else if (arg === "--json") {
      jsonOutput = true;
    }
  }
  return { collectorNames, emitAlerts, jsonOutput };
}

function selectCollectors(names: string[] | null): Collector[] {
  if (names === null) return [...DEFAULT_COLLECTORS];
  const byName = new Map(DEFAULT_COLLECTORS.map((c) => [c.name, c]));
  const selected: Collector[] = [];
  for (const name of names) {
    const collector = byName.get(name);
    if (collector === undefined) {
      console.warn(
        `[sentinel:run-once] unknown collector "${name}" — skipping. Known: ${[...byName.keys()].join(", ")}`,
      );
      continue;
    }
    selected.push(collector);
  }
  return selected;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const collectors = selectCollectors(flags.collectorNames);

  if (collectors.length === 0) {
    console.error("[sentinel:run-once] no collectors selected; aborting.");
    process.exit(1);
  }

  if (!flags.jsonOutput) {
    console.log(
      `[sentinel:run-once] running ${collectors.length} collector(s): ${collectors.map((c) => c.name).join(", ")}`,
    );
    console.log(
      `[sentinel:run-once] store currently holds ${getItemCount()} items`,
    );
  }

  const result = await runCycle(collectors, {
    emitAlerts: flags.emitAlerts,
    reportLiveness: true,
  });

  if (flags.jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("[sentinel:run-once] ────────────────────────────────────");
    console.log(`[sentinel:run-once] collectors run:   ${result.collectorsRun}`);
    console.log(
      `[sentinel:run-once] succeeded:        ${result.collectorsSucceeded}`,
    );
    console.log(`[sentinel:run-once] items collected:  ${result.itemsCollected}`);
    console.log(`[sentinel:run-once] items stored new: ${result.itemsStored}`);
    console.log(`[sentinel:run-once] threats:          ${result.threats}`);
    console.log(`[sentinel:run-once] opportunities:    ${result.opportunities}`);
    console.log(`[sentinel:run-once] tech signals:     ${result.techSignals}`);
    console.log(`[sentinel:run-once] duration:         ${result.durationMs}ms`);
    if (result.collectorErrors.length > 0) {
      console.warn(`[sentinel:run-once] errors:`);
      for (const err of result.collectorErrors) {
        console.warn(`  - ${err}`);
      }
    }
    console.log(
      `[sentinel:run-once] store now holds ${getItemCount()} items total`,
    );
  }

  const failed = result.collectorsSucceeded < result.collectorsRun;
  process.exit(failed ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error("[sentinel:run-once] fatal:", err);
  process.exit(1);
});
