/**
 * DKIM key generation, signing, and signature verification.
 *
 * Implements RFC 6376 simple/relaxed canonicalisation. We default to
 * `relaxed/relaxed` because every modern verifier handles it and it survives
 * benign whitespace mangling that `simple` does not.
 */

import {
	createHash,
	createSign,
	createVerify,
	generateKeyPairSync,
	type KeyObject,
} from "node:crypto";

export interface GeneratedKeyPair {
	readonly publicKeyPem: string;
	readonly privateKeyPem: string;
	/** Base64-encoded DER (the format used in the DKIM `p=` DNS field). */
	readonly publicKeyDerB64: string;
}

export function generateDkimKeyPair(modulusLength = 2048): GeneratedKeyPair {
	const { publicKey, privateKey } = generateKeyPairSync("rsa", {
		modulusLength,
		publicKeyEncoding: { type: "spki", format: "pem" },
		privateKeyEncoding: { type: "pkcs8", format: "pem" },
	});
	const publicKeyPem = publicKey;
	const privateKeyPem = privateKey;

	// Strip the PEM wrapper to get raw base64 DER for the DNS record.
	const publicKeyDerB64 = publicKeyPem
		.replace(/-----BEGIN PUBLIC KEY-----/g, "")
		.replace(/-----END PUBLIC KEY-----/g, "")
		.replace(/\s+/g, "");

	return { publicKeyPem, privateKeyPem, publicKeyDerB64 };
}

/**
 * Build the DKIM DNS TXT value for a public key:
 * `v=DKIM1; k=rsa; p=<base64-der>`
 */
export function buildDkimDnsValue(publicKeyDerB64: string): string {
	return `v=DKIM1; k=rsa; p=${publicKeyDerB64}`;
}

/* -------------------------------------------------------------------------- */
/* Canonicalisation (RFC 6376 §3.4)                                           */
/* -------------------------------------------------------------------------- */

/**
 * Relaxed body canonicalisation:
 *  - Reduce all whitespace runs to a single SP.
 *  - Strip trailing whitespace on each line.
 *  - Strip trailing empty lines.
 *  - Append a single CRLF.
 */
export function canonicalizeBodyRelaxed(body: string): string {
	const normalised = body.replace(/\r\n/g, "\n");
	const lines = normalised.split("\n").map((line) => line.replace(/[\t ]+/g, " ").replace(/[\t ]+$/g, ""));
	while (lines.length > 0 && lines[lines.length - 1] === "") {
		lines.pop();
	}
	if (lines.length === 0) {
		return "";
	}
	return `${lines.join("\r\n")}\r\n`;
}

/**
 * Relaxed header canonicalisation for a single header field:
 *  - Lowercase the field name.
 *  - Unfold continuation lines.
 *  - Collapse internal whitespace runs to a single SP.
 *  - Trim leading/trailing whitespace from the value.
 *  - Terminate with CRLF.
 */
export function canonicalizeHeaderRelaxed(name: string, value: string): string {
	const lname = name.toLowerCase();
	const unfolded = value.replace(/\r?\n[\t ]+/g, " ");
	const collapsed = unfolded.replace(/[\t ]+/g, " ").trim();
	return `${lname}:${collapsed}\r\n`;
}

/* -------------------------------------------------------------------------- */
/* Signing                                                                    */
/* -------------------------------------------------------------------------- */

export interface DkimSignArgs {
	readonly domain: string;
	readonly selector: string;
	readonly privateKeyPem: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
	readonly signedHeaders?: readonly string[];
	readonly timestamp?: number;
}

/**
 * Build the DKIM-Signature header for a message. Uses relaxed/relaxed
 * canonicalisation and rsa-sha256.
 */
