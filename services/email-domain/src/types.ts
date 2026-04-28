/**
 * Core types for the email-domain service.
 *
 * A Domain is a tenant-owned sender domain (e.g. `acme.com`) that has been
 * registered with this service so we can sign outbound mail with DKIM, publish
 * SPF/DMARC records, and verify inbound mail from senders that claim to be
 * this domain.
 */

export type DomainStatus = "pending" | "verified" | "failed";

/**
 * A DKIM key record. We keep historic keys around for a grace period after
 * rotation so signatures issued just before rotation can still be verified
 * by recipients that already cached the new public key.
 */
export interface DkimKey {
	readonly selector: string;
	readonly publicKeyPem: string;
	/** AES-256-GCM-encrypted PKCS#8 private key, base64. */
	readonly privateKeyEncrypted: string;
	readonly createdAt: number;
	/** When this key is no longer signed against. May still verify until purgeAt. */
	readonly retiredAt?: number;
	/** When this key is permanently deleted. */
	readonly purgeAt?: number;
}

export interface Domain {
	readonly domainId: string;
	readonly tenantId: string;
	readonly domain: string;
	status: DomainStatus;
	readonly spfRecord: string;
	readonly dmarcRecord: string;
	/** Currently active DKIM key. */
	dkimActive: DkimKey;
	/** Previously rotated keys still inside the grace window. */
	dkimRetired: DkimKey[];
	verifiedAt?: number;
	readonly createdAt: number;
}

export interface AddDomainInput {
	readonly tenantId: string;
	readonly domain: string;
	/** Optional override for the SPF policy mechanism list. */
	readonly spfMechanisms?: readonly string[];
	/** Optional DMARC policy. Defaults to `quarantine`. */
	readonly dmarcPolicy?: "none" | "quarantine" | "reject";
	/** Optional rua mailbox override. */
	readonly dmarcRua?: string;
}

export interface AddDomainResult {
	readonly domain: Domain;
	readonly dnsRecords: readonly DnsPublishRecord[];
}

export interface DnsPublishRecord {
	readonly type: "TXT";
	readonly host: string;
	readonly value: string;
	readonly purpose: "spf" | "dkim" | "dmarc";
}

export interface VerificationResult {
	readonly status: DomainStatus;
	readonly checks: {
		readonly spf: boolean;
		readonly dkim: boolean;
		readonly dmarc: boolean;
	};
	readonly errors: readonly string[];
}

export interface SignRequest {
	readonly domainId: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
	/** Optional signed header list override. Defaults to `from:to:subject:date`. */
	readonly signedHeaders?: readonly string[];
}

export interface SignResponse {
	readonly dkimSignature: string;
}

export type SpfResult = "pass" | "fail" | "softfail" | "neutral" | "none" | "permerror" | "temperror";
export type DkimResult = "pass" | "fail" | "none";
export type DmarcResult = "pass" | "fail";

export interface AuthResult {
	readonly spf: SpfResult;
	readonly dkim: DkimResult;
	readonly dmarc: DmarcResult;
	readonly alignment: {
		readonly spf: boolean;
		readonly dkim: boolean;
	};
}

/**
 * Pluggable DNS resolver. Production wires this to `bun:dns` /
 * `node:dns/promises`. Tests inject a deterministic in-memory resolver.
 */
export interface DnsResolver {
	resolveTxt(host: string): Promise<string[][]>;
}

export interface DmarcReportRecord {
	readonly sourceIp: string;
	readonly count: number;
	readonly disposition: "none" | "quarantine" | "reject";
	readonly dkim: "pass" | "fail";
	readonly spf: "pass" | "fail";
	readonly headerFrom: string;
}

export interface DmarcReport {
	readonly orgName: string;
	readonly reportId: string;
	readonly dateRangeBegin: number;
	readonly dateRangeEnd: number;
	readonly policyDomain: string;
	readonly records: readonly DmarcReportRecord[];
}
