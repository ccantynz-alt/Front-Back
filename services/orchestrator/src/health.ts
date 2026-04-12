// ── Health Monitor ────────────────────────────────────────────────────
// Runs every 30 seconds, checks all deployed apps, and auto-restarts
// unhealthy containers.

import { listApps } from "./deployer";
import { restartContainer } from "./docker";

let monitorInterval: ReturnType<typeof setInterval> | null = null;

/** Start the background health monitor loop. */
export function startHealthMonitor(): void {
  if (monitorInterval) {
    console.warn("[HEALTH] Monitor already running");
    return;
  }

  console.log("[HEALTH] Starting health monitor (30s interval)");

  monitorInterval = setInterval(async () => {
    try {
      const apps = await listApps();

      for (const app of apps) {
        // Check container state
        if (app.status !== "running") {
          console.error(
            `[HEALTH] ${app.name} is ${app.status} -- attempting restart`,
          );
          try {
            await restartContainer(app.containerId);
            console.log(`[HEALTH] ${app.name} restart initiated`);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "unknown error";
            console.error(`[HEALTH] ${app.name} restart failed: ${msg}`);
          }
          continue;
        }

        // Check HTTP health endpoint if configured
        if (app.healthUrl) {
          try {
            const res = await fetch(app.healthUrl, {
              signal: AbortSignal.timeout(5_000),
            });
            if (!res.ok) {
              throw new Error(`HTTP ${res.status}`);
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "unknown error";
            console.error(
              `[HEALTH] ${app.name} health check failed (${msg}) -- restarting`,
            );
            try {
              await restartContainer(app.containerId);
              console.log(`[HEALTH] ${app.name} restart initiated after health failure`);
            } catch (restartErr: unknown) {
              const restartMsg =
                restartErr instanceof Error
                  ? restartErr.message
                  : "unknown error";
              console.error(
                `[HEALTH] ${app.name} restart failed: ${restartMsg}`,
              );
            }
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "unknown error";
      console.error(`[HEALTH] Monitor cycle failed: ${msg}`);
    }
  }, 30_000);

  // Unref so the interval does not prevent process exit in tests.
  if (typeof (monitorInterval as unknown as { unref?: () => void }).unref === "function") {
    (monitorInterval as unknown as { unref: () => void }).unref();
  }
}

/** Stop the health monitor. */
export function stopHealthMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log("[HEALTH] Monitor stopped");
  }
}
