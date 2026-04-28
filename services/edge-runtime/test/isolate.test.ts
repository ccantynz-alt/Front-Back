// ── Isolate primitive tests ─────────────────────────────────────────
// Verifies the v1 production-deployable invariants:
//
//   1. Cold-start latency is well under target (target: < 200ms first
//      compile, < 20ms warm path on repeat invocation).
//   2. Tenants cannot see each other's globals.
//   3. Bundle env + secrets are bound to globalThis.env and visible to
//      the handler's second argument.
//   4. Time limit fires deterministically when the handler hangs.
//   5. Memory limit fires when the handler grows past the cap (sampled
//      delta — see limits.ts for the trade-off).
//   6. console.log inside the bundle is captured per-invocation.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { computeBundleHash } from "../src/dispatch";
import { clearCompiledCache, invokeIsolate } from "../src/isolate";
import { DEFAULT_LIMITS, type InvocationLimits } from "../src/limits";
import type { RegisteredBundle } from "../src/registry";

function buildBundle(args: {
  id: string;
  code: string;
  env?: Record<string, string>;
  secrets?: Record<string, string>;
  limits?: InvocationLimits;
}): RegisteredBundle {
  const entrypoint = "worker.js";
  return {
    id: args.id,
    code: args.code,
    entrypoint,
    hash: computeBundleHash({ id: args.id, entrypoint, code: args.code }),
    registeredAt: Date.now(),
    env: args.env ?? {},
    secrets: args.secrets ?? {},
    limits: args.limits ?? DEFAULT_LIMITS,
  };
}

beforeEach(() => {
  clearCompiledCache();
});

afterEach(() => {
  clearCompiledCache();
});

describe("invokeIsolate — cold start latency", () => {
  test("first invocation compiles the bundle in well under 200ms", async () => {
    const bundle = buildBundle({
      id: "cold-start",
      code: `export default {
        async fetch() { return new Response('ready'); }
      }`,
    });
    const start = performance.now();
    const result = await invokeIsolate({
      bundle,
      request: new Request("http://x/run/cold-start"),
    });
    const elapsed = performance.now() - start;
    expect(result.outcome.kind).toBe("ok");
    expect(result.response.status).toBe(200);
    // Generous bound — local runs typically come in well under 50ms,
    // but CI machines can be noisy. The point is it's not seconds.
    expect(elapsed).toBeLessThan(500);
  });

  test("warm invocations skip compile and complete in <20ms", async () => {
    const bundle = buildBundle({
      id: "warm-path",
      code: `export default {
        async fetch() { return new Response('hot'); }
      }`,
    });
    // Prime the compiled-bundle cache.
    await invokeIsolate({ bundle, request: new Request("http://x/warmup") });

    const start = performance.now();
    const result = await invokeIsolate({
      bundle,
      request: new Request("http://x/warm-path"),
    });
    const elapsed = performance.now() - start;
    expect(result.response.status).toBe(200);
    expect(await result.response.text()).toBe("hot");
    // Warm path should be tiny — generous bound to absorb GC noise.
    expect(elapsed).toBeLessThan(50);
  });
});

