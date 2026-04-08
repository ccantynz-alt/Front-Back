import { describe, test, expect } from "bun:test";
import {
  WebLLMConfigSchema,
  validateConfig,
  detectWebGPU,
  isSupportedModel,
  SUPPORTED_MODELS,
  type WebLLMConfig,
  type WebGPUStatus,
} from "./webllm";

// ── WebLLMConfigSchema validation ─────────────────────────────────────

describe("WebLLMConfigSchema", () => {
  test("accepts valid config with all fields", () => {
    const result = WebLLMConfigSchema.safeParse({
      modelId: "Llama-3.1-8B-Instruct-q4f16_1-MLC",
      maxTokens: 512,
      temperature: 0.5,
      topP: 0.95,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.modelId).toBe("Llama-3.1-8B-Instruct-q4f16_1-MLC");
      expect(result.data.maxTokens).toBe(512);
      expect(result.data.temperature).toBe(0.5);
      expect(result.data.topP).toBe(0.95);
    }
  });

  test("applies defaults for maxTokens, temperature, topP", () => {
    const result = WebLLMConfigSchema.safeParse({
      modelId: "gemma-2b-it-q4f16_1-MLC",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxTokens).toBe(256);
      expect(result.data.temperature).toBe(0.7);
      expect(result.data.topP).toBe(0.9);
    }
  });

  test("rejects empty modelId", () => {
    const result = WebLLMConfigSchema.safeParse({
      modelId: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing modelId", () => {
    const result = WebLLMConfigSchema.safeParse({
      maxTokens: 100,
    });
    expect(result.success).toBe(false);
  });

  test("rejects negative maxTokens", () => {
    const result = WebLLMConfigSchema.safeParse({
      modelId: "test-model",
      maxTokens: -1,
    });
    expect(result.success).toBe(false);
  });

  test("rejects zero maxTokens", () => {
    const result = WebLLMConfigSchema.safeParse({
      modelId: "test-model",
      maxTokens: 0,
    });
    expect(result.success).toBe(false);
  });

  test("rejects temperature above 2", () => {
    const result = WebLLMConfigSchema.safeParse({
      modelId: "test-model",
      temperature: 2.5,
    });
    expect(result.success).toBe(false);
  });

  test("rejects negative temperature", () => {
    const result = WebLLMConfigSchema.safeParse({
      modelId: "test-model",
      temperature: -0.1,
    });
    expect(result.success).toBe(false);
  });

  test("accepts temperature at boundary 0", () => {
    const result = WebLLMConfigSchema.safeParse({
      modelId: "test-model",
      temperature: 0,
    });
    expect(result.success).toBe(true);
  });

  test("accepts temperature at boundary 2", () => {
    const result = WebLLMConfigSchema.safeParse({
      modelId: "test-model",
      temperature: 2,
    });
    expect(result.success).toBe(true);
  });

  test("rejects topP above 1", () => {
    const result = WebLLMConfigSchema.safeParse({
      modelId: "test-model",
      topP: 1.1,
    });
    expect(result.success).toBe(false);
  });

  test("rejects negative topP", () => {
    const result = WebLLMConfigSchema.safeParse({
      modelId: "test-model",
      topP: -0.5,
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-integer maxTokens", () => {
    const result = WebLLMConfigSchema.safeParse({
      modelId: "test-model",
      maxTokens: 10.5,
    });
    expect(result.success).toBe(false);
  });
});

// ── validateConfig ──────────────────────────────────────────────────

describe("validateConfig", () => {
  test("returns parsed config for valid input", () => {
    const config = validateConfig({
      modelId: "gemma-2b-it-q4f16_1-MLC",
      maxTokens: 128,
    });
    expect(config.modelId).toBe("gemma-2b-it-q4f16_1-MLC");
    expect(config.maxTokens).toBe(128);
    expect(config.temperature).toBe(0.7); // default
  });

  test("throws for invalid input", () => {
    expect(() => validateConfig({ modelId: "" })).toThrow();
  });

  test("throws for completely wrong type", () => {
    expect(() => validateConfig("not an object")).toThrow();
  });

  test("throws for null", () => {
    expect(() => validateConfig(null)).toThrow();
  });
});

// ── detectWebGPU ────────────────────────────────────────────────────

describe("detectWebGPU", () => {
  test("returns unavailable in Node/Bun environment (no navigator)", async () => {
    const status = await detectWebGPU();
    expect(status.available).toBe(false);
    expect(status.adapterName).toBeNull();
    expect(status.reason).toBeString();
    expect(status.reason).toContain("not available");
  });

  test("returns a WebGPUStatus object with correct shape", async () => {
    const status = await detectWebGPU();
    expect(status).toHaveProperty("available");
    expect(status).toHaveProperty("adapterName");
    expect(status).toHaveProperty("reason");
    expect(typeof status.available).toBe("boolean");
  });
});

// ── SUPPORTED_MODELS ────────────────────────────────────────────────

describe("SUPPORTED_MODELS", () => {
  test("contains at least 3 models", () => {
    expect(SUPPORTED_MODELS.length).toBeGreaterThanOrEqual(3);
  });

  test("all model IDs are non-empty strings", () => {
    for (const model of SUPPORTED_MODELS) {
      expect(typeof model).toBe("string");
      expect(model.length).toBeGreaterThan(0);
    }
  });

  test("contains Llama model", () => {
    const hasLlama = SUPPORTED_MODELS.some((m) => m.includes("Llama"));
    expect(hasLlama).toBe(true);
  });
});

// ── isSupportedModel ────────────────────────────────────────────────

describe("isSupportedModel", () => {
  test("returns true for supported model", () => {
    expect(isSupportedModel("Llama-3.1-8B-Instruct-q4f16_1-MLC")).toBe(true);
  });

  test("returns true for all listed models", () => {
    for (const model of SUPPORTED_MODELS) {
      expect(isSupportedModel(model)).toBe(true);
    }
  });

  test("returns false for unsupported model", () => {
    expect(isSupportedModel("gpt-4o")).toBe(false);
  });

  test("returns false for empty string", () => {
    expect(isSupportedModel("")).toBe(false);
  });

  test("returns false for close but wrong model name", () => {
    expect(isSupportedModel("Llama-3.1-8B-Instruct")).toBe(false);
  });
});
