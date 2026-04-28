/**
 * High-level verifier that combines SPF, DKIM, and DMARC checks for an
 * inbound message. Used by services/email-receive/.
 */

import { parseDkimSignature, verifyDkim } from "./crypto/dkim.ts";
import { evaluateSpf } from "./auth/spf.ts";
import { evaluateDmarc } from "./auth/dmarc.ts";
import type { AuthResult, DnsResolver } from "./types.ts";

export interface VerifyMessageArgs {
	readonly senderDomain: string;
	readonly senderIp: string;
	readonly headerFromDomain: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
	readonly resolver: DnsResolver;
}

export async function verifyMessage(args: VerifyMessageArgs): Promise<AuthResult> {
	const spfResult = await evaluateSpf({
		senderDomain: args.senderDomain,
		senderIp: args.senderIp,
		resolver: args.resolver,
	});

	let dkimResult: "pass" | "fail" | "none" = "none";
	let dkimDomain: string | null = null;
	const dkimHeader = args.headers["DKIM-Signature"] ?? args.headers["dkim-signature"];
	if (dkimHeader) {
		const parsed = parseDkimSignature(dkimHeader);
		const dnsDomain = parsed?.tags["d"];
		const selector = parsed?.tags["s"];
		if (parsed && dnsDomain && selector) {
			dkimDomain = dnsDomain;
			const txts = await args.resolver.resolveTxt(`${selector}._domainkey.${dnsDomain}`);
			const pubRecord = txts.map((c) => c.join("")).find((s) => s.toLowerCase().includes("v=dkim1"));
			if (pubRecord) {
				const pem = dkimDnsRecordToPem(pubRecord);
				if (pem) {
					dkimResult = verifyDkim({
						dkimSignatureHeader: dkimHeader,
						headers: args.headers,
						body: args.body,
						publicKey: pem,
					})
						? "pass"
						: "fail";
				} else {
					dkimResult = "fail";
				}
			} else {
				dkimResult = "fail";
			}
		}
	}

	const dmarc = await evaluateDmarc({
		headerFromDomain: args.headerFromDomain,
		spfDomain: args.senderDomain,
		dkimDomain,
		spfResult,
		dkimResult,
		resolver: args.resolver,
	});

	return {
		spf: spfResult,
		dkim: dkimResult,
		dmarc: dmarc.result,
		alignment: { spf: dmarc.alignedSpf, dkim: dmarc.alignedDkim },
	};
}

export function dkimDnsRecordToPem(record: string): string | null {
	const tags: Record<string, string> = {};
	for (const part of record.split(";")) {
		const eq = part.indexOf("=");
		if (eq === -1) continue;
		tags[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
	}
	const p = tags["p"];
	if (!p) return null;
	const wrapped = p.match(/.{1,64}/g)?.join("\n") ?? p;
	return `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----`;
}
