// ── Provider Routing Tests ────────────────────────────────────────────

import { describe, expect, test } from "bun:test";
import { resolveProvider } from "../src/router";

describe("resolveProvider — v1 expansion", () => {
  test("anthropic prefixes", () => {
    expect(resolveProvider("claude-3-5-sonnet-latest")).toBe("anthropic");
    expect(resolveProvider("anthropic/claude-3-haiku")).toBe("anthropic");
  });

  test("openai prefixes", () => {
    expect(resolveProvider("gpt-4o-mini")).toBe("openai");
    expect(resolveProvider("o1-preview")).toBe("openai");
    expect(resolveProvider("o4-mini")).toBe("openai");
    expect(resolveProvider("openai/gpt-4o")).toBe("openai");
  });

  test("google prefixes", () => {
    expect(resolveProvider("gemini-1.5-pro")).toBe("google");
    expect(resolveProvider("google/gemini-2.0-flash")).toBe("google");
    expect(resolveProvider("gemini/text-bison")).toBe("google");
  });

  test("groq prefixes", () => {
    expect(resolveProvider("groq/llama-3.1-70b")).toBe("groq");
    expect(resolveProvider("llama3-groq-70b")).toBe("groq");
    expect(resolveProvider("mixtral-8x7b-32768")).toBe("groq");
  });

  test("mistral prefixes", () => {
    expect(resolveProvider("mistral/large-latest")).toBe("mistral");
    expect(resolveProvider("mistral-small-latest")).toBe("mistral");
    expect(resolveProvider("open-mistral-7b")).toBe("mistral");
    expect(resolveProvider("codestral-latest")).toBe("mistral");
  });

  test("webgpu prefixes", () => {
    expect(resolveProvider("webgpu/llama-3.2-1b")).toBe("webgpu");
    expect(resolveProvider("local/phi-3-mini")).toBe("webgpu");
  });

  test("unknown defaults to anthropic", () => {
    expect(resolveProvider("totally-unknown-model")).toBe("anthropic");
  });
});
