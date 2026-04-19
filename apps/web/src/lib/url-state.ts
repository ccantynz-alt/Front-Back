// ── URL State Hook ──────────────────────────────────────────────────
//
// `useUrlState(key, defaultValue)` mirrors a piece of state into the
// query string so any list filter, tab selection, or sort order becomes
// a deep-linkable, share-friendly URL. Browser back/forward Just Works
// because we listen for `popstate` and re-read the URL into the signal.
//
// The signature mimics SolidJS's `createSignal`:
//
//   const [tab, setTab] = useUrlState("tab", "overview");
//   tab();              // reads the current value
//   setTab("billing");  // writes back to the URL
//
// Strings, numbers, and booleans serialise transparently. The default
// value is NOT written to the URL — we only push the param when it
// differs from the default, which keeps URLs short and shareable.
//
// Implementation note: every helper takes `Primitive` (the union of
// string | number | boolean) as the parameter type rather than a
// constrained generic. That choice means a literal default like `""`
// widens to `string` automatically, so callers don't need to write
// `useUrlState<string>("filter", "")` everywhere — the natural
// `useUrlState("filter", "")` form just works.

import { createSignal, onCleanup, type Accessor } from "solid-js";

// ── Types ───────────────────────────────────────────────────────────

/** Every value type the URL hook accepts. */
export type Primitive = string | number | boolean;

export type UrlStateSetter<T extends Primitive> = (
  value: T | ((prev: T) => T),
) => void;

export type UrlStateReturn<T extends Primitive> = [
  Accessor<T>,
  UrlStateSetter<T>,
];

/**
 * Widen a literal default to its base primitive so callers don't need
 * `useUrlState<string>("filter", "")` boilerplate. A default of `""`
 * gives a `string` setter; a default of `0` gives a `number` setter; a
 * default of `true` gives a `boolean` setter.
 */
export type WidenLiteral<T extends Primitive> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T;

// ── Public API ──────────────────────────────────────────────────────

/**
 * Reactive query-string-backed state.
 *
 * @param key The query-string key (e.g. "tab", "filter", "sort").
 * @param defaultValue The fallback value when the key is absent. The
 *                     default is never written to the URL — it's the
 *                     "clean" state.
 */
export function useUrlState<T extends Primitive>(
  key: string,
  defaultValue: T,
): UrlStateReturn<WidenLiteral<T>> {
  type W = WidenLiteral<T>;
  const initial = readFromLocation(key, defaultValue) as W;
  const [value, setValue] = createSignal<W>(initial);

  // Keep the signal in sync with browser navigation (back/forward).
  if (typeof window !== "undefined") {
    const onPop = (): void => {
      setValue(() => readFromLocation(key, defaultValue) as W);
    };
    window.addEventListener("popstate", onPop);
    onCleanup(() => {
      window.removeEventListener("popstate", onPop);
    });
  }

  const set: UrlStateSetter<W> = (next) => {
    const resolved =
      typeof next === "function" ? (next as (p: W) => W)(value()) : next;
    setValue(() => resolved);
    writeToLocation(key, resolved, defaultValue);
  };

  return [value, set];
}

// ── Internal: Serialisation ─────────────────────────────────────────

/**
 * Decode a query-string value back to the same shape as `defaultValue`.
 * We coerce numbers/booleans because URL params are always strings and
 * a naive `searchParams.get("page")` would yield `"3"` instead of `3`.
 *
 * The signature deliberately uses the wide `Primitive` union (rather
 * than a narrow generic) so that test call sites like
 *   `decode("hello", "default")`
 * don't get rejected because TypeScript inferred `T = "default"`.
 */
function decode(raw: string, defaultValue: Primitive): Primitive {
  if (typeof defaultValue === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : defaultValue;
  }
  if (typeof defaultValue === "boolean") {
    return raw === "true" || raw === "1";
  }
  return raw;
}

function encode(value: Primitive): string {
  return String(value);
}

// ── Internal: Location I/O ──────────────────────────────────────────

function readFromLocation(key: string, defaultValue: Primitive): Primitive {
  if (typeof window === "undefined") return defaultValue;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(key);
  if (raw === null) return defaultValue;
  return decode(raw, defaultValue);
}

function writeToLocation(
  key: string,
  value: Primitive,
  defaultValue: Primitive,
): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (value === defaultValue) {
    url.searchParams.delete(key);
  } else {
    url.searchParams.set(key, encode(value));
  }
  // pushState (not replaceState) so back/forward navigates between
  // filter states — which is the whole point of having shareable URLs.
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.pushState({}, "", next);
}

// ── Test-only Helpers ───────────────────────────────────────────────

/** Exported for tests; not part of the public surface. */
export const __internal = {
  readFromLocation,
  writeToLocation,
  decode,
  encode,
};
