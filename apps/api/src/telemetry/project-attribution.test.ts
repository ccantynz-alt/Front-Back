// ── project-attribution unit tests ──────────────────────────────────
//
// Exercises the three observable behaviours of the attribution module:
//
//   1. `runWithProjectId` pushes an ALS frame; callers inside the
//      callback see it via `getCurrentProjectId()` / `withProjectAttrs`.
//   2. With no frame pushed, both helpers return "nothing extra" so
//      non-project code paths stay byte-identical.
//   3. The Hono-style middleware pushes the frame for the duration of
//      `next()` when a `projectId` is present (path or header), and
//      leaves the context untouched otherwise.
//   4. The tRPC-style middleware pulls `projectId` out of the raw
//      input and wraps `next()` the same way.
//
// The OTel MeterProvider itself is not instantiated here — we only
// need to prove the attribute plumbing flows through ALS correctly.
// The HTTP-level enrichment is exercised end-to-end by `withProjectAttrs`.

import { describe, expect, test } from "bun:test";
import {
  runWithProjectId,
  getCurrentProjectId,
  withProjectAttrs,
  projectAttributionMiddleware,
  projectAttributionTrpcMiddleware,
} from "./project-attribution";

describe("AsyncLocalStorage primitives", () => {
  test("getCurrentProjectId returns undefined outside any frame", () => {
    expect(getCurrentProjectId()).toBeUndefined();
  });

  test("runWithProjectId pushes a frame visible synchronously", () => {
    runWithProjectId("proj-123", () => {
      expect(getCurrentProjectId()).toBe("proj-123");
    });
  });

  test("runWithProjectId frame survives awaits", async () => {
    await runWithProjectId("proj-async", async () => {
      await Promise.resolve();
      // Yield to the event loop twice to prove ALS carries through
      // nested microtasks (the exact shape OTel async-hooks relies on).
      await new Promise((r) => setTimeout(r, 0));
      expect(getCurrentProjectId()).toBe("proj-async");
    });
  });

  test("frames do not leak out of their scope", () => {
    runWithProjectId("inner", () => {
      expect(getCurrentProjectId()).toBe("inner");
    });
    expect(getCurrentProjectId()).toBeUndefined();
  });

  test("nested frames override the outer frame", () => {
    runWithProjectId("outer", () => {
      expect(getCurrentProjectId()).toBe("outer");
      runWithProjectId("inner", () => {
        expect(getCurrentProjectId()).toBe("inner");
      });
      expect(getCurrentProjectId()).toBe("outer");
    });
  });
});

describe("withProjectAttrs", () => {
  test("returns the base attributes unchanged outside a frame", () => {
    const out = withProjectAttrs({ method: "GET", path: "/health" });
    expect(out).toEqual({ method: "GET", path: "/health" });
    expect("project_id" in out).toBe(false);
  });

  test("merges project_id into the attribute bag inside a frame", () => {
    runWithProjectId("proj-abc", () => {
      const out = withProjectAttrs({ method: "GET", path: "/metrics" });
      expect(out).toEqual({
        method: "GET",
        path: "/metrics",
        project_id: "proj-abc",
      });
    });
  });

  test("does not mutate the input object", () => {
    const base = { method: "GET" };
    runWithProjectId("proj-xyz", () => {
      const out = withProjectAttrs(base);
      expect(out).not.toBe(base);
      expect("project_id" in base).toBe(false);
    });
  });
});

