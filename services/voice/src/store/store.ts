import type { CallEvent, CallRecord, CallState } from "../flow/schema.ts";

/**
 * In-memory call-record store. Production would use Turso/D1 — the
 * surface area is tiny so swapping backends is a one-day job.
 */
export class CallStore {
  private records = new Map<string, CallRecord>();

  insert(record: CallRecord): void {
    if (this.records.has(record.id)) {
      throw new Error(`call ${record.id} already exists`);
    }
    this.records.set(record.id, record);
  }

  get(id: string): CallRecord | undefined {
    return this.records.get(id);
  }

  list(tenantId: string): CallRecord[] {
    return [...this.records.values()].filter((r) => r.tenantId === tenantId);
  }

  setState(id: string, state: CallState): CallRecord {
    const r = this.records.get(id);
    if (!r) throw new Error(`call ${id} not found`);
    r.state = state;
    r.updatedAt = Date.now();
    r.events.push({ ts: r.updatedAt, type: `state:${state}` });
    return r;
  }

  appendEvent(id: string, event: CallEvent): void {
    const r = this.records.get(id);
    if (!r) throw new Error(`call ${id} not found`);
    r.events.push(event);
    r.updatedAt = Date.now();
  }

  patch(id: string, patch: Partial<CallRecord>): CallRecord {
    const r = this.records.get(id);
    if (!r) throw new Error(`call ${id} not found`);
    Object.assign(r, patch, { updatedAt: Date.now() });
    return r;
  }
}

const VALID_TRANSITIONS: Record<CallState, ReadonlyArray<CallState>> = {
  queued: ["dialing", "failed"],
  dialing: ["ringing", "failed", "busy", "no-answer"],
  ringing: ["answered", "failed", "busy", "no-answer"],
  answered: ["in-progress", "completed", "failed"],
  "in-progress": ["completed", "failed"],
  completed: [],
  failed: [],
  busy: [],
  "no-answer": [],
};

export function canTransition(from: CallState, to: CallState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
