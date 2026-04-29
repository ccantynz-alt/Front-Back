/**
 * Per-tenant domain registry. The default implementation is in-memory; a
 * production deployment swaps this for Drizzle-backed persistence.
 *
 * Concurrency model: all mutators are synchronous; the public API exposes
 * Promises so the implementation can be replaced without API churn.
 */

import { randomUUID } from "node:crypto";
import { buildDkimDnsValue, generateDkimKeyPair } from "./crypto/dkim.ts";
import { decryptPrivateKey, encryptPrivateKey } from "./crypto/kek.ts";
import type {
	AddDomainInput,
	AddDomainResult,
	DkimKey,
	DnsPublishRecord,
	DnsResolver,
	Domain,
	VerificationResult,
} from "./types.ts";
import { fetchDmarcRecord } from "./auth/dmarc.ts";

const DEFAULT_DKIM_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export interface RegistryOptions {
	readonly kek: Buffer;
	readonly resolver: DnsResolver;
	readonly dkimGraceMs?: number;
	readonly now?: () => number;
	/** Override for tests; defaults to `node:crypto.randomUUID`. */
	readonly newId?: () => string;
}

export class DomainRegistry {
	private readonly domains = new Map<string, Domain>();
	private readonly opts: Required<Omit<RegistryOptions, "kek" | "resolver">> & {
		readonly kek: Buffer;
		readonly resolver: DnsResolver;
	};

	constructor(opts: RegistryOptions) {
		this.opts = {
			kek: opts.kek,
			resolver: opts.resolver,
			dkimGraceMs: opts.dkimGraceMs ?? DEFAULT_DKIM_GRACE_MS,
			now: opts.now ?? (() => Date.now()),
			newId: opts.newId ?? (() => randomUUID()),
		};
	}

	async addDomain(input: AddDomainInput): Promise<AddDomainResult> {
		const domainId = this.opts.newId();
		const selector = this.makeSelector();
		const dkim = this.mintDkimKey({ domainId, tenantId: input.tenantId, selector });

		const spfRecord = buildSpfRecord(input.spfMechanisms);
		const dmarcArgs: Parameters<typeof buildDmarcRecord>[0] = {
			policy: input.dmarcPolicy ?? "quarantine",
		};
		if (input.dmarcRua !== undefined) dmarcArgs.rua = input.dmarcRua;
		const dmarcRecord = buildDmarcRecord(dmarcArgs);

		const domain: Domain = {
			domainId,
			tenantId: input.tenantId,
			domain: input.domain.toLowerCase(),
			status: "pending",
			spfRecord,
			dmarcRecord,
			dkimActive: dkim,
			dkimRetired: [],
			createdAt: this.opts.now(),
		};
		this.domains.set(domainId, domain);

		return { domain, dnsRecords: this.dnsRecordsFor(domain) };
	}

	get(domainId: string): Domain | null {
		return this.domains.get(domainId) ?? null;
	}

	getByDomain(domain: string, tenantId: string): Domain | null {
		const lc = domain.toLowerCase();
		for (const d of this.domains.values()) {
			if (d.domain === lc && d.tenantId === tenantId) return d;
		}
		return null;
	}

	dnsRecordsFor(domain: Domain): readonly DnsPublishRecord[] {
		const records: DnsPublishRecord[] = [
			{ type: "TXT", host: domain.domain, value: domain.spfRecord, purpose: "spf" },
			{
				type: "TXT",
				host: `${domain.dkimActive.selector}._domainkey.${domain.domain}`,
				value: extractDkimDnsValue(domain.dkimActive.publicKeyPem),
				purpose: "dkim",
			},
			{ type: "TXT", host: `_dmarc.${domain.domain}`, value: domain.dmarcRecord, purpose: "dmarc" },
		];
		return records;
	}

	async verify(domainId: string): Promise<VerificationResult> {
		const domain = this.domains.get(domainId);
		if (!domain) {
			return {
				status: "failed",
				checks: { spf: false, dkim: false, dmarc: false },
				errors: ["Domain not found"],
			};
		}
		const errors: string[] = [];

		const spfTxts = await this.opts.resolver.resolveTxt(domain.domain);
		const spfFound = spfTxts.some(
			(chunks) => chunks.join("").trim().toLowerCase() === domain.spfRecord.toLowerCase(),
		);
		if (!spfFound) errors.push("SPF record not published or value mismatch");

		const dkimHost = `${domain.dkimActive.selector}._domainkey.${domain.domain}`;
		const dkimTxts = await this.opts.resolver.resolveTxt(dkimHost);
		const expectedDkim = extractDkimDnsValue(domain.dkimActive.publicKeyPem);
		const dkimFound = dkimTxts.some((chunks) => chunks.join("").includes(expectedDkim));
		if (!dkimFound) errors.push("DKIM record not published or key mismatch");

		const dmarc = await fetchDmarcRecord(domain.domain, this.opts.resolver);
		const dmarcFound = dmarc !== null;
		if (!dmarcFound) errors.push("DMARC record not published");

		const allPass = spfFound && dkimFound && dmarcFound;
		domain.status = allPass ? "verified" : "failed";
		if (allPass) domain.verifiedAt = this.opts.now();

		return {
			status: domain.status,
			checks: { spf: spfFound, dkim: dkimFound, dmarc: dmarcFound },
			errors,
		};
	}

