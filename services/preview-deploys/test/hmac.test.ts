import { describe, expect, test } from "bun:test";
import { signPayload, verifySignature } from "../src/hmac";

describe("hmac", () => {
  const secret = "supersecret";
  const payload = `{"action":"opened","number":1}`;

  test("verifies a freshly signed payload", async () => {
    const sig = await signPayload(secret, payload);
    expect(await verifySignature(secret, payload, sig)).toBe(true);
  });

  test("rejects mismatched signatures", async () => {
    const sig = await signPayload(secret, payload);
    expect(await verifySignature(secret, payload + "x", sig)).toBe(false);
    expect(await verifySignature("other", payload, sig)).toBe(false);
  });

  test("rejects missing or malformed headers", async () => {
    expect(await verifySignature(secret, payload, null)).toBe(false);
    expect(await verifySignature(secret, payload, "")).toBe(false);
    expect(await verifySignature(secret, payload, "deadbeef")).toBe(false);
    expect(await verifySignature(secret, payload, "sha1=foo")).toBe(false);
  });

  test("uses constant-length comparison (lengths must match)", async () => {
    const sig = await signPayload(secret, payload);
    const truncated = sig.slice(0, sig.length - 4);
    expect(await verifySignature(secret, payload, truncated)).toBe(false);
  });
});
