// ── Tunnel mutual-auth tests ───────────────────────────────────────
//
// Covers: HMAC sign/verify happy path, signature mismatch, freshness
// expiry, malformed token, claims schema enforcement, constant-time
// equality.

import { describe, expect, test } from "bun:test";
import {
  AuthError,
  type TunnelClaims,
  generateNonce,
  signTunnelToken,
  timingSafeEqual,
  verifyTunnelToken,
} from "../auth";

const SECRET = "super-secret-tunnel-key-do-not-share";

function sampleClaims(overrides: Partial<TunnelClaims> = {}): TunnelClaims {
  return {
    id: "vps-vultr-1",
    ts: Math.floor(Date.now() / 1000),
    nonce: generateNonce(),
    hostnames: ["demo.crontech.app"],
    ...overrides,
  };
}

describe("auth: timingSafeEqual", () => {
  test("equal strings compare true", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
  });
  test("unequal strings compare false", () => {
    expect(timingSafeEqual("abc", "abd")).toBe(false);
  });
  test("different lengths compare false", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});

describe("auth: sign + verify happy path", () => {
  test("a freshly signed token verifies", async () => {
    const claims = sampleClaims();
    const token = await signTunnelToken(claims, SECRET);
    const verified = await verifyTunnelToken(token, SECRET);
    expect(verified.id).toBe(claims.id);
    expect(verified.hostnames).toEqual(claims.hostnames);
    expect(verified.nonce).toBe(claims.nonce);
  });

  test("multi-hostname tokens verify", async () => {
    const claims = sampleClaims({ hostnames: ["a.example", "b.example", "c.example"] });
    const token = await signTunnelToken(claims, SECRET);
    const verified = await verifyTunnelToken(token, SECRET);
    expect(verified.hostnames).toEqual(["a.example", "b.example", "c.example"]);
  });
});

describe("auth: failure modes", () => {
  test("verify rejects on wrong secret", async () => {
    const token = await signTunnelToken(sampleClaims(), SECRET);
    await expect(verifyTunnelToken(token, "wrong-secret")).rejects.toBeInstanceOf(AuthError);
  });

  test("verify rejects on tampered claims", async () => {
    const token = await signTunnelToken(sampleClaims(), SECRET);
    // Flip a character in the claims half.
    const dot = token.indexOf(".");
    const tampered = `${token.slice(0, dot - 1)}A${token.slice(dot)}`;
    await expect(verifyTunnelToken(tampered, SECRET)).rejects.toBeInstanceOf(AuthError);
  });

  test("verify rejects malformed token", async () => {
    await expect(verifyTunnelToken("notatoken", SECRET)).rejects.toBeInstanceOf(AuthError);
    await expect(verifyTunnelToken("", SECRET)).rejects.toBeInstanceOf(AuthError);
  });

  test("verify rejects an expired token", async () => {
    const claims = sampleClaims({ ts: 1_000_000 }); // ancient
    const token = await signTunnelToken(claims, SECRET);
    await expect(
      verifyTunnelToken(token, SECRET, { nowSeconds: 9_999_999, freshnessSeconds: 60 }),
    ).rejects.toBeInstanceOf(AuthError);
  });

  test("signing without a secret throws", async () => {
    await expect(signTunnelToken(sampleClaims(), "")).rejects.toBeInstanceOf(AuthError);
  });

  test("signing without hostnames throws", async () => {
    await expect(
      signTunnelToken(sampleClaims({ hostnames: [] }), SECRET),
    ).rejects.toBeInstanceOf(AuthError);
  });
});

describe("auth: nonce", () => {
  test("nonces are non-empty and unique", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) {
      seen.add(generateNonce());
    }
    expect(seen.size).toBe(50);
  });
});
