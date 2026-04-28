// ── Crypto Primitives ──────────────────────────────────────────────────
// AES-256-GCM authenticated encryption with per-tenant DEKs derived from
// a master KEK via HKDF-SHA-256. Authenticated additional data (AAD) is
// `tenantId:secretKey` so a ciphertext bound to one tenant cannot be
// decrypted under another tenant's DEK — even if both DEKs were derived
// from the same KEK.
//
// SECURITY NOTES
// - The master KEK MUST be a 32-byte key passed as 64 hex chars via
//   the `SECRETS_VAULT_MASTER_KEY` env var. Never hardcoded. Never logged.
// - Each encryption uses a fresh random 12-byte nonce.
// - GCM auth tag is 16 bytes, appended to ciphertext.
// - On disk we store the wire format as base64: nonce(12) || tag(16) || ct.
// - HKDF salt is the literal string "crontech-secrets-vault-v1".
// - HKDF info is the tenant id, so each tenant gets a unique DEK.

import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const KEK_BYTES = 32;
const DEK_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_SALT = Buffer.from("crontech-secrets-vault-v1", "utf8");

/**
 * Parse and validate the master KEK from a hex string.
 * Throws if the value is not exactly 64 hex chars (32 bytes).
 */
export function parseMasterKey(hex: string): Buffer {
  if (typeof hex !== "string" || hex.length !== KEK_BYTES * 2) {
    throw new Error(
      "SECRETS_VAULT_MASTER_KEY must be a 64-character hex string (32 bytes)",
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("SECRETS_VAULT_MASTER_KEY must be hex-encoded");
  }
  return Buffer.from(hex, "hex");
}

/**
 * Derive a per-tenant Data Encryption Key (DEK) from the master KEK.
 *
 * Uses HKDF-SHA-256 with:
 *   - IKM   = master KEK
 *   - salt  = constant "crontech-secrets-vault-v1"
 *   - info  = tenantId
 *   - L     = 32 bytes
 *
 * Same inputs always yield the same DEK (deterministic). Different
 * tenantIds produce cryptographically independent DEKs.
 */
export function deriveTenantDek(masterKey: Buffer, tenantId: string): Buffer {
  if (masterKey.length !== KEK_BYTES) {
    throw new Error(`master KEK must be ${KEK_BYTES} bytes`);
  }
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    throw new Error("tenantId must be a non-empty string");
  }
  const info = Buffer.from(tenantId, "utf8");
  // hkdfSync returns ArrayBuffer in Node — wrap in Buffer.
  const out = hkdfSync("sha256", masterKey, HKDF_SALT, info, DEK_BYTES);
  return Buffer.from(out);
}

/**
 * Build the AAD for a given tenant + secret key. Binding both into the
 * AAD means a ciphertext cannot be replayed against a different
 * tenant or under a different secret key without GCM auth failure.
 */
function buildAad(tenantId: string, secretKey: string): Buffer {
  return Buffer.from(`${tenantId}:${secretKey}`, "utf8");
}

/**
 * Encrypted blob format: base64(nonce || tag || ciphertext).
 */
export interface EncryptedBlob {
  readonly ciphertext: string;
}

/**
 * Encrypt a plaintext value under the given tenant DEK.
 *
 * @param dek         32-byte per-tenant DEK
 * @param tenantId    tenant identifier (used as AAD)
 * @param secretKey   secret key name (used as AAD)
 * @param plaintext   value to encrypt
 */
export function encryptValue(
  dek: Buffer,
  tenantId: string,
  secretKey: string,
  plaintext: string,
): EncryptedBlob {
  if (dek.length !== DEK_BYTES) {
    throw new Error(`DEK must be ${DEK_BYTES} bytes`);
  }
  const nonce = randomBytes(NONCE_BYTES);
  const aad = buildAad(tenantId, secretKey);
  const cipher = createCipheriv("aes-256-gcm", dek, nonce);
  cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const wire = Buffer.concat([nonce, tag, ct]).toString("base64");
  return { ciphertext: wire };
}

/**
 * Decrypt a ciphertext blob under the given tenant DEK. Will throw if
 * the AAD does not match (e.g. another tenant tries to decrypt) or if
 * the ciphertext was tampered with.
 */
export function decryptValue(
  dek: Buffer,
  tenantId: string,
  secretKey: string,
  blob: EncryptedBlob,
): string {
  if (dek.length !== DEK_BYTES) {
    throw new Error(`DEK must be ${DEK_BYTES} bytes`);
  }
  const wire = Buffer.from(blob.ciphertext, "base64");
  if (wire.length < NONCE_BYTES + TAG_BYTES + 1) {
    throw new Error("ciphertext too short");
  }
  const nonce = wire.subarray(0, NONCE_BYTES);
  const tag = wire.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES);
  const ct = wire.subarray(NONCE_BYTES + TAG_BYTES);
  const aad = buildAad(tenantId, secretKey);
  const decipher = createDecipheriv("aes-256-gcm", dek, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/**
 * Constant-time comparison of two byte strings. Returns false for any
 * length mismatch or non-string input. Uses Node's timingSafeEqual.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
