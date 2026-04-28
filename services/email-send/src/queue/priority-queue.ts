import type { Priority } from "../types.ts";

export interface QueueEntry {
  messageId: string;
  tenantId: string;
  priority: Priority;
  enqueuedAt: number;
  notBefore?: number;
}

const PRIORITY_RANK: Record<Priority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

/**
 * Per-tenant priority queue.
 *
 * v1: in-memory ring buffer (Map of tenantId → array). Each tenant gets
 * round-robin fairness in `popReady()` so noisy tenants can't starve quiet ones.
 * v2: Turso-backed durable queue (documented in README).
 */
export class PriorityQueue {
  private readonly tenants = new Map<string, QueueEntry[]>();
  private cursor = 0;

  enqueue(entry: QueueEntry): void {
    const existing = this.tenants.get(entry.tenantId) ?? [];
    existing.push(entry);
    existing.sort((a, b) => {
      const r = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (r !== 0) return r;
      return a.enqueuedAt - b.enqueuedAt;
    });
    this.tenants.set(entry.tenantId, existing);
  }

  /** Pop one ready message using round-robin tenant fairness. */
  popReady(now: number = Date.now()): QueueEntry | undefined {
    const tenantIds = [...this.tenants.keys()];
    if (tenantIds.length === 0) return undefined;
    for (let i = 0; i < tenantIds.length; i++) {
      const idx = (this.cursor + i) % tenantIds.length;
      const tid = tenantIds[idx];
      if (tid === undefined) continue;
      const list = this.tenants.get(tid);
      if (!list || list.length === 0) continue;
      const readyIdx = list.findIndex((e) => e.notBefore === undefined || e.notBefore <= now);
      if (readyIdx === -1) continue;
      const [entry] = list.splice(readyIdx, 1);
      if (list.length === 0) this.tenants.delete(tid);
      this.cursor = (idx + 1) % Math.max(tenantIds.length, 1);
      return entry;
    }
    return undefined;
  }

  size(): number {
    let total = 0;
    for (const list of this.tenants.values()) total += list.length;
    return total;
  }

  tenantSize(tenantId: string): number {
    return this.tenants.get(tenantId)?.length ?? 0;
  }
}
