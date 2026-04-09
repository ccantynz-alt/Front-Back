/**
 * Simple in-memory retry queue with exponential backoff.
 * Processes jobs every 30 seconds. Max 5 retries (1s,2s,4s,8s,16s).
 */
import { writeAudit } from "./audit-log";

export type JobType =
  | "provision_workspace"
  | "send_email"
  | "create_sample_content"
  | "provision_db";

export interface RetryJob {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  nextRunAt: number;
  lastError?: string;
  createdAt: number;
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000];
const MAX_RETRIES = 5;

const queue = new Map<string, RetryJob>();
const handlers = new Map<JobType, (payload: Record<string, unknown>) => Promise<void>>();
let timer: ReturnType<typeof setInterval> | null = null;
let processed = 0;
let failed = 0;
let succeeded = 0;

export function registerHandler(
  type: JobType,
  handler: (payload: Record<string, unknown>) => Promise<void>,
): void {
  handlers.set(type, handler);
}

export function enqueue(type: JobType, payload: Record<string, unknown>): string {
  const id = crypto.randomUUID();
  queue.set(id, {
    id,
    type,
    payload,
    attempts: 0,
    maxAttempts: MAX_RETRIES,
    nextRunAt: Date.now(),
    createdAt: Date.now(),
  });
  return id;
}

export async function processQueue(): Promise<void> {
  const now = Date.now();
  for (const job of [...queue.values()]) {
    if (job.nextRunAt > now) continue;
    const handler = handlers.get(job.type);
    if (!handler) {
      job.lastError = `No handler for ${job.type}`;
      job.nextRunAt = now + BACKOFF_MS[Math.min(job.attempts, BACKOFF_MS.length - 1)]!;
      job.attempts += 1;
      continue;
    }
    job.attempts += 1;
    processed += 1;
    try {
      await handler(job.payload);
      queue.delete(job.id);
      succeeded += 1;
      await writeAudit({
        actorId: "system:retry-queue",
        action: "UPDATE",
        resourceType: "retry_job",
        resourceId: job.id,
        detail: `${job.type} succeeded after ${job.attempts} attempt(s)`,
        result: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      job.lastError = message;
      if (job.attempts >= job.maxAttempts) {
        queue.delete(job.id);
        failed += 1;
        await writeAudit({
          actorId: "system:retry-queue",
          action: "UPDATE",
          resourceType: "retry_job",
          resourceId: job.id,
          detail: `${job.type} permanently failed: ${message}`,
          result: "failure",
        });
      } else {
        const delay = BACKOFF_MS[Math.min(job.attempts - 1, BACKOFF_MS.length - 1)]!;
        job.nextRunAt = Date.now() + delay;
      }
    }
  }
}

export function startQueue(intervalMs = 30_000): void {
  if (timer) return;
  timer = setInterval(() => {
    processQueue().catch((err) => console.warn("[retry-queue] processQueue error:", err));
  }, intervalMs);
}

export function stopQueue(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function getQueueStatus(): {
  pending: number;
  processed: number;
  succeeded: number;
  failed: number;
  jobs: Array<{ id: string; type: JobType; attempts: number; lastError?: string | undefined }>;
} {
  return {
    pending: queue.size,
    processed,
    succeeded,
    failed,
    jobs: [...queue.values()].map((j) => ({
      id: j.id,
      type: j.type,
      attempts: j.attempts,
      lastError: j.lastError,
    })),
  };
}
