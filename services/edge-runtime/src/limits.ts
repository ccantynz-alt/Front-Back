// ── Crontech Edge Runtime — Per-invocation resource limits ──────────
// Time + memory ceilings enforced around a single bundle invocation.
//
// Time limits are wall-clock; we race the customer Promise against a
// timer and return a typed `timeout` outcome. Memory limits are sampled
// on `process.memoryUsage().heapUsed` deltas — every
// MEMORY_SAMPLE_INTERVAL_MS we check whether the *delta* from start
// exceeds the bundle's quota. This is best-effort on a shared heap; a
// strictly enforced per-isolate cap requires a separate process or a
// real V8 isolate harness, which is on the v2 roadmap.

export interface InvocationLimits {
  /** Wall-clock budget per request, in ms. */
  readonly timeoutMs: number;
  /** Memory budget per request, in MB (heap delta during invocation). */
  readonly memoryMb: number;
}

export const DEFAULT_LIMITS: InvocationLimits = Object.freeze({
  timeoutMs: 30_000,
  memoryMb: 128,
});

export type LimitOutcome =
  | { readonly kind: "ok" }
  | { readonly kind: "timeout"; readonly afterMs: number }
  | { readonly kind: "memory"; readonly usedMb: number };

const MEMORY_SAMPLE_INTERVAL_MS = 25;

export interface RunWithLimitsArgs<T> {
  readonly limits: InvocationLimits;
  /** The customer Promise we want to race against the limits. */
  readonly run: () => Promise<T>;
  /**
   * Returns the current heap-used in bytes. Injectable for tests so we
   * can simulate memory pressure deterministically.
   */
  readonly readMemory?: () => number;
  /** Injectable timer. Defaults to setTimeout. */
  readonly setTimer?: (fn: () => void, ms: number) => () => void;
}

export interface RunWithLimitsResult<T> {
  readonly outcome: LimitOutcome;
  /** Resolved value when `outcome.kind === "ok"` and no error. */
  readonly value?: T;
  /** Caught error when the customer Promise rejected before any limit. */
  readonly error?: Error;
  /** ms spent inside the customer Promise. */
  readonly durationMs: number;
  /** Peak heap delta in bytes observed during the run. */
  readonly peakBytes: number;
}

/**
 * Race the customer Promise against time + memory limits. Resolves once
 * any of: customer Promise settles, timeout fires, memory cap hits.
 *
 * The function never throws — every outcome is reported via the result
 * struct so the caller can build a typed Response. This matches the
 * "no surprises" contract the rest of the runtime uses.
 */
export async function runWithLimits<T>(args: RunWithLimitsArgs<T>): Promise<RunWithLimitsResult<T>> {
  const readMemory = args.readMemory ?? ((): number => process.memoryUsage().heapUsed);
  const setTimer = args.setTimer ?? defaultSetTimer;
  const start = performance.now();
  const baseline = readMemory();
  const memoryCapBytes = args.limits.memoryMb * 1024 * 1024;
  let peakBytes = 0;

  let resolveOuter!: (r: RunWithLimitsResult<T>) => void;
  const outer = new Promise<RunWithLimitsResult<T>>((r) => {
    resolveOuter = r;
  });

  let settled = false;
  let cancelTimeout: () => void = noop;
  let cancelPoll: () => void = noop;

  const finish = (r: RunWithLimitsResult<T>): void => {
    if (settled) return;
    settled = true;
    cancelTimeout();
    cancelPoll();
    resolveOuter(r);
  };

  cancelTimeout = setTimer(() => {
    finish({
      outcome: { kind: "timeout", afterMs: args.limits.timeoutMs },
      durationMs: args.limits.timeoutMs,
      peakBytes,
    });
  }, args.limits.timeoutMs);

  const poll = (): void => {
    if (settled) return;
    const used = Math.max(0, readMemory() - baseline);
    if (used > peakBytes) peakBytes = used;
    if (used >= memoryCapBytes) {
      finish({
        outcome: { kind: "memory", usedMb: used / (1024 * 1024) },
        durationMs: performance.now() - start,
        peakBytes,
      });
      return;
    }
    cancelPoll = setTimer(poll, MEMORY_SAMPLE_INTERVAL_MS);
  };
  cancelPoll = setTimer(poll, MEMORY_SAMPLE_INTERVAL_MS);

  args
    .run()
    .then((value) => {
      finish({
        outcome: { kind: "ok" },
        value,
        durationMs: performance.now() - start,
        peakBytes,
      });
    })
    .catch((err: unknown) => {
      finish({
        outcome: { kind: "ok" },
        error: err instanceof Error ? err : new Error(String(err)),
        durationMs: performance.now() - start,
        peakBytes,
      });
    });

  return outer;
}

function noop(): void {}

function defaultSetTimer(fn: () => void, ms: number): () => void {
  const t = setTimeout(fn, ms);
  return (): void => {
    clearTimeout(t);
  };
}
