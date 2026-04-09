import { describe, test, expect } from "bun:test";
import {
  TransformersTask,
  TransformersModelId,
  TransformersConfigSchema,
  TRANSFORMERS_MODELS,
  isTransformersAvailable,
  isTransformersGPUAvailable,
} from "./transformers";

describe("Transformers.js Module", () => {
  describe("TransformersTask", () => {
    test("validates known tasks", () => {
      expect(TransformersTask.safeParse("embeddings").success).toBe(true);
      expect(TransformersTask.safeParse("text-classification").success).toBe(true);
      expect(TransformersTask.safeParse("summarization").success).toBe(true);
    });

    test("rejects unknown tasks", () => {
      expect(TransformersTask.safeParse("flying").success).toBe(false);
      expect(TransformersTask.safeParse("").success).toBe(false);
    });
  });

  describe("TransformersModelId", () => {
    test("validates known model IDs", () => {
      const firstModel = TRANSFORMERS_MODELS[0];
      if (firstModel) {
        expect(TransformersModelId.safeParse(firstModel.id).success).toBe(true);
      }
    });

    test("rejects unknown model IDs", () => {
      expect(TransformersModelId.safeParse("fake/model").success).toBe(false);
    });
  });

  describe("TransformersConfigSchema", () => {
    test("accepts valid config", () => {
      const config = {
        task: "embeddings",
        modelId: TRANSFORMERS_MODELS[0]?.id,
      };
      const result = TransformersConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    test("rejects invalid task", () => {
      const config = { task: "nonexistent", modelId: TRANSFORMERS_MODELS[0]?.id };
      const result = TransformersConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    test("requires task field", () => {
      const config = { modelId: TRANSFORMERS_MODELS[0]?.id };
      const result = TransformersConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe("TRANSFORMERS_MODELS", () => {
    test("is non-empty", () => {
      expect(TRANSFORMERS_MODELS.length).toBeGreaterThan(0);
    });

    test("every model has required fields", () => {
      for (const model of TRANSFORMERS_MODELS) {
        expect(model.id).toBeDefined();
        expect(model.name).toBeDefined();
        expect(model.task).toBeDefined();
      }
    });

    test("has embeddings model", () => {
      expect(TRANSFORMERS_MODELS.some((m) => m.task === "embeddings")).toBe(true);
    });
  });

  describe("availability checks", () => {
    test("isTransformersAvailable returns boolean", () => {
      expect(typeof isTransformersAvailable()).toBe("boolean");
    });

    test("isTransformersGPUAvailable returns boolean", () => {
      expect(typeof isTransformersGPUAvailable()).toBe("boolean");
    });

    test("GPU not available in server environment", () => {
      expect(isTransformersGPUAvailable()).toBe(false);
    });
  });
});
