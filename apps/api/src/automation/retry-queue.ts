/**
 * Retry queue facade — delegates to BullMQ via @back-to-the-future/queue.
 *
 * Keeps the existing public API (`enqueue`, `registerHandler`,
 * `startQueue`, `stopQueue`, `getQueueStatus`) so call-sites do not
 * need to change. Under the hood, jobs are now persisted in Redis
 * through BullMQ with exponential backoff and a dead-letter queue.
 *
 * The in-memory fallback activates automatically when Redis is not
 * reachable (e.g., local dev without Upstash / local Redis).
 */
import { z } from "zod";
import { writeAudit } from "./audit-log";

// ── BullMQ delegation (lazy, fault-tolerant) ──────────────────────────

let bullmqAvailable: boolean | null = null;

// Opaque handle to the BullMQ queue. We store the module's enqueue
// function rather than the Queue object so we don't need bullmq type
// declarations in apps/api.
let bullmqEnqueue: ((name: string, data: Record<string, unknown>, opts: { jobId: string; attempts: number; backoff: { type: string; delay: number } }) => Promise<void>) | null = null;

async function tryInitBullMQ(): Promise<boolean> {
  if (bullmqAvailable !== null) return bullmqAvailable;
  try {
    const { getQueue, startWorker, dispatch } = await import(
      "@back-to-the-future/queue"
    );
    const q = getQueue();
    bullmqEnqueue = async (name, data, opts) => {
      await q.add(name, data, opts);
    };
    bullmqAvailable = true;

    // Start worker that delegates to the processor registry
    startWorker(async (job) => {
      await dispatch(job);
    });

    return true;
  } catch {
    bullmqAvailable = false;
    return false;
  }
}

// ── Zod schema (unchanged public contract) ────────────────────────────

export const JobTypeSchema = z.enum([
  "provision_workspace",
  "send_email",
  "create_sample_content",
  "provision_db",
]);

export type JobType = z.infer<typeof JobTypeSchema>;

export function isJobType(value: unknown): value is JobType {
  return JobTypeSchema.safeParse(value).success;
}

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

// In-memory fallback structures
const queue = new Map<string, RetryJob>();
const handlers = new Map<
  JobType,
  (payload: Record<string, unknown>) => Promise<void>
>();
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

/**
 * Enqueue a job. Tries BullMQ first; falls back to in-memory.
 */
export function enqueue(
  type: JobType,
  payload: Record<string, unknown>,
): string {
  const id = crypto.randomUUID();

  // Attempt async BullMQ enqueue (fire-and-forget — the in-memory
  // queue acts as an immediate fallback so the caller always gets an id).
  if (bullmqAvailable && bullmqEnqueue) {
    bullmqEnqueue(type, payload, {
      jobId: id,
      attempts: MAX_RETRIES,
      backoff: { type: "exponential", delay: 1000 },
    }).catch(() => {
      addToInMemory(id, type, payload);
    });
    return id;
  }

  addToInMemory(id, type, payload);
  return id;
}

function addToInMemory(
  id: string,
  type: JobType,
  payload: Record<string, unknown>,
): void {
  queue.set(id, {
    id,
    type,
    payload,
    attempts: 0,
    maxAttempts: MAX_RETRIES,
    nextRunAt: Date.now(),
    createdAt: Date.now(),
  });
}

export async function processQueue(): Promise<void> {
  const now = Date.now();
  for (const job of [...queue.values()]) {
    if (job.nextRunAt > now) continue;
    const handler = handlers.get(job.type);
    if (!handler) {
      job.lastError = `No handler for ${job.type}`;
      job.nextRunAt =
        now + BACKOFF_MS[Math.min(job.attempts, BACKOFF_MS.length - 1)]!;
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
        const delay =
          BACKOFF_MS[Math.min(job.attempts - 1, BACKOFF_MS.length - 1)]!;
        job.nextRunAt = Date.now() + delay;
      }
    }
  }
}

export function startQueue(intervalMs = 30_000): void {
  if (timer) return;

  // Try to initialise BullMQ in the background (non-blocking)
  tryInitBullMQ().catch(() => {
    /* swallow — fallback is already active */
  });

  timer = setInterval(() => {
    processQueue().catch(() => {
      /* error in processQueue handled internally */
    });
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
  bullmqActive: boolean;
  jobs: Array<{
    id: string;
    type: JobType;
    attempts: number;
    lastError?: string | undefined;
  }>;
} {
  return {
    pending: queue.size,
    processed,
    succeeded,
    failed,
    bullmqActive: bullmqAvailable === true,
    jobs: [...queue.values()].map((j) => ({
      id: j.id,
      type: j.type,
      attempts: j.attempts,
      lastError: j.lastError,
    })),
  };
}