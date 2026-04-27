// ── Health Monitor ────────────────────────────────────────────────────
// Runs every 30 seconds, checks all deployed apps via HTTP health
// endpoints, and auto-restarts unhealthy processes.

import { listApps } from "./deployer";
import { restartProcess, isProcessRunning } from "./process-manager";

const HEALTH_INTERVAL_MS = 30_000;
const HEALTH_TIMEOUT_MS = 5_000;

let monitorInterval: ReturnType<typeof setInterval> | null = null;

export function startHealthMonitor(): void {
  if (monitorInterval) {
    console.warn("[HEALTH] Monitor already running");
    return;
  }

  console.info("[HEALTH] Starting health monitor (30s interval)");

  monitorInterval = setInterval(async () => {
    try {
      const apps = await listApps();

      for (const app of apps) {
        const running = isProcessRunning(app.name);

        if (!running && app.status === "running") {
          console.error(`[HEALTH] ${app.name} process died — attempting restart`);
          try {
            restartProcess(app.name);
            console.info(`[HEALTH] ${app.name} restart initiated`);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "unknown error";
            console.error(`[HEALTH] ${app.name} restart failed: ${msg}`);
          }
          continue;
        }

        if (running && app.healthUrl) {
          try {
            const res = await fetch(app.healthUrl, {
              signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
            });
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}`);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "unknown error";
            console.error(
              `[HEALTH] ${app.name} health check failed (${msg}) — restarting`,
            );
            try {
              restartProcess(app.name);
              console.info(`[HEALTH] ${app.name} restart initiated after health failure`);
            } catch (restartErr: unknown) {
              const restartMsg =
                restartErr instanceof Error
                  ? restartErr.message
                  : "unknown error";
              console.error(`[HEALTH] ${app.name} restart failed: ${restartMsg}`);
            }
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown error";
      console.error(`[HEALTH] Monitor cycle failed: ${msg}`);
    }
  }, HEALTH_INTERVAL_MS);

  if (
    typeof (monitorInterval as unknown as { unref?: () => void }).unref ===
    "function"
  ) {
    (monitorInterval as unknown as { unref: () => void }).unref();
  }
}

export function stopHealthMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.info("[HEALTH] Monitor stopped");
  }
}
