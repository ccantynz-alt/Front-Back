import { createHmac } from "node:crypto";
import type { Rng } from "./crypto.js";
import { systemRng } from "./crypto.js";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(data: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (let i = 0; i < data.length; i++) {
    value = (value << 8) | (data[i] ?? 0);
    bits += 8;
    while (bits >= 5) {
      const idx = (value >>> (bits - 5)) & 0x1f;
      out += BASE32_ALPHABET[idx];
      bits -= 5;
    }
  }
  if (bits > 0) {
    const idx = (value << (5 - bits)) & 0x1f;
    out += BASE32_ALPHABET[idx];
  }
  return out;
}

export function base32Decode(input: string): Uint8Array {
  const cleaned = input.replace(/=+$/u, "").toUpperCase().replace(/\s+/gu, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === undefined) {
      continue;
    }
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) {
      throw new Error(`invalid base32 character: ${ch}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export interface TotpOptions {
  digits?: number;
  step?: number;
  algorithm?: "sha1" | "sha256" | "sha512";
}

export function generateTotp(
  secretBase32: string,
  timestampSeconds: number,
  opts: TotpOptions = {},
): string {
  const digits = opts.digits ?? 6;
  const step = opts.step ?? 30;
  const algorithm = opts.algorithm ?? "sha1";

  const counter = Math.floor(timestampSeconds / step);
  const counterBuf = Buffer.alloc(8);
  // 8-byte big-endian counter
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const key = Buffer.from(base32Decode(secretBase32));
  const hmac = createHmac(algorithm, key).update(counterBuf).digest();

  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const bin =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);

  const mod = 10 ** digits;
  return String(bin % mod).padStart(digits, "0");
}

export function verifyTotp(
  secretBase32: string,
  code: string,
  timestampSeconds: number,
  opts: TotpOptions & { window?: number } = {},
): boolean {
  const window = opts.window ?? 1;
  const step = opts.step ?? 30;
  for (let w = -window; w <= window; w++) {
    const ts = timestampSeconds + w * step;
    if (ts < 0) {
      continue;
    }
    const expected = generateTotp(secretBase32, ts, opts);
    if (
      expected.length === code.length &&
      constantTimeStringEquals(expected, code)
    ) {
      return true;
    }
  }
  return false;
}

function constantTimeStringEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function generateSecret(byteLen = 20, rng: Rng = systemRng): string {
  return base32Encode(rng.bytes(byteLen));
}

export function buildOtpAuthUri(
  secretBase32: string,
  identifier: string,
  issuer: string,
  opts: TotpOptions = {},
): string {
  const digits = opts.digits ?? 6;
  const step = opts.step ?? 30;
  const algorithm = (opts.algorithm ?? "sha1").toUpperCase();
  const label = encodeURIComponent(`${issuer}:${identifier}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm,
    digits: String(digits),
    period: String(step),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function generateBackupCodes(count: number, rng: Rng = systemRng): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    // 10 hex chars from 5 random bytes -> easy to type, hard to guess
    out.push(Buffer.from(rng.bytes(5)).toString("hex"));
  }
  return out;
}