describe("Hono middleware", () => {
  const mw = projectAttributionMiddleware();

  function fakeCtx(path: string, headers: Record<string, string> = {}) {
    return {
      req: {
        path,
        header: (name: string): string | undefined =>
          headers[name.toLowerCase()],
      },
    };
  }

  test("sets project_id from a /projects/:id path", async () => {
    let observed: string | undefined;
    await mw(fakeCtx("/api/projects/11111111-1111-1111-1111-111111111111/deploy"), async () => {
      observed = getCurrentProjectId();
    });
    expect(observed).toBe("11111111-1111-1111-1111-111111111111");
    // And the frame pops when next() returns.
    expect(getCurrentProjectId()).toBeUndefined();
  });

  test("sets project_id from an explicit x-project-id header", async () => {
    let observed: string | undefined;
    await mw(
      fakeCtx("/api/unrelated", { "x-project-id": "proj-header-42" }),
      async () => {
        observed = getCurrentProjectId();
      },
    );
    expect(observed).toBe("proj-header-42");
  });

  test("leaves context unset for non-project routes", async () => {
    let observed: string | undefined | "was-set" = "was-set";
    await mw(fakeCtx("/api/health"), async () => {
      observed = getCurrentProjectId();
    });
    expect(observed).toBeUndefined();
  });

  test("emitted metric attribute inside middleware includes project_id", async () => {
    // Simulates exactly what the Hono telemetry middleware does: call
    // `withProjectAttrs` while the request-scoped frame is active.
    const captured: Array<Record<string, string | number | boolean>> = [];
    await mw(
      fakeCtx("/api/projects/abcdef01-2345-6789-abcd-ef0123456789"),
      async () => {
        captured.push(
          withProjectAttrs({ method: "GET", path: "/api/projects/x" }),
        );
      },
    );
    expect(captured[0]).toEqual({
      method: "GET",
      path: "/api/projects/x",
      project_id: "abcdef01-2345-6789-abcd-ef0123456789",
    });
  });

  test("continues to pop the frame even when next() throws", async () => {
    await expect(
      mw(fakeCtx("/api/projects/11111111-1111-1111-1111-111111111111"), async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(getCurrentProjectId()).toBeUndefined();
  });
});

describe("tRPC middleware", () => {
  test("pulls projectId from rawInput and wraps next()", async () => {
    let observed: string | undefined;
    await projectAttributionTrpcMiddleware({
      rawInput: { projectId: "proj-trpc-1" },
      next: async () => {
        observed = getCurrentProjectId();
        return { ok: true };
      },
    });
    expect(observed).toBe("proj-trpc-1");
  });

  test("supports the lazy `getRawInput` variant of the tRPC v11 API", async () => {
    let observed: string | undefined;
    await projectAttributionTrpcMiddleware({
      getRawInput: async () => ({ projectId: "proj-lazy" }),
      next: async () => {
        observed = getCurrentProjectId();
        return { ok: true };
      },
    });
    expect(observed).toBe("proj-lazy");
  });

  test("leaves context unset when no projectId is in the input", async () => {
    let observed: string | undefined | "was-set" = "was-set";
    await projectAttributionTrpcMiddleware({
      rawInput: { somethingElse: 42 },
      next: async () => {
        observed = getCurrentProjectId();
        return { ok: true };
      },
    });
    expect(observed).toBeUndefined();
  });

  test("tolerates malformed / non-object input without throwing", async () => {
    let observed: string | undefined | "was-set" = "was-set";
    await projectAttributionTrpcMiddleware({
      rawInput: "not-an-object",
      next: async () => {
        observed = getCurrentProjectId();
        return { ok: true };
      },
    });
    expect(observed).toBeUndefined();
  });

  test("tolerates an input-getter that throws", async () => {
    let observed: string | undefined | "was-set" = "was-set";
    await projectAttributionTrpcMiddleware({
      getRawInput: async () => {
        throw new Error("input parser failure");
      },
      next: async () => {
        observed = getCurrentProjectId();
        return { ok: true };
      },
    });
    // We swallow the parser error so the real validator can raise it
    // downstream; attribution stays unset.
    expect(observed).toBeUndefined();
  });

  test("frame pops after next() resolves", async () => {
    await projectAttributionTrpcMiddleware({
      rawInput: { projectId: "proj-pop" },
      next: async () => ({ ok: true }),
    });
    expect(getCurrentProjectId()).toBeUndefined();
  });

  test("frame pops even when next() throws", async () => {
    await expect(
      projectAttributionTrpcMiddleware({
        rawInput: { projectId: "proj-throw" },
        next: async () => {
          throw new Error("handler failed");
        },
      }),
    ).rejects.toThrow("handler failed");
    expect(getCurrentProjectId()).toBeUndefined();
  });
});
