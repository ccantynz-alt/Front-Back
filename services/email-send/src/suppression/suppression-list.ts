export type SuppressionReason = "hard-bounce" | "complaint" | "manual" | "invalid";

export interface SuppressionEntry {
  tenantId: string;
  address: string;
  reason: SuppressionReason;
  addedAt: string;
}

/**
 * Per-tenant suppression list. Any address that hard-bounces or marks as spam
 * is added; future sends to that address are dropped immediately at the gate.
 */
export class SuppressionList {
  private readonly entries = new Map<string, SuppressionEntry>();

  private key(tenantId: string, address: string): string {
    return `${tenantId}::${address.toLowerCase()}`;
  }

  add(tenantId: string, address: string, reason: SuppressionReason): SuppressionEntry {
    const entry: SuppressionEntry = {
      tenantId,
      address: address.toLowerCase(),
      reason,
      addedAt: new Date().toISOString(),
    };
    this.entries.set(this.key(tenantId, address), entry);
    return entry;
  }

  remove(tenantId: string, address: string): boolean {
    return this.entries.delete(this.key(tenantId, address));
  }

  isSuppressed(tenantId: string, address: string): boolean {
    return this.entries.has(this.key(tenantId, address));
  }

  get(tenantId: string, address: string): SuppressionEntry | undefined {
    return this.entries.get(this.key(tenantId, address));
  }

  list(tenantId: string): SuppressionEntry[] {
    return [...this.entries.values()].filter((e) => e.tenantId === tenantId);
  }

  size(): number {
    return this.entries.size;
  }
}
