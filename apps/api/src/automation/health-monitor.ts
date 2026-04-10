/**
 * Automated health monitoring.
 * Runs every 60 seconds, retains last 1000 checks, alerts via Sentinel.
 */
import { z } from "zod";
import { writeAudit } from "./audit-log";

export const ServiceStatusSchema = z.enum(["ok", "degraded", "down", "unknown"]);
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>;

/**
 * Runtime type guard for ServiceStatus. Used when narrowing status
 * values coming from an external source (e.g. upstream health endpoint
 * response payloads) without throwing.
 */
export function isServiceStatus(value: unknown): value is ServiceStatus {
  return ServiceStatusSchema.safeParse(value).success;
}

export interface ServiceCheck {
  name: string;
  status: ServiceStatus;
  latencyMs: number;
  detail?: string | undefined;
}

export interface HealthSnapshot {
  timestamp: string;
  overall: ServiceStatus;
  services: ServiceCheck[];
  memoryMb: number;
  uptimeSec: number;
}

const HISTORY_LIMIT = 1000;
const history: HealthSnapshot[] = [];
let monitorTimer: ReturnType<typeof setInterval> | null = null;
const startedAt = Date.now();

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: string; latencyMs: number }> {
  const t0 = performance.now();
  try {
    const value = await fn();
    return { value, latencyMs: Math.round(performance.now() - t0) };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Math.round(performance.now() - t0),
    };
  }
}

async function checkDb(): Promise<ServiceCheck> {
  const r = await timed(async () => {
    const { db } = await import("@back-to-the-future/db");
    const dbAny = db as unknown as Record<string, unknown>;
    if (typeof dbAny.run === "function") await (dbAny.run as (sql: string) => Promise<unknown>)("SELECT 1");
  });
  return {
    name: "database",
    status: r.error ? "down" : r.latencyMs > 500 ? "degraded" : "ok",
    latencyMs: r.latencyMs,
    detail: r.error,
  };
}

async function checkQdrant(): Promise<ServiceCheck> {
  const r = await timed(async () => {
    const mod = await import("@back-to-the-future/ai-core");
    if (typeof mod.checkQdrantHealth === "function") await mod.checkQdrantHealth();
  });
  return {
    name: "qdrant",
    status: r.error ? "degraded" : "ok",
    latencyMs: r.latencyMs,
    detail: r.error,
  };
}

async function checkStripe(): Promise<ServiceCheck> {
  const r = await timed(async () => {
    if (!process.env.STRIPE_SECRET_KEY) return;
    // Lightweight HEAD against api.stripe.com
    const res = await fetch("https://api.stripe.com/v1/charges?limit=1", {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    if (!res.ok && res.status !== 401) throw new Error(`stripe status ${res.status}`);
  });
  return {
    name: "stripe",
    status: r.error ? "degraded" : "ok",
    latencyMs: r.latencyMs,
    detail: r.error ?? (process.env.STRIPE_SECRET_KEY ? undefined : "not configured"),
  };
}

async function checkEmail(): Promise<ServiceCheck> {
  return {
    name: "email",
    status: process.env.RESEND_API_KEY ? "ok" : "degraded",
    latencyMs: 0,
    detail: process.env.RESEND_API_KEY ? undefined : "no RESEND_API_KEY (console fallback)",
  };
}

async function checkSentinel(): Promise<ServiceCheck> {
  const r = await timed(async () => {
    // Dynamic import of sentinel -- path resolved at runtime to avoid rootDir constraint.
    const sentinelPath = "../../../../services/sentinel/src/index";
    const mod = await import(/* @vite-ignore */ sentinelPath).catch((): null => null);
    if (!mod) throw new Error("sentinel not loaded");
  });
  return {
    name: "sentinel",
    status: r.error ? "degraded" : "ok",
    latencyMs: r.latencyMs,
    detail: r.error,
  };
}

function checkMemory(): { mb: number; status: ServiceStatus } {
  const used = process.memoryUsage().heapUsed / 1024 / 1024;
  return {
    mb: Math.round(used),
    status: used > 1500 ? "degraded" : "ok",
  };
}

async function alertIfDown(snapshot: HealthSnapshot): Promise<void> {
  const broken = snapshot.services.filter((s) => s.status === "down");
  if (broken.length === 0) return;
  try {
    const alertsPath = "../../../../services/sentinel/src/alerts/types";
    const alerts = await import(/* @vite-ignore */ alertsPath) as {
      sendSlackAlert: (msg: Record<string, unknown>) => Promise<void>;
      sendDiscordAlert: (msg: Record<string, unknown>) => Promise<void>;
    };
    const message = {
      priority: "critical" as const,
      title: "Health monitor: services down",
      body: broken.map((b) => `- ${b.name}: ${b.detail ?? b.status}`).join("\n"),
      timestamp: snapshot.timestamp,
    };
    await Promise.allSettled([alerts.sendSlackAlert(message), alerts.sendDiscordAlert(message)]);
  } catch {
    // Sentinel unavailable - log via audit instead.
    await writeAudit({
      actorId: "system:health-monitor",
      action: "UPDATE",
      resourceType: "alert",
      resourceId: snapshot.timestamp,
      detail: `down: ${broken.map((b) => b.name).join(",")}`,
      result: "failure",
    });
  }
}

export async function runHealthCheck(): Promise<HealthSnapshot> {
  const [dbR, qdR, stR, emR, snR] = await Promise.all([
    checkDb(),
    checkQdrant(),
    checkStripe(),
    checkEmail(),
    checkSentinel(),
  ]);
  const mem = checkMemory();

  const services: ServiceCheck[] = [dbR, qdR, stR, emR, snR];
  const overall: ServiceStatus = services.some((s) => s.status === "down")
    ? "down"
    : services.some((s) => s.status === "degraded")
      ? "degraded"
      : "ok";

  const snapshot: HealthSnapshot = {
    timestamp: new Date().toISOString(),
    overall,
    services,
    memoryMb: mem.mb,
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
  };

  history.push(snapshot);
  if (history.length > HISTORY_LIMIT) history.shift();

  await alertIfDown(snapshot);

  return snapshot;
}

export function getCurrentHealth(): HealthSnapshot | null {
  return history[history.length - 1] ?? null;
}

export function getHealthHistory(): HealthSnapshot[] {
  return [...history];
}

export function startHealthMonitor(intervalMs = 60_000): void {
  if (monitorTimer) return;
  // Kick off immediately so the first snapshot is available.
  runHealthCheck().catch((err) => console.warn("[health-monitor] initial check error:", err));
  monitorTimer = setInterval(() => {
    runHealthCheck().catch((err) => console.warn("[health-monitor] error:", err));
  }, intervalMs);
}

export function stopHealthMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}
