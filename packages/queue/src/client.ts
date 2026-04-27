/**
 * BullMQ Queue + Worker setup for Crontech.
 *
 * Uses ioredis connecting to Upstash Redis (or local Redis for dev).
 * Lazy-initialised: only connects when the first job is enqueued or
 * when startWorker() is called.
 *
 * Default retry: 5 attempts with exponential backoff (1s, 2s, 4s, 8s, 16s).
 * Failed jobs after max retries go to `crontech:dlq`.
 */

import { Queue, Worker, type Job, type Processor } from "bullmq";

// ── Configuration ─────────────────────────────────────────────────────

const QUEUE_NAME = "crontech:jobs";
const DLQ_NAME = "crontech:dlq";

function getRedisUrl(): string {
  return (
    process.env["REDIS_URL"] ??
    process.env["UPSTASH_REDIS_URL"] ??
    "redis://localhost:6379"
  );
}

function getRedisConnectionOpts(): { url: string } {
  return { url: getRedisUrl() };
}

// ── Lazy singleton instances ──────────────────────────────────────────

let _queue: Queue | null = null;
let _dlq: Queue | null = null;
let _worker: Worker | null = null;

/**
 * Return the shared BullMQ queue. Creates on first call (lazy init).
 */
export function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: getRedisConnectionOpts(),
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 1000, // 1s, 2s, 4s, 8s, 16s
        },
      },
    });
  }
  return _queue;
}

/**
 * Return the dead-letter queue. Failed jobs are moved here after
 * exhausting all retries.
 */
export function getDLQ(): Queue {
  if (!_dlq) {
    _dlq = new Queue(DLQ_NAME, {
      connection: getRedisConnectionOpts(),
    });
  }
  return _dlq;
}

/**
 * Start a BullMQ Worker that processes jobs.
 *
 * @param processor - the function called for each job
 * @param concurrency - max concurrent jobs (default 5)
 */
export function startWorker(
  processor: Processor,
  concurrency = 5,
): Worker {
  if (_worker) return _worker;

  _worker = new Worker(QUEUE_NAME, processor, {
    connection: getRedisConnectionOpts(),
    concurrency,
  });

  // Move failed jobs to DLQ after max retries exhausted
  _worker.on("failed", (job: Job | undefined, err: Error) => {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 5;
    if (job.attemptsMade >= maxAttempts) {
      const dlq = getDLQ();
      dlq
        .add(`dlq:${job.name}`, {
          originalJobId: job.id,
          jobName: job.name,
          data: job.data,
          failedReason: err.message,
          attemptsMade: job.attemptsMade,
          failedAt: new Date().toISOString(),
        })
        .catch((dlqErr) => {
          console.error("[queue] Failed to move job to DLQ:", dlqErr);
        });
    }
  });

  _worker.on("error", (err) => {
    console.error("[queue] Worker error:", err);
  });

  return _worker;
}

/**
 * Gracefully shut down queue and worker connections.
 * Call on SIGTERM / process shutdown.
 */
export async function closeQueue(): Promise<void> {
  const closers: Array<Promise<void>> = [];
  if (_worker) {
    closers.push(_worker.close());
    _worker = null;
  }
  if (_queue) {
    closers.push(_queue.close());
    _queue = null;
  }
  if (_dlq) {
    closers.push(_dlq.close());
    _dlq = null;
  }
  await Promise.all(closers);
}

// ── Graceful shutdown on SIGTERM ──────────────────────────────────────

if (typeof process !== "undefined") {
  process.on("SIGTERM", () => {
    console.info("[queue] SIGTERM received, draining queue...");
    closeQueue()
      .then(() => {
        console.info("[queue] Queue drained. Exiting.");
      })
      .catch((err) => {
        console.error("[queue] Error during shutdown:", err);
      });
  });
}

export { QUEUE_NAME, DLQ_NAME };
