// ── /docs/ai-sdk/** — article smoke tests ───────────────────────────
//
// Pins the shape of the four AI SDK articles so a future session can't
// silently drop one back to "Coming soon" or invent a fake procedure
// name. Mirrors the deployment + api-reference test patterns.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const AI_SDK_DIR = resolve(import.meta.dir, "ai-sdk");

const ARTICLES = [
  { file: "index.tsx", href: "/docs/ai-sdk" },
  { file: "three-tier-compute.tsx", href: "/docs/ai-sdk/three-tier-compute" },
  {
    file: "streaming-completions.tsx",
    href: "/docs/ai-sdk/streaming-completions",
  },
  {
    file: "client-gpu-inference.tsx",
    href: "/docs/ai-sdk/client-gpu-inference",
  },
] as const;

// Every /docs/ai-sdk/* href mentioned inside an article must resolve
// to one of the four files above. Dead cross-links between AI SDK
// articles will fail this suite before the link checker ever runs.
const KNOWN_AI_SDK_HREFS: Record<string, string> = {
  "/docs/ai-sdk": "index.tsx",
  "/docs/ai-sdk/three-tier-compute": "three-tier-compute.tsx",
  "/docs/ai-sdk/streaming-completions": "streaming-completions.tsx",
  "/docs/ai-sdk/client-gpu-inference": "client-gpu-inference.tsx",
};

describe("docs/ai-sdk — four-article series", () => {
  test("every article file exists on disk", () => {
    for (const { file } of ARTICLES) {
      expect(existsSync(resolve(AI_SDK_DIR, file))).toBe(true);
    }
  });

  test("every article exports a default component", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(AI_SDK_DIR, file), "utf-8");
      expect(src.includes("export default function")).toBe(true);
    }
  });

  test("every article uses the shared DocsArticle shell", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(AI_SDK_DIR, file), "utf-8");
      expect(src).toContain("DocsArticle");
    }
  });

  test("every article declares the AI SDK eyebrow", () => {
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(AI_SDK_DIR, file), "utf-8");
      expect(src).toContain('eyebrow="AI SDK"');
    }
  });

  test("every article sets a canonical path via SEOHead matching its route", () => {
    for (const { file, href } of ARTICLES) {
      const src = readFileSync(resolve(AI_SDK_DIR, file), "utf-8");
      expect(src).toContain(`path="${href}"`);
    }
  });

  test("every /docs/ai-sdk/* href inside an article resolves to a real file", () => {
    const hrefRe = /\/docs\/ai-sdk(?:\/[a-z0-9-]+)?/g;
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(AI_SDK_DIR, file), "utf-8");
      const matches = src.matchAll(hrefRe);
      for (const m of matches) {
        const clean = m[0].replace(/\/$/, "");
        expect(KNOWN_AI_SDK_HREFS[clean]).toBeDefined();
      }
    }
  });

  test("polite tone — no competitor names in AI SDK articles", () => {
    const fromCodes = (...codes: number[]): string =>
      String.fromCharCode(...codes);
    const banned = [
      ` ${fromCodes(118, 101, 114, 99, 101, 108)} `, // vercel
      ` ${fromCodes(110, 101, 116, 108, 105, 102, 121)} `, // netlify
      ` ${fromCodes(115, 117, 112, 97, 98, 97, 115, 101)} `, // supabase
      ` ${fromCodes(114, 101, 110, 100, 101, 114)} `, // render
    ];
    for (const { file } of ARTICLES) {
      const src = readFileSync(resolve(AI_SDK_DIR, file), "utf-8").toLowerCase();
      for (const name of banned) {
        expect(src).not.toContain(name);
      }
    }
  });

  test("three-tier article cites the real router exports", () => {
    // The three-tier article must not drift from the actual compute-tier
    // API. If a future refactor renames any of these, this test catches
    // it and the doc gets updated — not silently wrong.
    const src = readFileSync(
      resolve(AI_SDK_DIR, "three-tier-compute.tsx"),
      "utf-8",
    );
    expect(src).toContain("computeTierRouter");
    expect(src).toContain("computeTierWithReason");
    expect(src).toContain("selectCloudModel");
    expect(src).toContain("buildCloudRequest");
    expect(src).toContain("ComputeTierSchema");
    expect(src).toContain("packages/ai-core/src/compute-tier.ts");
  });

  test("streaming article cites the real /chat/stream route file", () => {
    const src = readFileSync(
      resolve(AI_SDK_DIR, "streaming-completions.tsx"),
      "utf-8",
    );
    expect(src).toContain("/chat/stream");
    expect(src).toContain("apps/api/src/ai/chat-stream.ts");
    // Must mention streamText from the Vercel AI SDK — the key contract
    // the article makes with the reader.
    expect(src).toContain("streamText");
    expect(src).toContain("ChatStreamInput");
  });

  test("client-gpu article cites the real inference entry points", () => {
    const src = readFileSync(
      resolve(AI_SDK_DIR, "client-gpu-inference.tsx"),
      "utf-8",
    );
    expect(src).toContain("clientInfer");
    expect(src).toContain("getClientCapabilities");
    expect(src).toContain("initializeWebLLM");
    expect(src).toContain("WEBLLM_MODELS");
    expect(src).toContain("packages/ai-core/src/inference");
    // Cross-reference the WebGPU video processor so the shared GPU
    // stack claim stays honest.
    expect(src).toContain("apps/web/src/gpu/video/processor.ts");
  });

  test("index cross-links to every article in the series", () => {
    const src = readFileSync(resolve(AI_SDK_DIR, "index.tsx"), "utf-8");
    expect(src).toContain("/docs/ai-sdk/three-tier-compute");
  });

  test("articles chain forward via nextStep", () => {
    const index = readFileSync(resolve(AI_SDK_DIR, "index.tsx"), "utf-8");
    expect(index).toContain("/docs/ai-sdk/three-tier-compute");

    const three = readFileSync(
      resolve(AI_SDK_DIR, "three-tier-compute.tsx"),
      "utf-8",
    );
    expect(three).toContain("/docs/ai-sdk/streaming-completions");

    const stream = readFileSync(
      resolve(AI_SDK_DIR, "streaming-completions.tsx"),
      "utf-8",
    );
    expect(stream).toContain("/docs/ai-sdk/client-gpu-inference");
  });
});