export function signDkim(args: DkimSignArgs): string {
	const signedHeaderNames = (args.signedHeaders ?? ["from", "to", "subject", "date"]).map((h) =>
		h.toLowerCase(),
	);
	const ts = Math.floor(args.timestamp ?? Date.now() / 1000);

	// Body hash (bh=)
	const canonBody = canonicalizeBodyRelaxed(args.body);
	const bodyHash = createHash("sha256").update(canonBody).digest("base64");

	// Build canonical header block over the headers we sign, in the order we
	// declare them in `h=`.
	const lcHeaders: Record<string, string> = {};
	for (const k of Object.keys(args.headers)) {
		const v = args.headers[k];
		if (v !== undefined) {
			lcHeaders[k.toLowerCase()] = v;
		}
	}

	const headerCanonParts: string[] = [];
	for (const name of signedHeaderNames) {
		const value = lcHeaders[name];
		if (value !== undefined) {
			headerCanonParts.push(canonicalizeHeaderRelaxed(name, value));
		}
	}

	// Construct the DKIM-Signature header WITHOUT the `b=` value, then append
	// it canonically to the buffer to be signed (RFC 6376 §3.5 step 4).
	const dkimHeaderUnsigned =
		`v=1; a=rsa-sha256; c=relaxed/relaxed; d=${args.domain}; s=${args.selector};` +
		` t=${ts}; h=${signedHeaderNames.join(":")}; bh=${bodyHash}; b=`;

	const headerToSign =
		headerCanonParts.join("") + canonicalizeHeaderRelaxed("dkim-signature", dkimHeaderUnsigned);
	// The trailing CRLF added by canonicaliseHeaderRelaxed must be stripped
	// before signing per RFC 6376 §3.7.
	const toSign = headerToSign.replace(/\r\n$/, "");

	const signer = createSign("RSA-SHA256");
	signer.update(toSign);
	const signature = signer.sign(args.privateKeyPem).toString("base64");

	return `DKIM-Signature: ${dkimHeaderUnsigned}${signature}`;
}

/* -------------------------------------------------------------------------- */
/* Verification                                                               */
/* -------------------------------------------------------------------------- */

interface ParsedDkimSignature {
	readonly tags: Readonly<Record<string, string>>;
	readonly signedHeaders: readonly string[];
	readonly bodyHash: string;
	readonly signatureB64: string;
	readonly raw: string;
}

export function parseDkimSignature(headerValue: string): ParsedDkimSignature | null {
	const trimmed = headerValue.replace(/\r?\n[\t ]+/g, " ").trim();
	const tags: Record<string, string> = {};
	for (const part of trimmed.split(";")) {
		const eq = part.indexOf("=");
		if (eq === -1) continue;
		const k = part.slice(0, eq).trim();
		const v = part.slice(eq + 1).trim();
		if (k.length === 0) continue;
		tags[k] = v;
	}
	const h = tags["h"];
	const bh = tags["bh"];
	const b = tags["b"];
	if (!h || !bh || !b) return null;
	return {
		tags,
		signedHeaders: h.split(":").map((s) => s.trim().toLowerCase()),
		bodyHash: bh,
		signatureB64: b.replace(/\s+/g, ""),
		raw: headerValue,
	};
}

export interface DkimVerifyArgs {
	readonly dkimSignatureHeader: string;
	readonly headers: Readonly<Record<string, string>>;
	readonly body: string;
	readonly publicKey: KeyObject | string;
}

export function verifyDkim(args: DkimVerifyArgs): boolean {
	const parsed = parseDkimSignature(args.dkimSignatureHeader);
	if (!parsed) return false;

	// 1. Verify body hash.
	const canonBody = canonicalizeBodyRelaxed(args.body);
	const computedBh = createHash("sha256").update(canonBody).digest("base64");
	if (computedBh !== parsed.bodyHash) return false;

	// 2. Reconstruct the canonical header block + DKIM-Signature with b=
	// blanked, then verify rsa-sha256.
	const lcHeaders: Record<string, string> = {};
	for (const k of Object.keys(args.headers)) {
		const v = args.headers[k];
		if (v !== undefined) {
			lcHeaders[k.toLowerCase()] = v;
		}
	}

	const headerCanonParts: string[] = [];
	for (const name of parsed.signedHeaders) {
		const value = lcHeaders[name];
		if (value !== undefined) {
			headerCanonParts.push(canonicalizeHeaderRelaxed(name, value));
		}
	}

	const dkimHeaderBlankedB = parsed.raw.replace(/(b=)([^;]*)/, "$1");
	const headerToVerify =
		headerCanonParts.join("") + canonicalizeHeaderRelaxed("dkim-signature", dkimHeaderBlankedB);
	const toVerify = headerToVerify.replace(/\r\n$/, "");

	const verifier = createVerify("RSA-SHA256");
	verifier.update(toVerify);
	try {
		return verifier.verify(args.publicKey, Buffer.from(parsed.signatureB64, "base64"));
	} catch {
		return false;
	}
}