	/**
	 * Issue a fresh DKIM keypair, retire the previous active key (kept for
	 * `dkimGraceMs` so in-flight signatures still verify), and return the new
	 * DNS record to publish.
	 */
	async rotateDkim(domainId: string): Promise<{ domain: Domain; dnsRecord: DnsPublishRecord }> {
		const domain = this.domains.get(domainId);
		if (!domain) throw new Error("Domain not found");

		const newSelector = this.makeSelector();
		const next = this.mintDkimKey({ domainId, tenantId: domain.tenantId, selector: newSelector });

		const now = this.opts.now();
		const retired: DkimKey = {
			...domain.dkimActive,
			retiredAt: now,
			purgeAt: now + this.opts.dkimGraceMs,
		};

		domain.dkimRetired = [...purge(domain.dkimRetired, now), retired];
		domain.dkimActive = next;
		// A rotation invalidates the previous verified state until the new
		// public key is published & verified.
		domain.status = "pending";

		return {
			domain,
			dnsRecord: {
				type: "TXT",
				host: `${next.selector}._domainkey.${domain.domain}`,
				value: extractDkimDnsValue(next.publicKeyPem),
				purpose: "dkim",
			},
		};
	}

	/**
	 * Decrypt the active DKIM private key. Used by the signing endpoint.
	 * Throws if `tenantId` does not match — defence in depth against
	 * cross-tenant leaks.
	 */
	loadActivePrivateKey(args: { domainId: string; tenantId: string }): string {
		const domain = this.domains.get(args.domainId);
		if (!domain) throw new Error("Domain not found");
		if (domain.tenantId !== args.tenantId) {
			throw new Error("Tenant mismatch");
		}
		const pem = decryptPrivateKey({
			ciphertextB64: domain.dkimActive.privateKeyEncrypted,
			kek: this.opts.kek,
			tenantId: args.tenantId,
			domainId: args.domainId,
		}).toString("utf8");
		return pem;
	}

	listKeys(domainId: string): { active: DkimKey; retired: readonly DkimKey[] } | null {
		const domain = this.domains.get(domainId);
		if (!domain) return null;
		return { active: domain.dkimActive, retired: domain.dkimRetired };
	}

	all(): readonly Domain[] {
		return [...this.domains.values()];
	}

	/* ---------------------------------------------------------------- */

	private makeSelector(): string {
		const ts = Math.floor(this.opts.now() / 1000);
		const rnd = this.opts.newId().split("-")[0] ?? "k";
		return `s${ts}${rnd}`.slice(0, 24);
	}

	private mintDkimKey(args: {
		domainId: string;
		tenantId: string;
		selector: string;
	}): DkimKey {
		const kp = generateDkimKeyPair(2048);
		const enc = encryptPrivateKey({
			plaintext: Buffer.from(kp.privateKeyPem, "utf8"),
			kek: this.opts.kek,
			tenantId: args.tenantId,
			domainId: args.domainId,
		});
		return {
			selector: args.selector,
			publicKeyPem: kp.publicKeyPem,
			privateKeyEncrypted: enc,
			createdAt: this.opts.now(),
		};
	}
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function buildSpfRecord(mechanisms: readonly string[] | undefined): string {
	const mechs = mechanisms && mechanisms.length > 0 ? mechanisms : ["mx", "include:_spf.crontech.email"];
	return `v=spf1 ${mechs.join(" ")} ~all`;
}

export function buildDmarcRecord(args: {
	policy: "none" | "quarantine" | "reject";
	rua?: string;
}): string {
	const parts = [`v=DMARC1`, `p=${args.policy}`, `adkim=r`, `aspf=r`];
	if (args.rua) parts.push(`rua=mailto:${args.rua}`);
	return `${parts.join("; ")};`;
}

function extractDkimDnsValue(publicKeyPem: string): string {
	const der = publicKeyPem
		.replace(/-----BEGIN PUBLIC KEY-----/g, "")
		.replace(/-----END PUBLIC KEY-----/g, "")
		.replace(/\s+/g, "");
	return buildDkimDnsValue(der);
}

function purge(retired: readonly DkimKey[], now: number): DkimKey[] {
	return retired.filter((k) => (k.purgeAt ?? Number.POSITIVE_INFINITY) > now);
}

/**
 * Helper used by the verifier path: given the registry, look up the public
 * key for `(domain, selector)` checking active + retired keys.
 */
export function lookupPublicKey(
	registry: DomainRegistry,
	domainName: string,
	selector: string,
): string | null {
	for (const d of registry.all()) {
		if (d.domain !== domainName.toLowerCase()) continue;
		if (d.dkimActive.selector === selector) return d.dkimActive.publicKeyPem;
		const retired = d.dkimRetired.find((k) => k.selector === selector);
		if (retired) return retired.publicKeyPem;
	}
	return null;
}

export const __test__ = { extractDkimDnsValue };