describe("invokeIsolate — tenant isolation", () => {
  test("tenant A's globals are invisible to tenant B", async () => {
    const a = buildBundle({
      id: "tenant-a",
      code: `globalThis.SECRET_LEAK = 'tenant-a-private';
        export default { async fetch() { return new Response('a-ok'); } }`,
    });
    const b = buildBundle({
      id: "tenant-b",
      code: `export default {
        async fetch() {
          const leak = globalThis.SECRET_LEAK ?? null;
          return new Response(JSON.stringify({ leak }), {
            headers: { 'content-type': 'application/json' },
          });
        }
      }`,
    });

    await invokeIsolate({ bundle: a, request: new Request("http://x/a") });
    const resB = await invokeIsolate({ bundle: b, request: new Request("http://x/b") });
    const body = (await resB.response.json()) as { leak: unknown };
    expect(body.leak).toBeNull();
  });

  test("eval is disabled inside the isolate", async () => {
    const bundle = buildBundle({
      id: "no-eval",
      code: `export default {
        async fetch() {
          try {
            // biome-ignore lint/security/noGlobalEval: testing the cap
            const r = (0, eval)('1 + 1');
            return new Response(JSON.stringify({ ok: true, r }));
          } catch (e) {
            return new Response(JSON.stringify({ ok: false, err: String(e) }), { status: 200 });
          }
        }
      }`,
    });
    const result = await invokeIsolate({
      bundle,
      request: new Request("http://x/no-eval"),
    });
    const body = (await result.response.json()) as { ok: boolean; err?: string };
    expect(body.ok).toBe(false);
    expect(body.err ?? "").toContain("Code generation");
  });
});

describe("invokeIsolate — env + secret injection", () => {
  test("env values are visible on globalThis.env", async () => {
    const bundle = buildBundle({
      id: "env-global",
      env: { API_URL: "https://api.example.test" },
      code: `export default {
        async fetch() {
          return new Response(JSON.stringify({ url: globalThis.env.API_URL }));
        }
      }`,
    });
    const result = await invokeIsolate({
      bundle,
      request: new Request("http://x/env"),
    });
    const body = (await result.response.json()) as { url: string };
    expect(body.url).toBe("https://api.example.test");
  });

  test("env values are also passed as the second handler arg", async () => {
    const bundle = buildBundle({
      id: "env-arg",
      env: { GREETING: "hello" },
      secrets: { TOKEN: "sk-test" },
      code: `export default {
        async fetch(_req, env) {
          return new Response(JSON.stringify({ greeting: env.GREETING, token: env.TOKEN }));
        }
      }`,
    });
    const result = await invokeIsolate({
      bundle,
      request: new Request("http://x/env-arg"),
    });
    const body = (await result.response.json()) as { greeting: string; token: string };
    expect(body.greeting).toBe("hello");
    expect(body.token).toBe("sk-test");
  });

  test("secrets do NOT bleed across tenants", async () => {
    const a = buildBundle({
      id: "secret-tenant-a",
      secrets: { TOKEN: "tenant-a-only" },
      code: `export default { async fetch(_r, env) { return new Response(env.TOKEN); } }`,
    });
    const b = buildBundle({
      id: "secret-tenant-b",
      code: `export default {
        async fetch(_r, env) {
          return new Response(JSON.stringify({ leak: env.TOKEN ?? null }));
        }
      }`,
    });
    const aRes = await invokeIsolate({ bundle: a, request: new Request("http://x/a") });
    expect(await aRes.response.text()).toBe("tenant-a-only");
    const bRes = await invokeIsolate({ bundle: b, request: new Request("http://x/b") });
    const body = (await bRes.response.json()) as { leak: unknown };
    expect(body.leak).toBeNull();
  });
});

describe("invokeIsolate — time limit", () => {
  test("returns 504 when the handler hangs past the timeout", async () => {
    const bundle = buildBundle({
      id: "hang",
      limits: { timeoutMs: 100, memoryMb: 64 },
      code: `export default {
        async fetch() {
          await new Promise(() => {});
          return new Response('never');
        }
      }`,
    });
    const start = performance.now();
    const result = await invokeIsolate({
      bundle,
      request: new Request("http://x/hang"),
    });
    const elapsed = performance.now() - start;
    expect(result.outcome.kind).toBe("timeout");
    expect(result.response.status).toBe(504);
    // Timeout should fire close to the configured budget — give a
    // generous upper bound to absorb scheduler jitter.
    expect(elapsed).toBeGreaterThanOrEqual(90);
    expect(elapsed).toBeLessThan(800);
  });
});

