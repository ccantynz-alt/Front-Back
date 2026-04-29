import type {
  ScalingDecision,
  ServiceRegionState,
  TrafficSample,
} from "./schemas";

interface ServiceEntry {
  states: ServiceRegionState[];
  recentTraffic: TrafficSample[];
  latencyBudgetMs: number;
  costBudgetUsdPerHour: number;
  targetQpsPerInstance: number;
  lastDecision: ScalingDecision | undefined;
}

/**
 * Per-service mutable state for the orchestrator. In v1 this is a simple
 * in-memory map keyed by serviceId. Persistence (Turso) lives behind the
 * same interface in v2.
 */
export class ServiceStore {
  private readonly entries = new Map<string, ServiceEntry>();

  has(serviceId: string): boolean {
    return this.entries.has(serviceId);
  }

  /** Replace the state and traffic window for a service. */
  put(
    serviceId: string,
    payload: {
      states: ServiceRegionState[];
      recentTraffic: TrafficSample[];
      latencyBudgetMs: number;
      costBudgetUsdPerHour: number;
      targetQpsPerInstance: number;
    },
  ): void {
    this.entries.set(serviceId, {
      ...payload,
      lastDecision: this.entries.get(serviceId)?.lastDecision,
    });
  }

  get(serviceId: string): ServiceEntry | undefined {
    return this.entries.get(serviceId);
  }

  recordDecision(serviceId: string, decision: ScalingDecision): void {
    const e = this.entries.get(serviceId);
    if (!e) return;
    e.lastDecision = decision;
  }

  size(): number {
    return this.entries.size;
  }
}
