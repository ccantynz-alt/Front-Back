import { describe, test, expect } from "bun:test";
import {
  PipelineTask,
  PipelineConfigSchema,
  validatePipelineConfig,
  isValidTask,
  getDefaultModel,
  DEFAULT_MODELS,
  type PipelineTaskType,
  type PipelineConfig,
} from "./transformers";

// ── PipelineTask enum validation ────────────────────────────────────

describe("PipelineTask", () => {
  const validTasks = [
    "text-classification",
    "token-classification",
    "question-answering",
    "fill-mask",
    "summarization",
    "translation",
    "text-generation",
    "feature-extraction",
    "zero-shot-classification",
    "sentiment-analysis",
  ];

  test("accepts all valid pipeline tasks", () => {
    for (const task of validTasks) {
      const result = PipelineTask.safeParse(task);
      expect(result.success).toBe(true);
    }
  });

  test("rejects invalid task", () => {
    expect(PipelineTask.safeParse("image-generation").success).toBe(false);
  });

  test("rejects empty string", () => {
    expect(PipelineTask.safeParse("").success).toBe(false);
  });

  test("rejects number", () => {
    expect(PipelineTask.safeParse(42).success).toBe(false);
  });

  test("is case-sensitive", () => {
    expect(PipelineTask.safeParse("Text-Classification").success).toBe(false);
  });

  test("has exactly 10 valid values", () => {
    expect(validTasks.length).toBe(10);
  });
});

// ── PipelineConfigSchema validation ──────────────────────────────────

describe("PipelineConfigSchema", () => {
  test("accepts valid config with all fields", () => {
    const result = PipelineConfigSchema.safeParse({
      task: "text-classification",
      model: "Xenova/distilbert-base-uncased-finetuned-sst-2-english",
      quantized: false,
      revision: "main",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.task).toBe("text-classification");
      expect(result.data.quantized).toBe(false);
      expect(result.data.revision).toBe("main");
    }
  });

  test("applies default for quantized (true)", () => {
    const result = PipelineConfigSchema.safeParse({
      task: "feature-extraction",
      model: "Xenova/all-MiniLM-L6-v2",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.quantized).toBe(true);
    }
  });

  test("revision is optional", () => {
    const result = PipelineConfigSchema.safeParse({
      task: "summarization",
      model: "Xenova/distilbart-cnn-6-6",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.revision).toBeUndefined();
    }
  });

  test("rejects missing task", () => {
    const result = PipelineConfigSchema.safeParse({
      model: "some-model",
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing model", () => {
    const result = PipelineConfigSchema.safeParse({
      task: "text-classification",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty model string", () => {
    const result = PipelineConfigSchema.safeParse({
      task: "text-classification",
      model: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid task in config", () => {
    const result = PipelineConfigSchema.safeParse({
      task: "invalid-task",
      model: "some-model",
    });
    expect(result.success).toBe(false);
  });
});

// ── validatePipelineConfig ──────────────────────────────────────────

describe("validatePipelineConfig", () => {
  test("returns parsed config for valid input", () => {
    const config = validatePipelineConfig({
      task: "feature-extraction",
      model: "Xenova/all-MiniLM-L6-v2",
    });
    expect(config.task).toBe("feature-extraction");
    expect(config.model).toBe("Xenova/all-MiniLM-L6-v2");
    expect(config.quantized).toBe(true);
  });

  test("throws for invalid input", () => {
    expect(() => validatePipelineConfig({ task: "bad" })).toThrow();
  });

  test("throws for null", () => {
    expect(() => validatePipelineConfig(null)).toThrow();
  });

  test("throws for number", () => {
    expect(() => validatePipelineConfig(123)).toThrow();
  });
});

// ── isValidTask ─────────────────────────────────────────────────────

describe("isValidTask", () => {
  test("returns true for valid tasks", () => {
    expect(isValidTask("text-classification")).toBe(true);
    expect(isValidTask("feature-extraction")).toBe(true);
    expect(isValidTask("summarization")).toBe(true);
  });

  test("returns false for invalid tasks", () => {
    expect(isValidTask("image-classification")).toBe(false);
    expect(isValidTask("")).toBe(false);
    expect(isValidTask("TEXT-CLASSIFICATION")).toBe(false);
  });
});

// ── getDefaultModel ─────────────────────────────────────────────────

describe("getDefaultModel", () => {
  test("returns a model for text-classification", () => {
    const model = getDefaultModel("text-classification");
    expect(typeof model).toBe("string");
    expect(model.length).toBeGreaterThan(0);
  });

  test("returns a model for feature-extraction", () => {
    const model = getDefaultModel("feature-extraction");
    expect(model).toContain("MiniLM");
  });

  test("returns a model for every valid task", () => {
    const tasks: PipelineTaskType[] = [
      "text-classification",
      "token-classification",
      "question-answering",
      "fill-mask",
      "summarization",
      "translation",
      "text-generation",
      "feature-extraction",
      "zero-shot-classification",
      "sentiment-analysis",
    ];
    for (const task of tasks) {
      const model = getDefaultModel(task);
      expect(typeof model).toBe("string");
      expect(model.length).toBeGreaterThan(0);
    }
  });
});

// ── DEFAULT_MODELS mapping ──────────────────────────────────────────

describe("DEFAULT_MODELS", () => {
  test("has an entry for every PipelineTask", () => {
    const tasks = [
      "text-classification",
      "token-classification",
      "question-answering",
      "fill-mask",
      "summarization",
      "translation",
      "text-generation",
      "feature-extraction",
      "zero-shot-classification",
      "sentiment-analysis",
    ];
    for (const task of tasks) {
      expect(DEFAULT_MODELS).toHaveProperty(task);
      expect(typeof DEFAULT_MODELS[task as PipelineTaskType]).toBe("string");
    }
  });

  test("all default model strings contain a slash (org/model format)", () => {
    for (const model of Object.values(DEFAULT_MODELS)) {
      expect(model).toContain("/");
    }
  });

  test("has exactly 10 entries", () => {
    expect(Object.keys(DEFAULT_MODELS).length).toBe(10);
  });
});
