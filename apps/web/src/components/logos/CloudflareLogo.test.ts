// Smoke test: CloudflareLogo module loads, exports a function, and the
// source contains the brand title so accessibility is preserved.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CloudflareLogo } from "./CloudflareLogo";

describe("CloudflareLogo", () => {
  test("exports a function component", () => {
    expect(typeof CloudflareLogo).toBe("function");
  });

  test("source contains a <title>Cloudflare Workers</title> for a11y", () => {
    const src = readFileSync(resolve(import.meta.dir, "CloudflareLogo.tsx"), "utf-8");
    expect(src).toContain("<title>Cloudflare Workers</title>");
  });

  test("source renders as an <svg> with viewBox 0 0 24 24", () => {
    const src = readFileSync(resolve(import.meta.dir, "CloudflareLogo.tsx"), "utf-8");
    expect(src).toContain('viewBox="0 0 24 24"');
  });
});
