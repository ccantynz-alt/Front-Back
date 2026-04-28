import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface Rng {
  bytes(n: number): Uint8Array;
  int(maxExclusive: number): number;
}

export const systemRng: Rng = {
  bytes(n: number): Uint8Array {
    return new Uint8Array(randomBytes(n));
  },
  int(maxExclusive: number): number {
    if (maxExclusive <= 0) {
      throw new Error("maxExclusive must be positive");
    }
    // Rejection sampling for unbiased mod via 4-byte unsigned ints.
    const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
    while (true) {
      const buf = randomBytes(4);
      const n =
        ((buf[0] ?? 0) << 24) |
        ((buf[1] ?? 0) << 16) |
        ((buf[2] ?? 0) << 8) |
        (buf[3] ?? 0);
      const u = n >>> 0;
      if (u < limit) {
        return u % maxExclusive;
      }
    }
  },
};

/**
 * Deterministic RNG seeded with arbitrary string. ONLY for tests.
 * Uses chained SHA-256 over a counter — not cryptographically suitable
 * for production OTP generation.
 */
export function seededRng(seed: string): Rng {
  let counter = 0;
  let pool = new Uint8Array(0);

  const refill = (need: number): void => {
    while (pool.length < need) {
      const h = createHash("sha256");
      h.update(seed);
      h.update(String(counter++));
      const next = h.digest();
      const merged = new Uint8Array(pool.length + next.length);
      merged.set(pool);
      merged.set(next, pool.length);
      pool = merged;
    }
  };

  return {
    bytes(n: number): Uint8Array {
      refill(n);
      const out = pool.slice(0, n);
      pool = pool.slice(n);
      return new Uint8Array(out);
    },
    int(maxExclusive: number): number {
      if (maxExclusive <= 0) {
        throw new Error("maxExclusive must be positive");
      }
      const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
      while (true) {
        refill(4);
        const b = pool.slice(0, 4);
        pool = pool.slice(4);
        const n =
          ((b[0] ?? 0) << 24) |
          ((b[1] ?? 0) << 16) |
          ((b[2] ?? 0) << 8) |
          (b[3] ?? 0);
        const u = n >>> 0;
        if (u < limit) {
          return u % maxExclusive;
        }
      }
    },
  };
}

export function generateCode(length: number, rng: Rng = systemRng): string {
  if (length < 4 || length > 10) {
    throw new Error("code length must be between 4 and 10");
  }
  let out = "";
  for (let i = 0; i < length; i++) {
    out += String(rng.int(10));
  }
  return out;
}

export function hmacSha256Hex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function hashIdentifier(secret: string, identifier: string): string {
  return hmacSha256Hex(secret, `id:${identifier}`);
}

export function hashCode(secret: string, code: string): string {
  return hmacSha256Hex(secret, `code:${code}`);
}

/**
 * Constant-time hex string comparison.
 * Returns false on length mismatch without timing leak from the comparator.
 */
export function constantTimeEqualsHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  try {
    const ba = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ba.length !== bb.length || ba.length === 0) {
      return false;
    }
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function urlSafeToken(byteLen: number, rng: Rng = systemRng): string {
  const buf = rng.bytes(byteLen);
  return Buffer.from(buf).toString("base64url");
}

export function generateUuid(rng: Rng = systemRng): string {
  const b = rng.bytes(16);
  // RFC 4122 v4 layout
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const hex = Buffer.from(b).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
