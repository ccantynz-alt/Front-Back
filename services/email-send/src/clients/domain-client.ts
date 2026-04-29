/**
 * Client to services/email-domain. Cross-service HTTP boundary.
 * Mockable in tests via the constructor `fetch` override.
 */
export interface DomainValidationResult {
  ok: boolean;
  reason?: string;
}

export interface DkimSigningKey {
  domain: string;
  selector: string;
  privateKeyPem: string;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export class DomainClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async validateFromAddress(tenantId: string, fromAddress: string): Promise<DomainValidationResult> {
    const url = `${this.baseUrl}/v1/validate`;
    const res = await this.fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId, fromAddress }),
    });
    if (!res.ok) {
      return { ok: false, reason: `domain-service-${res.status}` };
    }
    const data = (await res.json()) as DomainValidationResult;
    return data;
  }

  async getSigningKey(tenantId: string, domain: string): Promise<DkimSigningKey | null> {
    const url = `${this.baseUrl}/v1/dkim-key`;
    const res = await this.fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantId, domain }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as DkimSigningKey;
    return data;
  }
}
