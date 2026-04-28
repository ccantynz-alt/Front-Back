/**
 * Per-tenant FIFO queue. Concurrent `enqueue()` calls for the same
 * tenant key serialise; calls for different tenants run in parallel.
 *
 * The queue is in-memory by design — the deploy-orchestrator instance
 * is expected to run as a singleton per region; cross-region
 * coordination is the multi-region orchestrator's job. If we ever need
 * cross-instance ordering, swap this implementation for a Durable
 * Object-backed one without changing the public surface.
 */
export class TenantQueue<T> {
  private readonly tails = new Map<string, Promise<unknown>>();

  /**
   * Run `task` after every previously-enqueued task for the same key
   * has settled. Resolves with the task's return value (or rejects
   * with its error). The queue self-cleans empty slots so memory
   * stays bounded across long runs.
   */
  enqueue(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const next = previous.then(task, task);
    // Always advance the chain even if `task` rejected so subsequent
    // tasks for the same key still run.
    const chained = next.catch(() => undefined);
    this.tails.set(key, chained);
    chained.then(() => {
      // Drop the tail if nothing newer has been queued behind us.
      if (this.tails.get(key) === chained) {
        this.tails.delete(key);
      }
    });
    return next;
  }

  /** Currently-tracked tenant keys (queued or running). */
  activeKeys(): string[] {
    return Array.from(this.tails.keys());
  }
}
