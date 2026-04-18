// Smoke test: the SolidLogo module loads, exports the expected function,
// and the source contains the brand title so accessibility is preserved.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SolidLogo } from "./SolidLogo";

describe("SolidLogo", () => {
  test("exports a function component", () => {
    expect(typeof SolidLogo).toBe("function");
  });

  test("source contains a <title>SolidJS</title> for a11y", () => {
    const src = readFileSync(resolve(import.meta.dir, "SolidLogo.tsx"), "utf-8");
    expect(src).toContain("<title>SolidJS</title>");
  });

  test("source renders as an <svg> with viewBox 0 0 24 24", () => {
    const src = readFileSync(resolve(import.meta.dir, "SolidLogo.tsx"), "utf-8");
    expect(src).toContain('viewBox="0 0 24 24"');
  });
});
