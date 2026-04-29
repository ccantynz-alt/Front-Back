// ── Crontech Worker Runtime — Worker registry ──────────────────────
// In-memory mapping from workerId → registered worker + supervisor.
// v1 keeps everything in process; v2 will persist registrations to
// Turso so a runtime restart resumes supervision (see README).

import { LogRingBuffer } from "./logs";
import { Supervisor, type SupervisorState } from "./supervisor";
import type {
  RestartPolicy,
  TenantId,
  WorkerId,
  WorkerLimits,
  WorkerRegistration,
} from "./schema";

export interface RegisteredWorker {
  readonly workerId: WorkerId;
  readonly tenantId: TenantId;
  readonly tarballUrl: string;
  readonly sha256: string;
  readonly command: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly secrets: Readonly<Record<string, string>>;
  readonly limits: WorkerLimits;
  readonly restartPolicy: RestartPolicy;
  readonly gracePeriodMs: number;
  readonly registeredAt: number;
}

/** Public projection — secrets are NEVER included. */
export interface PublicWorkerSummary {
  readonly workerId: WorkerId;
  readonly tenantId: TenantId;
  readonly tarballUrl: string;
  readonly sha256: string;
  readonly command: readonly string[];
  readonly envKeys: readonly string[];
  readonly secretKeys: readonly string[];
  readonly limits: WorkerLimits;
  readonly restartPolicy: RestartPolicy;
  readonly gracePeriodMs: number;
  readonly registeredAt: number;
  readonly state: SupervisorState;
}

export interface RegistryEntry {
  readonly worker: RegisteredWorker;
  readonly supervisor: Supervisor;
  readonly logs: LogRingBuffer;
}

export function fromRegistration(reg: WorkerRegistration): RegisteredWorker {
  return {
    workerId: reg.workerId,
    tenantId: reg.tenantId,
    tarballUrl: reg.tarballUrl,
    sha256: reg.sha256,
    command: reg.command,
    env: reg.env,
    secrets: reg.secrets,
    limits: reg.limits,
    restartPolicy: reg.restartPolicy,
    gracePeriodMs: reg.gracePeriodMs,
    registeredAt: Date.now(),
  };
}

export function summarise(entry: RegistryEntry): PublicWorkerSummary {
  const w = entry.worker;
  return {
    workerId: w.workerId,
    tenantId: w.tenantId,
    tarballUrl: w.tarballUrl,
    sha256: w.sha256,
    command: w.command,
    envKeys: Object.keys(w.env).sort(),
    secretKeys: Object.keys(w.secrets).sort(),
    limits: w.limits,
    restartPolicy: w.restartPolicy,
    gracePeriodMs: w.gracePeriodMs,
    registeredAt: w.registeredAt,
    state: entry.supervisor.snapshot(),
  };
}

export class WorkerRegistry {
  private readonly entries = new Map<WorkerId, RegistryEntry>();

  set(entry: RegistryEntry): void {
    this.entries.set(entry.worker.workerId, entry);
  }

  get(id: WorkerId): RegistryEntry | undefined {
    return this.entries.get(id);
  }

  delete(id: WorkerId): boolean {
    return this.entries.delete(id);
  }

  list(): readonly PublicWorkerSummary[] {
    const out: PublicWorkerSummary[] = [];
    for (const entry of this.entries.values()) {
      out.push(summarise(entry));
    }
    return out;
  }

  size(): number {
    return this.entries.size;
  }

  *[Symbol.iterator](): IterableIterator<RegistryEntry> {
    yield* this.entries.values();
  }
}
