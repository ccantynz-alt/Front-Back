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

import { describe, expect, test, beforeEach } from "bun:test";
import {
  runWithProjectId,
  getCurrentProjectId,
  withProjectAttrs,
  projectAttributionMiddleware,
  projectAttributionTrpcMiddleware,
} from "./project-attribution";
import {
  _getProjectInflightSnapshot,
  _resetProjectInflight,
  incrementProjectInflight,
  decrementProjectInflight,
} from "../telemetry";

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

// ── project_requests_inflight gauge plumbing ─────────────────────────
//
// Covers:
//   1. `incrementProjectInflight` / `decrementProjectInflight` update
//      the shared map predictably.
//   2. The Hono middleware increments on entry and decrements on exit,
//      including when the handler throws.
//   3. The tRPC middleware does the same based on input.projectId.
//   4. Concurrent requests for the same project raise the count past 1
//      and return to 0 once all finish.
//   5. Requests with no projectId don't touch the map at all.

describe("project_requests_inflight — direct helpers", () => {
  beforeEach(() => {
    _resetProjectInflight();
  });

  test("increment creates the entry with count 1", () => {
    incrementProjectInflight("proj-A");
    const snap = _getProjectInflightSnapshot();
    expect(snap.get("proj-A")?.count).toBe(1);
  });

  test("increment twice yields count 2", () => {
    incrementProjectInflight("proj-A");
    incrementProjectInflight("proj-A");
    expect(_getProjectInflightSnapshot().get("proj-A")?.count).toBe(2);
  });

  test("decrement brings the count down but keeps the entry at 0 during grace", () => {
    incrementProjectInflight("proj-A");
    decrementProjectInflight("proj-A");
    const entry = _getProjectInflightSnapshot().get("proj-A");
    expect(entry?.count).toBe(0);
    // Entry is still in the map so the observable gauge can emit its 0.
    expect(entry).toBeDefined();
  });

  test("decrement of an unknown project is a no-op", () => {
    decrementProjectInflight("proj-never-seen");
    expect(_getProjectInflightSnapshot().size).toBe(0);
  });

  test("decrement never drops below 0", () => {
    incrementProjectInflight("proj-A");
    decrementProjectInflight("proj-A");
    decrementProjectInflight("proj-A");
    decrementProjectInflight("proj-A");
    expect(_getProjectInflightSnapshot().get("proj-A")?.count).toBe(0);
  });

  test("multiple projects are tracked independently", () => {
    incrementProjectInflight("proj-A");
    incrementProjectInflight("proj-B");
    incrementProjectInflight("proj-B");
    const snap = _getProjectInflightSnapshot();
    expect(snap.get("proj-A")?.count).toBe(1);
    expect(snap.get("proj-B")?.count).toBe(2);
  });
});

describe("project_requests_inflight — Hono middleware integration", () => {
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

  beforeEach(() => {
    _resetProjectInflight();
  });

  test("middleware increments on entry and returns to 0 on exit", async () => {
    let seenCount: number | undefined;
    await mw(
      fakeCtx("/api/projects/11111111-1111-1111-1111-111111111111/deploy"),
      async () => {
        seenCount = _getProjectInflightSnapshot()
          .get("11111111-1111-1111-1111-111111111111")?.count;
      },
    );
    expect(seenCount).toBe(1);
    expect(
      _getProjectInflightSnapshot()
        .get("11111111-1111-1111-1111-111111111111")?.count,
    ).toBe(0);
  });

  test("middleware still decrements when the handler throws", async () => {
    await expect(
      mw(
        fakeCtx("/api/projects/22222222-2222-2222-2222-222222222222"),
        async () => {
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow("boom");
    expect(
      _getProjectInflightSnapshot()
        .get("22222222-2222-2222-2222-222222222222")?.count,
    ).toBe(0);
  });

  test("requests with no projectId do not touch the map", async () => {
    await mw(fakeCtx("/api/health"), async () => {});
    expect(_getProjectInflightSnapshot().size).toBe(0);
  });

  test("concurrent requests for the same project raise and lower the count", async () => {
    const id = "33333333-3333-3333-3333-333333333333";
    let peak = 0;
    let blocker1!: () => void;
    let blocker2!: () => void;

    const p1 = mw(fakeCtx(`/api/projects/${id}`), () =>
      new Promise<void>((resolve) => {
        peak = Math.max(peak, _getProjectInflightSnapshot().get(id)?.count ?? 0);
        blocker1 = resolve;
      }),
    );
    const p2 = mw(fakeCtx(`/api/projects/${id}`), () =>
      new Promise<void>((resolve) => {
        peak = Math.max(peak, _getProjectInflightSnapshot().get(id)?.count ?? 0);
        blocker2 = resolve;
      }),
    );

    // Give the microtask queue a chance to enter both handlers.
    await Promise.resolve();
    await Promise.resolve();

    blocker1();
    blocker2();
    await Promise.all([p1, p2]);

    expect(peak).toBe(2);
    expect(_getProjectInflightSnapshot().get(id)?.count).toBe(0);
  });
});

describe("project_requests_inflight — tRPC middleware integration", () => {
  beforeEach(() => {
    _resetProjectInflight();
  });

  test("increments on input.projectId and decrements on exit", async () => {
    let seenCount: number | undefined;
    await projectAttributionTrpcMiddleware({
      rawInput: { projectId: "trpc-proj-1" },
      next: async () => {
        seenCount = _getProjectInflightSnapshot().get("trpc-proj-1")?.count;
        return { ok: true };
      },
    });
    expect(seenCount).toBe(1);
    expect(_getProjectInflightSnapshot().get("trpc-proj-1")?.count).toBe(0);
  });

  test("decrements even when the handler throws", async () => {
    await expect(
      projectAttributionTrpcMiddleware({
        rawInput: { projectId: "trpc-proj-err" },
        next: async () => {
          throw new Error("handler failed");
        },
      }),
    ).rejects.toThrow("handler failed");
    expect(
      _getProjectInflightSnapshot().get("trpc-proj-err")?.count,
    ).toBe(0);
  });

  test("input without a projectId does not touch the map", async () => {
    await projectAttributionTrpcMiddleware({
      rawInput: { somethingElse: true },
      next: async () => ({ ok: true }),
    });
    expect(_getProjectInflightSnapshot().size).toBe(0);
  });
});
