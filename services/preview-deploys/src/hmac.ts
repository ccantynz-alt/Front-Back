/**
 * GitHub webhook HMAC validation.
 *
 * GitHub signs webhook payloads with HMAC-SHA-256 using a shared secret. The
 * resulting digest is sent in the `X-Hub-Signature-256` header as
 * `sha256=<hex>`. We verify in constant time to prevent timing attacks.
 */

const ENCODER = new TextEncoder();

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signPayload(
  secret: string,
  payload: string,
): Promise<string> {
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, ENCODER.encode(payload));
  return `sha256=${hex(sig)}`;
}

/**
 * Constant-time comparison of two equal-length strings.
 * Returns false if lengths differ.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function verifySignature(
  secret: string,
  payload: string,
  header: string | null,
): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = await signPayload(secret, payload);
  return timingSafeEqual(expected, header);
}
