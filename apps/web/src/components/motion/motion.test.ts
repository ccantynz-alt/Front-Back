// ── motion.test.ts ───────────────────────────────────────────────────
// Smoke tests for the motion primitives.
//
// Design note on scope: bun's test runner does not apply the SolidJS
// JSX compile transform that vinxi uses at build time, and the web app
// has no DOM test harness (no jsdom / happy-dom). That means we cannot
// actually render these components here — invoking one would try to
// execute untransformed JSX through the React runtime and blow up.
//
// So the smoke net here pins what we CAN test without a render harness:
//   1. Every primitive module imports cleanly (the import statements
//      themselves are the assertion — a syntax/type/export break will
//      fail the test file at load time).
//   2. Every primitive is exported as a function with the expected
//      arity (SolidJS components are plain functions of props).
//   3. The `usePrefersReducedMotion` hook is a callable accessor factory.
//
// Render-time behaviour is covered by Playwright/visual tests elsewhere.
// The goal of this file is a regression tripwire on the public shape —
// if a component is renamed, deleted, or its export signature changes,
// this file fails.

import { describe, expect, test } from "bun:test";

import { AnimatedCounter } from "./AnimatedCounter";
import { FadeIn } from "./FadeIn";
import { GradientBorder } from "./GradientBorder";
import { Magnetic } from "./Magnetic";
import { ParallaxSection } from "./ParallaxSection";
import { ScrollReveal } from "./ScrollReveal";
import { usePrefersReducedMotion } from "./reduced-motion";

describe("motion primitives — module imports load without throwing", () => {
  test("all six primitive modules resolve", () => {
    expect(ScrollReveal).toBeDefined();
    expect(FadeIn).toBeDefined();
    expect(AnimatedCounter).toBeDefined();
    expect(GradientBorder).toBeDefined();
    expect(ParallaxSection).toBeDefined();
    expect(Magnetic).toBeDefined();
  });

  test("reduced-motion helper module resolves", () => {
    expect(usePrefersReducedMotion).toBeDefined();
  });
});

describe("motion primitives — export signatures", () => {
  test("ScrollReveal is a function of one argument (props)", () => {
    expect(typeof ScrollReveal).toBe("function");
    expect(ScrollReveal.length).toBe(1);
  });

  test("FadeIn is a function of one argument (props)", () => {
    expect(typeof FadeIn).toBe("function");
    expect(FadeIn.length).toBe(1);
  });

  test("AnimatedCounter is a function of one argument (props)", () => {
    expect(typeof AnimatedCounter).toBe("function");
    expect(AnimatedCounter.length).toBe(1);
  });

  test("GradientBorder is a function of one argument (props)", () => {
    expect(typeof GradientBorder).toBe("function");
    expect(GradientBorder.length).toBe(1);
  });

  test("ParallaxSection is a function of one argument (props)", () => {
    expect(typeof ParallaxSection).toBe("function");
    expect(ParallaxSection.length).toBe(1);
  });

  test("Magnetic is a function of one argument (props)", () => {
    expect(typeof Magnetic).toBe("function");
    expect(Magnetic.length).toBe(1);
  });
});

describe("usePrefersReducedMotion", () => {
  test("is a function (hook/accessor factory)", () => {
    expect(typeof usePrefersReducedMotion).toBe("function");
  });
});
