/**
 * Public exports for the email-domain service. Other services in this repo
 * (notably services/email-send and services/email-receive) consume this
 * package programmatically; the HTTP server in `./server.ts` is the
 * external/cross-service surface.
 */

export * from "./types.ts";
export { DomainRegistry, buildSpfRecord, buildDmarcRecord, lookupPublicKey } from "./registry.ts";
export {
	encryptPrivateKey,
	decryptPrivateKey,
	loadMasterKek,
} from "./crypto/kek.ts";
export {
	generateDkimKeyPair,
	signDkim,
	verifyDkim,
	parseDkimSignature,
	canonicalizeBodyRelaxed,
	canonicalizeHeaderRelaxed,
	buildDkimDnsValue,
} from "./crypto/dkim.ts";
export { SystemDnsResolver, StaticDnsResolver } from "./dns/resolver.ts";
export { evaluateSpf, cidrMatch } from "./auth/spf.ts";
export {
	evaluateDmarc,
	parseDmarcRecord,
	fetchDmarcRecord,
	domainsAlign,
} from "./auth/dmarc.ts";
export { parseDmarcReport } from "./dmarc-reports.ts";
export { verifyMessage, dkimDnsRecordToPem } from "./verifier.ts";
export { createServer } from "./server.ts";
