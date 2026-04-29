import { type Region, RegionSchema } from "./schemas";

/**
 * In-memory region registry. Production deployments back this with a
 * durable store (Turso) — the interface is intentionally narrow so the
 * implementation can swap without touching callers.
 */
export class RegionRegistry {
  private readonly regions = new Map<string, Region>();

  list(): Region[] {
    return [...this.regions.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  get(id: string): Region | undefined {
    return this.regions.get(id);
  }

  upsert(input: unknown): Region {
    const parsed = RegionSchema.parse(input);
    this.regions.set(parsed.id, parsed);
    return parsed;
  }

  delete(id: string): boolean {
    return this.regions.delete(id);
  }

  size(): number {
    return this.regions.size;
  }
}
