// ── Per-Tenant Job Queue ────────────────────────────────────────────────
// A simple in-memory FIFO queue scoped per tenant — guarantees that
// concurrent submissions from the same tenant are processed in order.
// In production this is backed by Durable Objects / Redis Streams; the
// in-memory version is the local/test fallback.

import type { JobRecord, JobState } from "../core/types";

export interface QueuedJob {
  readonly job: JobRecord;
  readonly run: () => Promise<void>;
}

export class TenantQueue {
  private readonly queues = new Map<string, QueuedJob[]>();
  private readonly running = new Set<string>();

  /** Enqueue a job for a tenant. The runner fires when its turn arrives. */
  enqueue(tenantId: string, queued: QueuedJob): void {
    const existing = this.queues.get(tenantId) ?? [];
    existing.push(queued);
    this.queues.set(tenantId, existing);
    void this.drain(tenantId);
  }

  /** Snapshot the order of pending jobs for a tenant — used by tests. */
  pendingIds(tenantId: string): readonly string[] {
    return (this.queues.get(tenantId) ?? []).map((q) => q.job.id);
  }

  private async drain(tenantId: string): Promise<void> {
    if (this.running.has(tenantId)) return;
    this.running.add(tenantId);
    try {
      while (true) {
        const queue = this.queues.get(tenantId);
        const next = queue?.shift();
        if (!next) break;
        if (queue && queue.length === 0) this.queues.delete(tenantId);
        try {
          await next.run();
        } catch (err) {
          // The runner is responsible for surfacing failures via the
          // job store; we just log and keep draining.
          console.error(
            `[video-pipeline] Job ${next.job.id} failed:`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    } finally {
      this.running.delete(tenantId);
    }
  }
}

/** Simple in-memory job store — production uses Durable Objects. */
export class JobStore {
  private readonly jobs = new Map<string, JobRecord>();

  put(record: JobRecord): void {
    this.jobs.set(record.id, record);
  }

  get(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  update(
    id: string,
    patch: Partial<Pick<JobRecord, "state" | "progress" | "resultUrl" | "error">>,
  ): JobRecord | undefined {
    const cur = this.jobs.get(id);
    if (!cur) return undefined;
    const next: JobRecord = {
      ...cur,
      ...patch,
      updatedAt: Date.now(),
    };
    this.jobs.set(id, next);
    return next;
  }

  list(tenantId: string): readonly JobRecord[] {
    return [...this.jobs.values()].filter((j) => j.tenantId === tenantId);
  }
}

export const TERMINAL_STATES: ReadonlySet<JobState> = new Set([
  "done",
  "failed",
]);
