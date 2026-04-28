// ── Registry unit tests ─────────────────────────────────────────────
// Pure data tests against the in-memory bundle registry.

import { describe, expect, test } from "bun:test";
import {
  BundleIdSchema,
  BundleRegistry,
  BundleSchema,
  type RegisteredBundle,
  withDefaultLimits,
} from "../src/registry";
import { DEFAULT_LIMITS } from "../src/limits";

function makeBundle(overrides: Partial<RegisteredBundle> = {}): RegisteredBundle {
  return {
    id: "demo",
    code: "export default () => new Response('hi')",
    entrypoint: "worker.js",
    hash: "0".repeat(64),
    registeredAt: 1700000000_000,
    env: {},
    secrets: {},
    limits: DEFAULT_LIMITS,
    ...overrides,
  };
}

describe("BundleIdSchema", () => {
  test("accepts canonical lowercase ids", () => {
    expect(BundleIdSchema.parse("demo")).toBe("demo");
    expect(BundleIdSchema.parse("a-b_c-1")).toBe("a-b_c-1");
  });

  test("rejects uppercase, spaces, and other unsafe chars", () => {
    expect(() => BundleIdSchema.parse("Demo")).toThrow();
    expect(() => BundleIdSchema.parse("a b")).toThrow();
    expect(() => BundleIdSchema.parse("a/b")).toThrow();
    expect(() => BundleIdSchema.parse("")).toThrow();
  });

  test("rejects ids longer than 100 chars", () => {
    expect(() => BundleIdSchema.parse("a".repeat(101))).toThrow();
  });
});

describe("BundleSchema", () => {
  test("defaults entrypoint to worker.js", () => {
    const parsed = BundleSchema.parse({ id: "demo", code: "x" });
    expect(parsed.entrypoint).toBe("worker.js");
  });

  test("rejects empty code", () => {
    expect(() => BundleSchema.parse({ id: "demo", code: "" })).toThrow();
  });

  test("defaults env and secrets to empty maps", () => {
    const parsed = BundleSchema.parse({ id: "demo", code: "x" });
    expect(parsed.env).toEqual({});
    expect(parsed.secrets).toEqual({});
  });

  test("accepts env + secrets with valid keys", () => {
    const parsed = BundleSchema.parse({
      id: "demo",
      code: "x",
      env: { API_URL: "https://api.example.com" },
      secrets: { API_KEY: "sk-test-123" },
    });
    expect(parsed.env["API_URL"]).toBe("https://api.example.com");
    expect(parsed.secrets["API_KEY"]).toBe("sk-test-123");
  });

  test("rejects env keys that look like JS reserved chars", () => {
    expect(() =>
      BundleSchema.parse({ id: "demo", code: "x", env: { "1BAD": "x" } }),
    ).toThrow();
    expect(() =>
      BundleSchema.parse({ id: "demo", code: "x", env: { "BAD-KEY": "x" } }),
    ).toThrow();
  });

  test("accepts a custom limits object", () => {
    const parsed = BundleSchema.parse({
      id: "demo",
      code: "x",
      limits: { timeoutMs: 5_000, memoryMb: 64 },
    });
    expect(parsed.limits).toEqual({ timeoutMs: 5_000, memoryMb: 64 });
  });

  test("rejects limits outside the supported range", () => {
    expect(() =>
      BundleSchema.parse({ id: "demo", code: "x", limits: { timeoutMs: 1, memoryMb: 64 } }),
    ).toThrow();
    expect(() =>
      BundleSchema.parse({ id: "demo", code: "x", limits: { timeoutMs: 5_000, memoryMb: 4 } }),
    ).toThrow();
  });
});

describe("withDefaultLimits", () => {
  test("returns DEFAULT_LIMITS when nothing is provided", () => {
    expect(withDefaultLimits(undefined)).toBe(DEFAULT_LIMITS);
  });
  test("passes through explicit limits", () => {
    const custom = { timeoutMs: 1_000, memoryMb: 32 };
    expect(withDefaultLimits(custom)).toBe(custom);
  });
});

describe("BundleRegistry", () => {
  test("set + get round trip", () => {
    const reg = new BundleRegistry();
    const b = makeBundle();
    reg.set(b);
    const fetched = reg.get(b.id);
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe("demo");
    expect(fetched?.code).toBe(b.code);
  });

  test("get returns undefined when missing", () => {
    const reg = new BundleRegistry();
    expect(reg.get("missing")).toBeUndefined();
  });

  test("has reflects registration state", () => {
    const reg = new BundleRegistry();
    expect(reg.has("demo")).toBe(false);
    reg.set(makeBundle());
    expect(reg.has("demo")).toBe(true);
  });

  test("set replaces the existing entry rather than appending", () => {
    const reg = new BundleRegistry();
    reg.set(makeBundle({ code: "old" }));
    reg.set(makeBundle({ code: "new" }));
    expect(reg.size()).toBe(1);
    expect(reg.get("demo")?.code).toBe("new");
  });

  test("delete removes the entry and reports success", () => {
    const reg = new BundleRegistry();
    reg.set(makeBundle());
    expect(reg.delete("demo")).toBe(true);
    expect(reg.has("demo")).toBe(false);
  });

  test("delete reports false on a missing id", () => {
    const reg = new BundleRegistry();
    expect(reg.delete("missing")).toBe(false);
  });

  test("list returns all bundles sorted by id with metadata only", () => {
    const reg = new BundleRegistry();
    reg.set(makeBundle({ id: "zeta", code: "code-z" }));
    reg.set(makeBundle({ id: "alpha", code: "code-a", env: { FOO: "bar" } }));
    const list = reg.list();
    expect(list).toHaveLength(2);
    expect(list[0]?.id).toBe("alpha");
    expect(list[1]?.id).toBe("zeta");
    expect(list[0]?.codeBytes).toBe("code-a".length);
    expect(list[0]?.envKeys).toEqual(["FOO"]);
    // No raw code field leaks out via list().
    expect(Object.hasOwn(list[0] as object, "code")).toBe(false);
  });

  test("list emits secret KEY names but never values", () => {
    const reg = new BundleRegistry();
    reg.set(
      makeBundle({
        id: "secret-test",
        secrets: { API_KEY: "very-sensitive-value" },
      }),
    );
    const list = reg.list();
    expect(list[0]?.secretKeys).toEqual(["API_KEY"]);
    const serialised = JSON.stringify(list);
    expect(serialised).not.toContain("very-sensitive-value");
  });

  test("list snapshot is defensive — mutating it does not affect the registry", () => {
    const reg = new BundleRegistry();
    reg.set(makeBundle());
    const list = reg.list();
    list.length = 0;
    expect(reg.size()).toBe(1);
  });

  test("clear empties the registry", () => {
    const reg = new BundleRegistry();
    reg.set(makeBundle({ id: "a" }));
    reg.set(makeBundle({ id: "b" }));
    reg.clear();
    expect(reg.size()).toBe(0);
    expect(reg.list()).toHaveLength(0);
  });
});
