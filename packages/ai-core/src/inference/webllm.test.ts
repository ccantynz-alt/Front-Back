import { describe, test, expect } from "bun:test";
import {
  WebLLMConfigSchema,
  isWebGPUAvailable,
  WEBLLM_MODELS,
  getModelInfo,
  selectModelForVRAM,
  WebLLMModelId,
} from "./webllm";

describe("WebLLM Module", () => {
  describe("WebLLMConfigSchema", () => {
    test("accepts valid config", () => {
      const config = { modelId: "Llama-3.1-8B-Instruct-q4f32_1-MLC", temperature: 0.7, maxTokens: 512 };
      const result = WebLLMConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    test("rejects invalid temperature (> 2)", () => {
      const config = { modelId: "Llama-3.1-8B-Instruct-q4f32_1-MLC", temperature: 3.0 };
      const result = WebLLMConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    test("rejects negative temperature", () => {
      const config = { modelId: "Llama-3.1-8B-Instruct-q4f32_1-MLC", temperature: -1 };
      const result = WebLLMConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    test("uses defaults when optional fields omitted", () => {
      const config = { modelId: "Llama-3.1-8B-Instruct-q4f32_1-MLC" };
      const result = WebLLMConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });
  });

  describe("isWebGPUAvailable", () => {
    test("returns boolean", () => {
      expect(typeof isWebGPUAvailable()).toBe("boolean");
    });

    test("returns false in server environment", () => {
      expect(isWebGPUAvailable()).toBe(false);
    });
  });

  describe("WEBLLM_MODELS", () => {
    test("is non-empty", () => {
      expect(WEBLLM_MODELS.length).toBeGreaterThan(0);
    });

    test("every model has required fields", () => {
      for (const model of WEBLLM_MODELS) {
        expect(model.id).toBeDefined();
        expect(model.name).toBeDefined();
        expect(typeof model.minVRAMMB).toBe("number");
      }
    });

    test("includes Llama model", () => {
      expect(WEBLLM_MODELS.some((m) => m.name.includes("Llama"))).toBe(true);
    });
  });

  describe("getModelInfo", () => {
    test("returns info for valid model", () => {
      const info = getModelInfo("Llama-3.1-8B-Instruct-q4f32_1-MLC");
      expect(info.id).toBe("Llama-3.1-8B-Instruct-q4f32_1-MLC");
    });
  });

  describe("selectModelForVRAM", () => {
    test("returns model for sufficient VRAM", () => {
      expect(selectModelForVRAM(8000)).toBeDefined();
    });

    test("returns undefined for insufficient VRAM", () => {
      expect(selectModelForVRAM(100)).toBeUndefined();
    });
  });

  describe("WebLLMModelId", () => {
    test("validates known IDs", () => {
      expect(WebLLMModelId.safeParse("Llama-3.1-8B-Instruct-q4f32_1-MLC").success).toBe(true);
    });

    test("rejects unknown IDs", () => {
      expect(WebLLMModelId.safeParse("fake-model").success).toBe(false);
    });
  });
});
