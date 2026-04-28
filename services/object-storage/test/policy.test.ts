// ── Bucket policy unit tests ────────────────────────────────────────
// Direct authorize() tests covering every visibility × verb × identity
// combination. The server tests cover the integration.

import { describe, expect, test } from "bun:test";
import type { AuthIdentity } from "../src/auth";
import { authorize, type BucketPolicy } from "../src/policy";

const member: AuthIdentity = {
  principal: "m",
  writableBuckets: new Set(["b"]),
  readableBuckets: new Set(["b"]),
};

const stranger: AuthIdentity = {
  principal: "s",
  writableBuckets: new Set(),
  readableBuckets: new Set(),
};

describe("authorize()", () => {
  test("public-read allows anonymous reads", () => {
    const policy: BucketPolicy = { bucket: "b", visibility: "public-read" };
    expect(authorize(policy, null, "read", "b")).toBe(true);
  });

  test("public-read denies anonymous writes", () => {
    const policy: BucketPolicy = { bucket: "b", visibility: "public-read" };
    expect(authorize(policy, null, "write", "b")).toBe(false);
  });

  test("public-read allows member writes", () => {
    const policy: BucketPolicy = { bucket: "b", visibility: "public-read" };
    expect(authorize(policy, member, "write", "b")).toBe(true);
  });

  test("authenticated allows any logged-in identity to read", () => {
    const policy: BucketPolicy = { bucket: "b", visibility: "authenticated" };
    expect(authorize(policy, stranger, "read", "b")).toBe(true);
  });

  test("authenticated denies anonymous reads", () => {
    const policy: BucketPolicy = { bucket: "b", visibility: "authenticated" };
    expect(authorize(policy, null, "read", "b")).toBe(false);
  });

  test("private requires explicit membership for reads", () => {
    const policy: BucketPolicy = { bucket: "b", visibility: "private" };
    expect(authorize(policy, member, "read", "b")).toBe(true);
    expect(authorize(policy, stranger, "read", "b")).toBe(false);
  });

  test("private requires explicit membership for writes", () => {
    const policy: BucketPolicy = { bucket: "b", visibility: "private" };
    expect(authorize(policy, member, "write", "b")).toBe(true);
    expect(authorize(policy, stranger, "write", "b")).toBe(false);
  });

  test("missing policy is treated as private", () => {
    expect(authorize(null, null, "read", "b")).toBe(false);
    expect(authorize(null, member, "read", "b")).toBe(true);
    expect(authorize(null, member, "write", "b")).toBe(true);
  });
});
