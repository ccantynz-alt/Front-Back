/**
 * In-memory state store keyed by `prId`.
 *
 * v1 is in-memory; v2 will swap this implementation for Turso-backed storage.
 * The interface stays stable so the orchestrator never cares which is in use.
 */

import type { PreviewState } from "../types";

export interface StateStore {
  get(prId: string): PreviewState | undefined;
  set(state: PreviewState): void;
  delete(prId: string): void;
  list(): PreviewState[];
}

export class InMemoryStateStore implements StateStore {
  private readonly map = new Map<string, PreviewState>();

  get(prId: string): PreviewState | undefined {
    const v = this.map.get(prId);
    return v ? { ...v } : undefined;
  }

  set(state: PreviewState): void {
    this.map.set(state.prId, { ...state });
  }

  delete(prId: string): void {
    this.map.delete(prId);
  }

  list(): PreviewState[] {
    return Array.from(this.map.values()).map((s) => ({ ...s }));
  }
}