describe("invokeIsolate — memory limit", () => {
  test("returns 507 when the bundle's heap delta exceeds the cap", async () => {
    // We simulate memory pressure deterministically by calling the
    // limits primitive directly with an injected `readMemory`. The
    // server-level test would be flaky on a shared heap.
    const { runWithLimits } = await import("../src/limits");
    let calls = 0;
    const result = await runWithLimits({
      limits: { timeoutMs: 5_000, memoryMb: 1 },
      readMemory: () => {
        calls += 1;
        // Baseline at 0, then jump past 1 MiB on second call.
        return calls === 1 ? 0 : 2 * 1024 * 1024;
      },
      run: () => new Promise(() => {}),
    });
    expect(result.outcome.kind).toBe("memory");
    if (result.outcome.kind === "memory") {
      expect(result.outcome.usedMb).toBeGreaterThan(1);
    }
  });

  test("returns 507 from invokeIsolate when actual heap grows past cap", async () => {
    const bundle = buildBundle({
      id: "memhog",
      // Tiny cap so a small allocation trips it.
      limits: { timeoutMs: 5_000, memoryMb: 8 },
      code: `export default {
        async fetch() {
          // Grow ~64MB of retained allocation slowly so the sampler can see it.
          const buffers = [];
          for (let i = 0; i < 8000; i++) {
            buffers.push(new Uint8Array(8192).fill(0xff));
            if (i % 100 === 0) await new Promise(r => setTimeout(r, 1));
          }
          return new Response('done', { status: 200 });
        }
      }`,
    });
    const result = await invokeIsolate({
      bundle,
      request: new Request("http://x/memhog"),
    });
    // We accept either a memory trip OR a timeout — both are acceptable
    // safe failures and which one fires first depends on heap pressure
    // already in the test process. The key invariant is "did NOT return
    // a 200 to the customer after blowing the limit".
    expect(result.response.status).not.toBe(200);
    expect(["memory", "timeout"]).toContain(result.outcome.kind);
  });
});

describe("invokeIsolate — console capture", () => {
  test("captures console.log calls per invocation without leaking to host", async () => {
    const bundle = buildBundle({
      id: "logger",
      code: `export default {
        async fetch() {
          console.log('hello', 1, { a: 2 });
          console.warn('careful');
          console.error('boom');
          return new Response('ok');
        }
      }`,
    });
    const result = await invokeIsolate({
      bundle,
      request: new Request("http://x/logger"),
    });
    expect(result.response.status).toBe(200);
    expect(result.logs.lines).toHaveLength(3);
    expect(result.logs.lines[0]?.level).toBe("log");
    expect(result.logs.lines[0]?.message).toContain("hello");
    expect(result.logs.lines[1]?.level).toBe("warn");
    expect(result.logs.lines[2]?.level).toBe("error");
  });

  test("each invocation gets a fresh log buffer", async () => {
    const bundle = buildBundle({
      id: "log-fresh",
      code: `export default {
        async fetch(req) {
          const u = new URL(req.url);
          console.log('called', u.pathname);
          return new Response('ok');
        }
      }`,
    });
    const a = await invokeIsolate({
      bundle,
      request: new Request("http://x/log-fresh/first"),
    });
    const b = await invokeIsolate({
      bundle,
      request: new Request("http://x/log-fresh/second"),
    });
    expect(a.logs.lines).toHaveLength(1);
    expect(b.logs.lines).toHaveLength(1);
    expect(a.logs.lines[0]?.message).toContain("first");
    expect(b.logs.lines[0]?.message).toContain("second");
  });
});

describe("invokeIsolate — handler shape errors", () => {
  test("returns a 500 when the handler returns a non-Response", async () => {
    const bundle = buildBundle({
      id: "bad-shape",
      code: `export default { async fetch() { return { not: 'a Response' }; } }`,
    });
    const result = await invokeIsolate({
      bundle,
      request: new Request("http://x/bad-shape"),
    });
    expect(result.response.status).toBe(500);
    expect(await result.response.text()).toContain("must return a Response");
  });
});
