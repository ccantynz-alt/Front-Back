// ── Crypto for Connection-String Custody ───────────────────────────────
// Connection strings are NEVER stored in plaintext on disk. We use
// AES-256-GCM with a per-tenant DEK derived from a master KEK via
// HKDF-SHA-256. AAD is `tenantId:dbId` so a ciphertext bound to one
// db cannot be decrypted under another tenant or db record — even if
// both DEKs were derived from the same KEK.

import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

import type { EncryptedBlob } from "./types";

const KEK_BYTES = 32;
const DEK_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HKDF_SALT = Buffer.from("crontech-managed-databases-v1", "utf8");

/**
 * Parse and validate the master KEK from a hex string.
 * Throws if the value is not exactly 64 hex chars (32 bytes).
 */
export function parseMasterKey(hex: string): Buffer {
  if (typeof hex !== "string" || hex.length !== KEK_BYTES * 2) {
    throw new Error(
      "MANAGED_DBS_MASTER_KEY must be a 64-character hex string (32 bytes)",
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("MANAGED_DBS_MASTER_KEY must be hex-encoded");
  }
  return Buffer.from(hex, "hex");
}

/**
 * Derive a per-tenant Data Encryption Key (DEK) from the master KEK.
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
  const out = hkdfSync("sha256", masterKey, HKDF_SALT, info, DEK_BYTES);
  return Buffer.from(out);
}

function buildAad(tenantId: string, dbId: string): Buffer {
  return Buffer.from(`${tenantId}:${dbId}`, "utf8");
}

export function encryptConnectionString(
  dek: Buffer,
  tenantId: string,
  dbId: string,
  plaintext: string,
): EncryptedBlob {
  if (dek.length !== DEK_BYTES) {
    throw new Error(`DEK must be ${DEK_BYTES} bytes`);
  }
  const nonce = randomBytes(NONCE_BYTES);
  const aad = buildAad(tenantId, dbId);
  const cipher = createCipheriv("aes-256-gcm", dek, nonce);
  cipher.setAAD(aad);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const wire = Buffer.concat([nonce, tag, ct]).toString("base64");
  return { ciphertext: wire };
}

export function decryptConnectionString(
  dek: Buffer,
  tenantId: string,
  dbId: string,
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
  const aad = buildAad(tenantId, dbId);
  const decipher = createDecipheriv("aes-256-gcm", dek, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/** Constant-time string equality. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  // Manual comparison to avoid early-exit; guarded by length match above.
  let diff = 0;
  for (let i = 0; i < ab.length; i++) {
    // biome-ignore lint/style/noNonNullAssertion: bounds checked above
    diff |= ab[i]! ^ bb[i]!;
  }
  return diff === 0;
}
