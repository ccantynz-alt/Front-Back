import { generateKeyPairSync, randomBytes } from "node:crypto";

/**
 * x25519 keypair as raw 32-byte values, base64-encoded for WireGuard.
 *
 * We use Node's built-in `crypto.generateKeyPairSync('x25519', ...)` rather than
 * pulling in `@noble/curves`. Rationale:
 *   - x25519 is a stable, standardized Node API (≥12) and Bun supports it natively.
 *   - Zero new dependencies = smaller supply-chain attack surface (matters for a
 *     control plane that mints VPN keys).
 *   - Node returns DER-encoded keys (SPKI for public, PKCS8 for private). The raw
 *     32 bytes WireGuard expects are simply the last 32 bytes of each — the ASN.1
 *     wrapping above is a fixed prefix for x25519. We slice and base64-encode.
 *
 * For deterministic test seeding, see `generateKeyPairFromSeed` which derives a
 * keypair from a 32-byte seed via clamping (per RFC 7748 §5).
 */
export interface RawKeyPair {
	publicKey: string;
	privateKey: string;
}

/** Generate a fresh, cryptographically random x25519 keypair (raw, base64). */
export function generateKeyPair(): RawKeyPair {
	const kp = generateKeyPairSync("x25519", {
		publicKeyEncoding: { type: "spki", format: "der" },
		privateKeyEncoding: { type: "pkcs8", format: "der" },
	});
	const rawPub = kp.publicKey.subarray(kp.publicKey.length - 32);
	const rawPriv = kp.privateKey.subarray(kp.privateKey.length - 32);
	return {
		publicKey: Buffer.from(rawPub).toString("base64"),
		privateKey: Buffer.from(rawPriv).toString("base64"),
	};
}

/**
 * Derive an x25519 private key from a 32-byte seed, returning raw base64.
 *
 * Used by tests (and only by tests) to assert determinism: same seed -> same
 * private key bytes. Seed is clamped per RFC 7748 §5. The corresponding public
 * key is computed via Node's `createPrivateKey` -> `createPublicKey` chain.
 */
export function generateKeyPairFromSeed(seed: Uint8Array): RawKeyPair {
	if (seed.length !== 32) {
		throw new Error(`seed must be 32 bytes, got ${seed.length}`);
	}
	const clamped = new Uint8Array(seed);
	// RFC 7748 §5 clamping for x25519:
	const first = clamped[0];
	const last = clamped[31];
	if (first === undefined || last === undefined) {
		throw new Error("clamped buffer corrupted");
	}
	clamped[0] = first & 248;
	clamped[31] = (last & 127) | 64;

	// Build a PKCS8 DER for x25519:
	// 30 2e 02 01 00 30 05 06 03 2b 65 6e 04 22 04 20 <32 bytes>
	const pkcs8Prefix = Buffer.from([
		0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x6e,
		0x04, 0x22, 0x04, 0x20,
	]);
	const pkcs8 = Buffer.concat([pkcs8Prefix, Buffer.from(clamped)]);
	const { createPrivateKey, createPublicKey } = require("node:crypto") as typeof import("node:crypto");
	const privKey = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
	const pubDer = createPublicKey(privKey).export({ format: "der", type: "spki" });
	const pubRaw = pubDer.subarray(pubDer.length - 32);
	return {
		publicKey: Buffer.from(pubRaw).toString("base64"),
		privateKey: Buffer.from(clamped).toString("base64"),
	};
}

/** Generate a 32-byte random seed for callers that want explicit-seed semantics. */
export function randomSeed(): Uint8Array {
	return new Uint8Array(randomBytes(32));
}

/** Validate that a given string is a base64-encoded 32-byte WireGuard key. */
export function isValidWgKey(key: string): boolean {
	try {
		const buf = Buffer.from(key, "base64");
		return buf.length === 32 && buf.toString("base64") === key;
	} catch {
		return false;
	}
}
