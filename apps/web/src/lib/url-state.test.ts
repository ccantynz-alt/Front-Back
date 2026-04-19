// ── useUrlState: Smoke + Unit Tests ─────────────────────────────────
//
// Tests the pure encode/decode helpers (which run anywhere) and the
// readFromLocation / writeToLocation pair (which need a `window`-shaped
// global). We don't boot the SolidJS runtime — same pattern as the
// rest of the web package's bun-test suites — but we DO mount a tiny
// fake `window` so the location-IO functions can exercise their real
// path instead of bailing out on the SSR guard.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { __internal } from "./url-state";

const URL_STATE_PATH = resolve(import.meta.dir, "url-state.ts");

// ── Source-Level Smoke Tests ────────────────────────────────────────

describe("url-state.ts — source smoke", () => {
  test("file exists", () => {
    expect(existsSync(URL_STATE_PATH)).toBe(true);
  });

  test("exports useUrlState as the public hook", () => {
    const src = readFileSync(URL_STATE_PATH, "utf-8");
    expect(src).toContain("export function useUrlState");
  });

  test("uses pushState (not replaceState) so back/forward works", () => {
    const src = readFileSync(URL_STATE_PATH, "utf-8");
    expect(src).toContain("history.pushState");
    expect(src).toContain("popstate");
  });

  test("imports SolidJS reactivity primitives", () => {
    const src = readFileSync(URL_STATE_PATH, "utf-8");
    expect(src).toContain("createSignal");
    expect(src).toContain("onCleanup");
  });
});

// ── decode() ────────────────────────────────────────────────────────

describe("decode", () => {
  const { decode } = __internal;

  test("strings round-trip", () => {
    expect(decode("hello", "default")).toBe("hello");
    expect(decode("", "default")).toBe("");
  });

  test("numbers coerce from string", () => {
    expect(decode("42", 0)).toBe(42);
    expect(decode("3.14", 0)).toBe(3.14);
  });

  test("invalid number falls back to default", () => {
    expect(decode("not-a-number", 7)).toBe(7);
  });

  test("booleans accept `true` / `1` as truthy", () => {
    expect(decode("true", false)).toBe(true);
    expect(decode("1", false)).toBe(true);
    expect(decode("false", true)).toBe(false);
    expect(decode("0", true)).toBe(false);
    expect(decode("anything-else", true)).toBe(false);
  });
});

// ── encode() ────────────────────────────────────────────────────────

describe("encode", () => {
  const { encode } = __internal;

  test("converts every primitive to its string form", () => {
    expect(encode("foo")).toBe("foo");
    expect(encode(42)).toBe("42");
    expect(encode(true)).toBe("true");
    expect(encode(false)).toBe("false");
  });
});

// ── readFromLocation / writeToLocation ──────────────────────────────
//
// Bun's test runner has no `window` by default, so we mount a tiny fake
// (just enough for the URL/history calls our hook makes) for the
// duration of these tests and tear it down afterwards.

interface FakeWindow {
  location: { href: string; search: string; pathname: string; hash: string };
  history: { pushState(state: unknown, title: string, url: string): void };
}

function makeFakeWindow(initialPath = "/projects"): FakeWindow {
  const url = new URL(`http://localhost${initialPath}`);
  const w: FakeWindow = {
    location: {
      get href() {
        return url.toString();
      },
      get search() {
        return url.search;
      },
      get pathname() {
        return url.pathname;
      },
      get hash() {
        return url.hash;
      },
    },
    history: {
      pushState(_state: unknown, _title: string, next: string): void {
        const u = new URL(next, url.origin);
        url.pathname = u.pathname;
        url.search = u.search;
        url.hash = u.hash;
      },
    },
  };
  return w;
}

describe("readFromLocation / writeToLocation", () => {
  const { readFromLocation, writeToLocation } = __internal;
  // biome-ignore lint/suspicious/noExplicitAny: test-only global swap
  const g = globalThis as any;
  let originalWindow: unknown;

  beforeEach(() => {
    originalWindow = g.window;
    g.window = makeFakeWindow();
  });
  afterEach(() => {
    g.window = originalWindow;
  });

  test("returns the default when the key is absent", () => {
    expect(readFromLocation("filter", "")).toBe("");
    expect(readFromLocation("page", 1)).toBe(1);
    expect(readFromLocation("dark", false)).toBe(false);
  });

  test("writes a value and reads it back", () => {
    writeToLocation("filter", "api", "");
    expect(readFromLocation("filter", "")).toBe("api");
  });

  test("omits the param when the value equals the default (clean URL)", () => {
    writeToLocation("filter", "api", "");
    expect(g.window.location.search).toContain("filter=api");
    writeToLocation("filter", "", "");
    expect(g.window.location.search.includes("filter=")).toBe(false);
  });

  test("multiple keys coexist on the same URL", () => {
    writeToLocation("filter", "api", "");
    writeToLocation("status", "active", "all");
    expect(readFromLocation("filter", "")).toBe("api");
    expect(readFromLocation("status", "all")).toBe("active");
  });

  test("number values round-trip through the URL", () => {
    writeToLocation("page", 3, 1);
    expect(readFromLocation("page", 1)).toBe(3);
  });

  test("boolean values round-trip through the URL", () => {
    writeToLocation("expanded", true, false);
    expect(readFromLocation("expanded", false)).toBe(true);
  });
});
