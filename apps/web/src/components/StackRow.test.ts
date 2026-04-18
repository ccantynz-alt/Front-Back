// Smoke test for StackRow: verifies the stack manifest contains every
// required tech, each entry has a homepage URL and a logo function.

import { describe, expect, test } from "bun:test";
import { __STACK_ITEMS_FOR_TEST, StackRow } from "./StackRow";

describe("StackRow", () => {
  test("exports a function component", () => {
    expect(typeof StackRow).toBe("function");
  });

  test("manifest covers all seven required technologies in order", () => {
    const names = __STACK_ITEMS_FOR_TEST.map((x) => x.name);
    expect(names).toEqual([
      "SolidJS",
      "Bun",
      "Hono",
      "tRPC",
      "Cloudflare Workers",
      "Turso",
      "WebGPU",
    ]);
  });

  test("every entry has an https:// href and a Logo function", () => {
    for (const item of __STACK_ITEMS_FOR_TEST) {
      expect(item.href.startsWith("https://")).toBe(true);
      expect(typeof item.Logo).toBe("function");
    }
  });
});
