export interface MxRecord {
  exchange: string;
  priority: number;
}

export interface MxResolver {
  resolve(domain: string): Promise<MxRecord[]>;
}

/**
 * Bun/Node DNS MX lookup. Mockable in tests by passing a different impl.
 */
export class SystemMxResolver implements MxResolver {
  async resolve(domain: string): Promise<MxRecord[]> {
    // Lazy import so unit tests that pass a mock never touch real DNS.
    const dns = await import("node:dns/promises");
    const records = await dns.resolveMx(domain);
    return records
      .map((r) => ({ exchange: r.exchange, priority: r.priority }))
      .sort((a, b) => a.priority - b.priority);
  }
}

/** Test helper. */
export class StaticMxResolver implements MxResolver {
  constructor(private readonly map: Record<string, MxRecord[]>) {}
  async resolve(domain: string): Promise<MxRecord[]> {
    return this.map[domain] ?? [];
  }
}
