import { describe, expect, test } from "bun:test";
import {
  RestartPolicySchema,
  WorkerIdSchema,
  WorkerLimitsSchema,
  WorkerRegistrationSchema,
} from "../src/schema";

const VALID_SHA = "a".repeat(64);

describe("WorkerIdSchema", () => {
  test("accepts kebab-case ids", () => {
    expect(WorkerIdSchema.safeParse("queue-consumer").success).toBe(true);
    expect(WorkerIdSchema.safeParse("ws-1").success).toBe(true);
  });

  test("rejects bad ids", () => {
    expect(WorkerIdSchema.safeParse("Bad").success).toBe(false);
    expect(WorkerIdSchema.safeParse("ab").success).toBe(false);
    expect(WorkerIdSchema.safeParse("-leading").success).toBe(false);
    expect(WorkerIdSchema.safeParse("trailing-").success).toBe(false);
  });
});

describe("WorkerLimitsSchema", () => {
  test("applies defaults", () => {
    const res = WorkerLimitsSchema.parse({});
    expect(res.cpuShares).toBe(1024);
    expect(res.memBytes).toBe(256 * 1024 * 1024);
    expect(res.timeoutMs).toBeUndefined();
  });

  test("rejects sub-floor memory", () => {
    expect(
      WorkerLimitsSchema.safeParse({ memBytes: 1024 }).success,
    ).toBe(false);
  });
});

describe("WorkerRegistrationSchema", () => {
  test("validates a full payload", () => {
    const result = WorkerRegistrationSchema.parse({
      workerId: "worker-1",
      tenantId: "tenant-1",
      tarballUrl: "https://cdn.example.com/build.tar.gz",
      sha256: VALID_SHA,
      command: ["bun", "run", "worker.ts"],
      env: { NODE_ENV: "production" },
      secrets: { DB_URL: "postgres://x" },
      restartPolicy: "always",
    });
    expect(result.gracePeriodMs).toBe(10_000);
    expect(result.limits.memBytes).toBe(256 * 1024 * 1024);
    expect(result.restartPolicy).toBe("always");
  });

  test("defaults restartPolicy to on-failure", () => {
    const r = WorkerRegistrationSchema.parse({
      workerId: "x-y",
      tenantId: "t-1",
      tarballUrl: "https://example.com/x.tar.gz",
      sha256: VALID_SHA,
      command: ["./run.sh"],
    });
    expect(r.restartPolicy).toBe("on-failure");
  });

  test("rejects empty command array", () => {
    expect(
      WorkerRegistrationSchema.safeParse({
        workerId: "x-y",
        tenantId: "t-1",
        tarballUrl: "https://example.com/x.tar.gz",
        sha256: VALID_SHA,
        command: [],
      }).success,
    ).toBe(false);
  });

  test("rejects invalid sha256", () => {
    expect(
      WorkerRegistrationSchema.safeParse({
        workerId: "x-y",
        tenantId: "t-1",
        tarballUrl: "https://example.com/x.tar.gz",
        sha256: "not-a-hash",
        command: ["./run"],
      }).success,
    ).toBe(false);
  });

  test("rejects unknown restart policies", () => {
    expect(RestartPolicySchema.safeParse("sometimes").success).toBe(false);
  });
});
