/**
 * Key Encryption Key (KEK) helpers.
 *
 * The master KEK protects every per-domain DKIM private key. In production we
 * read it from `EMAIL_DOMAIN_MASTER_KEK` (32 bytes, base64). For tests we
 * accept an explicit override.
 *
 * Encryption is AES-256-GCM with a 12-byte random nonce per record. The
 * authenticated additional data (AAD) is `${tenantId}:${domainId}` — this
 * binds the ciphertext to the owning tenant so a row leaked across tenants
 * cannot be decrypted, even if the attacker has the KEK.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_LEN = 32; // AES-256
const NONCE_LEN = 12; // GCM standard
const TAG_LEN = 16;

export function loadMasterKek(env: NodeJS.ProcessEnv = process.env): Buffer {
	const raw = env["EMAIL_DOMAIN_MASTER_KEK"];
	if (!raw) {
		throw new Error(
			"EMAIL_DOMAIN_MASTER_KEK is not set. Generate one with `openssl rand -base64 32`.",
		);
	}
	const buf = Buffer.from(raw, "base64");
	if (buf.length !== KEY_LEN) {
		throw new Error(`EMAIL_DOMAIN_MASTER_KEK must decode to ${KEY_LEN} bytes (got ${buf.length}).`);
	}
	return buf;
}

export function encryptPrivateKey(args: {
	plaintext: Buffer;
	kek: Buffer;
	tenantId: string;
	domainId: string;
}): string {
	const { plaintext, kek, tenantId, domainId } = args;
	const nonce = randomBytes(NONCE_LEN);
	const aad = Buffer.from(`${tenantId}:${domainId}`, "utf8");
	const cipher = createCipheriv("aes-256-gcm", kek, nonce);
	cipher.setAAD(aad);
	const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const tag = cipher.getAuthTag();
	// layout: nonce(12) | tag(16) | ciphertext
	return Buffer.concat([nonce, tag, ct]).toString("base64");
}

export function decryptPrivateKey(args: {
	ciphertextB64: string;
	kek: Buffer;
	tenantId: string;
	domainId: string;
}): Buffer {
	const { ciphertextB64, kek, tenantId, domainId } = args;
	const buf = Buffer.from(ciphertextB64, "base64");
	if (buf.length < NONCE_LEN + TAG_LEN + 1) {
		throw new Error("Ciphertext is too short to be a valid encrypted private key.");
	}
	const nonce = buf.subarray(0, NONCE_LEN);
	const tag = buf.subarray(NONCE_LEN, NONCE_LEN + TAG_LEN);
	const ct = buf.subarray(NONCE_LEN + TAG_LEN);
	const aad = Buffer.from(`${tenantId}:${domainId}`, "utf8");
	const decipher = createDecipheriv("aes-256-gcm", kek, nonce);
	decipher.setAAD(aad);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(ct), decipher.final()]);
}
