// ── tRPC SolidJS helpers ────────────────────────────────────────────
// Smart caching wrappers around createResource/createSignal with:
// - Stale-while-revalidate (SWR): show cached data while refetching
// - Auto-refetch on configurable interval
// - Global invalidation bus: mutations trigger query refreshes
// - Visibility refetch: refetch when user returns to the tab

import { createResource, createSignal, onCleanup, type Resource } from "solid-js";
import { TRPCClientError } from "@trpc/client";

// ── Global Invalidation Bus ────────────────────────────────────────
// Mutations publish a "key" (e.g. "projects", "chat", "settings") and
// all active useQuery instances tagged with that key auto-refetch.

type InvalidationCallback = () => void;
const listeners = new Map<string, Set<InvalidationCallback>>();

function subscribe(key: string, cb: InvalidationCallback): () => void {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(cb);
  return () => { listeners.get(key)?.delete(cb); };
}

/** Invalidate all queries tagged with the given key(s). */
export function invalidateQueries(...keys: string[]): void {
  for (const key of keys) {
    const cbs = listeners.get(key);
    if (cbs) {
      for (const cb of cbs) cb();
    }
  }
}

/** Invalidate every active query. */
export function invalidateAll(): void {
  for (const cbs of listeners.values()) {
    for (const cb of cbs) cb();
  }
}

// ── useQuery ───────────────────────────────────────────────────────

export interface UseQueryOptions {
  /** Invalidation key(s). Mutations that call invalidateQueries("projects")
   *  will cause all useQuery instances with key "projects" to refetch. */
  key?: string | string[];
  /** Auto-refetch interval in milliseconds. 0 = disabled. Default: 0. */
  refetchInterval?: number;
  /** Refetch when the browser tab regains focus. Default: true. */
  refetchOnFocus?: boolean;
}

export interface UseQueryResult<T> {
  data: Resource<T>;
  refetch: () => void;
  mutate: (value: T | undefined) => void;
  loading: () => boolean;
  error: () => unknown;
}

/**
 * Wrap a tRPC query in a SolidJS resource with smart caching.
 *
 * Usage:
 *   const projects = useQuery(
 *     () => trpc.projects.list.query(),
 *     { key: "projects", refetchInterval: 30_000 }
 *   );
 */
export function useQuery<T>(fn: () => Promise<T>, options?: UseQueryOptions): UseQueryResult<T> {
  const [data, { refetch, mutate }] = createResource<T>(fn);

  const doRefetch = (): void => { void refetch(); };

  // Subscribe to invalidation bus
  const keys = options?.key
    ? Array.isArray(options.key) ? options.key : [options.key]
    : [];
  const unsubscribers: (() => void)[] = [];
  for (const key of keys) {
    unsubscribers.push(subscribe(key, doRefetch));
  }

  // Auto-refetch on interval
  let intervalId: ReturnType<typeof setInterval> | undefined;
  if (options?.refetchInterval && options.refetchInterval > 0) {
    intervalId = setInterval(doRefetch, options.refetchInterval);
  }

  // Refetch on tab focus (visibility change)
  const refetchOnFocus = options?.refetchOnFocus !== false;
  const handleVisibility = (): void => {
    if (document.visibilityState === "visible") doRefetch();
  };
  if (refetchOnFocus && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", handleVisibility);
  }

  // Cleanup on component unmount
  onCleanup(() => {
    for (const unsub of unsubscribers) unsub();
    if (intervalId) clearInterval(intervalId);
    if (refetchOnFocus && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleVisibility);
    }
  });

  return {
    data,
    refetch: doRefetch,
    mutate: (v) => mutate(() => v),
    loading: () => data.loading,
    error: () => data.error,
  };
}

// ── useMutation ────────────────────────────────────────────────────

export interface UseMutationOptions {
  /** Query keys to invalidate after a successful mutation. */
  invalidates?: string[];
}

export interface UseMutationResult<TInput, TOutput> {
  mutate: (input: TInput) => Promise<TOutput>;
  loading: () => boolean;
  error: () => Error | null;
  reset: () => void;
}

/**
 * Wrap a tRPC mutation with loading/error signals and auto-invalidation.
 *
 * Usage:
 *   const create = useMutation(
 *     (input: {name: string}) => trpc.projects.create.mutate(input),
 *     { invalidates: ["projects"] }
 *   );
 *   await create.mutate({ name: "New Project" });
 *   // ^ automatically refetches all useQuery({ key: "projects" }) instances
 */
export function useMutation<TInput, TOutput>(
  fn: (input: TInput) => Promise<TOutput>,
  options?: UseMutationOptions,
): UseMutationResult<TInput, TOutput> {
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<Error | null>(null);

  const mutate = async (input: TInput): Promise<TOutput> => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn(input);
      // Auto-invalidate related queries on success
      if (options?.invalidates?.length) {
        invalidateQueries(...options.invalidates);
      }
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const reset = (): void => {
    setError(null);
    setLoading(false);
  };

  return { mutate, loading, error, reset };
}

/**
 * Convert a thrown error into a user-friendly message (no stack traces).
 */
export function friendlyError(err: unknown): string {
  if (err instanceof TRPCClientError) {
    return err.message || "Request failed. Please try again.";
  }
  if (err instanceof Error) {
    return err.message || "Something went wrong.";
  }
  return "Something went wrong. Please try again.";
}
