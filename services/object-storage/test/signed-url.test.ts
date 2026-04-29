// ── Signed URL unit tests ────────────────────────────────────────────
// Pure-function tests for the HMAC signing + verification logic. The
// server tests cover the integration; these cover edge cases that the
// integration tests would have to contort to reach.

import { describe, expect, test } from "bun:test";
import { sign, toQueryString, verify } from "../src/signed-url";

const SECRET = "unit-test-secret";

describe("sign + verify round-trip", () => {
  test("valid signature passes verification", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60;
    const signed = sign(
      { method: "GET", bucket: "b", key: "k", expiresAt, principal: "p" },
      SECRET,
    );
    const params = new URLSearchParams(toQueryString(signed));
    const result = verify(params, { method: "GET", bucket: "b", key: "k" }, SECRET);
    expect(result.ok).toBe(true);
  });

  test("missing fields produce ok=false with reason 'missing'", () => {
    const params = new URLSearchParams("expires=123");
    const result = verify(params, { method: "GET", bucket: "b", key: "k" }, SECRET);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: "missing" });
  });

  test("expired URL returns reason 'expired'", () => {
    const expiresAt = Math.floor(Date.now() / 1000) - 60;
    const signed = sign(
      { method: "GET", bucket: "b", key: "k", expiresAt, principal: "p" },
      SECRET,
    );
    const params = new URLSearchParams(toQueryString(signed));
    const result = verify(params, { method: "GET", bucket: "b", key: "k" }, SECRET);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: "expired" });
  });

  test("method swap is detected", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60;
    const signed = sign(
      { method: "GET", bucket: "b", key: "k", expiresAt, principal: "p" },
      SECRET,
    );
    const params = new URLSearchParams(toQueryString(signed));
    const result = verify(params, { method: "DELETE", bucket: "b", key: "k" }, SECRET);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: "invalid" });
  });

  test("bucket swap is detected", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 60;
    const signed = sign(
      { method: "GET", bucket: "alpha", key: "k", expiresAt, principal: "p" },
      SECRET,
    );
    const params = new URLSearchParams(toQueryString(signed));
    const result = verify(params, { method: "GET", bucket: "beta", key: "k" }, SECRET);
    expect(result.ok).toBe(false);
  });

  test("signature length mismatch does not throw", () => {
    const params = new URLSearchParams({
      signed: "deadbeef",
      expires: String(Math.floor(Date.now() / 1000) + 60),
      method: "GET",
      principal: "p",
    });
    const result = verify(params, { method: "GET", bucket: "b", key: "k" }, SECRET);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: "invalid" });
  });

  test("empty secret throws on sign", () => {
    expect(() =>
      sign(
        { method: "GET", bucket: "b", key: "k", expiresAt: 1, principal: "p" },
        "",
      ),
    ).toThrow();
  });
});
