// Smoke test: HonoLogo module loads, exports a function, and the source
// contains the brand title so accessibility is preserved.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HonoLogo } from "./HonoLogo";

describe("HonoLogo", () => {
  test("exports a function component", () => {
    expect(typeof HonoLogo).toBe("function");
  });

  test("source contains a <title>Hono</title> for a11y", () => {
    const src = readFileSync(resolve(import.meta.dir, "HonoLogo.tsx"), "utf-8");
    expect(src).toContain("<title>Hono</title>");
  });

  test("source renders as an <svg> with viewBox 0 0 24 24", () => {
    const src = readFileSync(resolve(import.meta.dir, "HonoLogo.tsx"), "utf-8");
    expect(src).toContain('viewBox="0 0 24 24"');
  });
});
