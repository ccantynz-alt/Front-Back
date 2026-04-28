/**
 * HTTP client for services/email-domain (Agent 3) — performs SPF and DKIM
 * verification against an authoritative service. Treated as mockable: in
 * tests we inject a stub. In production, EmailDomainHttpClient hits the
 * real service. Until Agent 3 ships, MockEmailDomainClient gives sensible
 * defaults so the pipeline stays green.
 */

export type AuthResult = "pass" | "fail" | "neutral";

export interface SpfCheckRequest {
	readonly mailFrom: string;
	readonly remoteAddress: string;
	readonly heloName: string;
}

export interface DkimCheckRequest {
	readonly rawMessage: string;
}

export interface EmailDomainClient {
	checkSpf(req: SpfCheckRequest): Promise<AuthResult>;
	checkDkim(req: DkimCheckRequest): Promise<AuthResult>;
}

export class MockEmailDomainClient implements EmailDomainClient {
	constructor(
		private readonly defaults: {
			spf?: AuthResult;
			dkim?: AuthResult;
		} = {},
	) {}

	async checkSpf(_req: SpfCheckRequest): Promise<AuthResult> {
		return this.defaults.spf ?? "neutral";
	}

	async checkDkim(_req: DkimCheckRequest): Promise<AuthResult> {
		return this.defaults.dkim ?? "neutral";
	}
}

export class EmailDomainHttpClient implements EmailDomainClient {
	constructor(private readonly baseUrl: string) {}

	async checkSpf(req: SpfCheckRequest): Promise<AuthResult> {
		const res = await fetch(`${this.baseUrl}/v1/spf/check`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(req),
		});
		if (!res.ok) return "neutral";
		const json = (await res.json()) as { result?: AuthResult };
		return json.result ?? "neutral";
	}

	async checkDkim(req: DkimCheckRequest): Promise<AuthResult> {
		const res = await fetch(`${this.baseUrl}/v1/dkim/verify`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(req),
		});
		if (!res.ok) return "neutral";
		const json = (await res.json()) as { result?: AuthResult };
		return json.result ?? "neutral";
	}
}
