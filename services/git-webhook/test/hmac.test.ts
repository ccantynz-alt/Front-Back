// ── HMAC unit tests ─────────────────────────────────────────────────────

import { describe, expect, test } from "bun:test";

import { computeSignature, verifySignature } from "../src/hmac";

describe("computeSignature", () => {
  test("produces sha256= prefix and hex digest", () => {
    const sig = computeSignature("k", "hello");
    expect(sig.startsWith("sha256=")).toBe(true);
    expect(/^sha256=[0-9a-f]{64}$/.test(sig)).toBe(true);
  });

  test("matches a known fixture", () => {
    // HMAC-SHA256("It's a Secret to Everybody", "Hello, World!")
    // verified independently:
    //   sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17
    const sig = computeSignature(
      "It's a Secret to Everybody",
      "Hello, World!",
    );
    expect(sig).toBe(
      "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
    );
  });
});

describe("verifySignature", () => {
  test("accepts the matching signature", () => {
    const body = "{\"hello\":\"world\"}";
    const sig = computeSignature("topsecret", body);
    expect(verifySignature("topsecret", body, sig)).toBe(true);
  });

  test("rejects a wrong signature", () => {
    expect(
      verifySignature(
        "topsecret",
        "{}",
        "sha256=0000000000000000000000000000000000000000000000000000000000000000",
      ),
    ).toBe(false);
  });

  test("rejects undefined / null / empty signature header", () => {
    expect(verifySignature("k", "x", undefined)).toBe(false);
    expect(verifySignature("k", "x", null)).toBe(false);
    expect(verifySignature("k", "x", "")).toBe(false);
  });

  test("rejects sha1 prefix even if hex bytes happen to collide", () => {
    expect(
      verifySignature(
        "k",
        "x",
        "sha1=da39a3ee5e6b4b0d3255bfef95601890afd80709",
      ),
    ).toBe(false);
  });

  test("rejects when length differs from expected", () => {
    expect(verifySignature("k", "x", "sha256=short")).toBe(false);
  });
});
