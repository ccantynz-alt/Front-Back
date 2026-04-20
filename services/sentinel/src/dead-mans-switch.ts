import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { type AlertMessage, sendSlackAlert, sendDiscordAlert } from "./alerts/types";

interface CollectorStatus {
  name: string;
  lastSuccess: number;
  expectedIntervalMs: number;
}

const collectorStatuses = new Map<string, CollectorStatus>();

/**
 * Location of the liveness timestamp file. External monitors (systemd
 * timer health checks, alertmanager probes) read this file's mtime to
 * confirm Sentinel ran recently. Absence or staleness == dead switch.
 *
 * Kept in data/ alongside intelligence.json so the systemd unit only
 * needs one ReadWritePaths entry.
 */
function getDefaultLastRunPath(): string {
  const baseDir = (import.meta as { dir?: string }).dir ?? process.cwd();
  return join(baseDir, "..", "data", ".last-run");
}

let lastRunPath = getDefaultLastRunPath();

/** Override the last-run file path (used by tests for isolation). */
export function setLastRunPath(path: string): void {
  lastRunPath = path;
}

/**
 * Write an ISO-8601 UTC timestamp to the liveness file. Called at the
 * end of every successful `runCycle`. A missing or stale `.last-run`
 * file is the signal to external monitors that Sentinel has gone dark.
 *
 * Failures here are logged but never thrown — a disk write error must
 * not prevent the daemon from completing its cycle.
 */
export function touchLastRun(now: Date = new Date()): { path: string; timestamp: string } {
  const timestamp = now.toISOString();
  try {
    const dir = dirname(lastRunPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(lastRunPath, `${timestamp}\n`, "utf8");
  } catch (err) {
    console.error(`[sentinel:dead-mans-switch] failed to touch ${lastRunPath}:`, err);
  }
  return { path: lastRunPath, timestamp };
}

export function reportSuccess(name: string, expectedIntervalMs: number): void {
  collectorStatuses.set(name, {
    name,
    lastSuccess: Date.now(),
    expectedIntervalMs,
  });
}

export function checkDeadMansSwitch(): string[] {
  const now = Date.now();
  const deadCollectors: string[] = [];

  for (const [name, status] of collectorStatuses) {
    const threshold = status.expectedIntervalMs * 2;
    if (now - status.lastSuccess > threshold) {
      deadCollectors.push(name);
    }
  }

  return deadCollectors;
}

export async function runDeadMansSwitch(): Promise<void> {
  const dead = checkDeadMansSwitch();

  if (dead.length > 0) {
    const alert: AlertMessage = {
      priority: "critical",
      title: `DEAD MAN'S SWITCH: ${dead.length} collector(s) stopped reporting`,
      body: `The following collectors have not reported in 2x their expected interval:\n${dead.map((d) => `- ${d}`).join("\n")}`,
      timestamp: new Date().toISOString(),
    };

    console.error(`[sentinel:dead-mans-switch] ALERT: ${dead.join(", ")}`);
    await sendSlackAlert(alert);
    await sendDiscordAlert(alert);
  }
}
