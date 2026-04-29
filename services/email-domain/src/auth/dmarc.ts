/**
 * RFC 7489 DMARC alignment + policy evaluator (subset).
 */

import type { DkimResult, DmarcResult, DnsResolver, SpfResult } from "../types.ts";

export interface DmarcRecord {
	readonly p: "none" | "quarantine" | "reject";
	readonly aspf: "r" | "s";
	readonly adkim: "r" | "s";
	readonly rua: string | null;
}

export async function fetchDmarcRecord(
	domain: string,
	resolver: DnsResolver,
): Promise<DmarcRecord | null> {
	const txts = await resolver.resolveTxt(`_dmarc.${domain}`);
	for (const chunks of txts) {
		const joined = chunks.join("");
		if (joined.toLowerCase().startsWith("v=dmarc1")) {
			return parseDmarcRecord(joined);
		}
	}
	return null;
}

export function parseDmarcRecord(record: string): DmarcRecord {
	const tags: Record<string, string> = {};
	for (const part of record.split(";")) {
		const eq = part.indexOf("=");
		if (eq === -1) continue;
		const k = part.slice(0, eq).trim().toLowerCase();
		const v = part.slice(eq + 1).trim();
		if (k.length > 0) tags[k] = v;
	}
	const pTag = tags["p"];
	const p: DmarcRecord["p"] =
		pTag === "reject" || pTag === "quarantine" || pTag === "none" ? pTag : "none";
	const aspf = tags["aspf"] === "s" ? "s" : "r";
	const adkim = tags["adkim"] === "s" ? "s" : "r";
	return { p, aspf, adkim, rua: tags["rua"] ?? null };
}

export interface EvaluateDmarcArgs {
	readonly headerFromDomain: string;
	readonly spfDomain: string;
	readonly dkimDomain: string | null;
	readonly spfResult: SpfResult;
	readonly dkimResult: DkimResult;
	readonly resolver: DnsResolver;
}

export interface DmarcEvaluation {
	readonly result: DmarcResult;
	readonly alignedSpf: boolean;
	readonly alignedDkim: boolean;
	readonly policy: DmarcRecord["p"] | "none";
}

export async function evaluateDmarc(args: EvaluateDmarcArgs): Promise<DmarcEvaluation> {
	const record = await fetchDmarcRecord(args.headerFromDomain, args.resolver);
	if (!record) {
		return { result: "fail", alignedSpf: false, alignedDkim: false, policy: "none" };
	}

	const alignedSpf =
		args.spfResult === "pass" &&
		domainsAlign(args.headerFromDomain, args.spfDomain, record.aspf === "s");
	const alignedDkim =
		args.dkimResult === "pass" &&
		args.dkimDomain !== null &&
		domainsAlign(args.headerFromDomain, args.dkimDomain, record.adkim === "s");

	const pass = alignedSpf || alignedDkim;
	return {
		result: pass ? "pass" : "fail",
		alignedSpf,
		alignedDkim,
		policy: record.p,
	};
}

/**
 * DMARC alignment: in `strict` mode the domains must match exactly; in
 * `relaxed` mode they may differ in subdomain depth as long as they share
 * the same organisational domain (approximated here as the last two labels).
 */
export function domainsAlign(headerFrom: string, authDomain: string, strict: boolean): boolean {
	const a = headerFrom.toLowerCase();
	const b = authDomain.toLowerCase();
	if (strict) return a === b;
	return organisationalDomain(a) === organisationalDomain(b);
}

function organisationalDomain(d: string): string {
	const labels = d.split(".").filter(Boolean);
	if (labels.length <= 2) return d;
	return labels.slice(-2).join(".");
}
