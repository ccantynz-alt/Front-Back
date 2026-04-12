// ── AI Provider Failover Tests ──────────────────────────────────────
// Verifies that routeAICall automatically fails over from the primary
// provider to the fallback when a retryable error occurs.

import { describe, test, expect } from "bun:test";
import {
  readProviderEnv,
  getModelForTier,
  getFallbackModel,
  isRetryableError,
  routeAICall,
  type AIProviderEnv,
} from "./providers";

/** Extract modelId from a LanguageModel (exists on both v2 and v3 spec). */
function modelId(model: unknown): string {
  const m = model as { modelId?: string };
  return m.modelId ?? "unknown";
}

// ── isRetryableError ──────────────────────────────────────────────

describe("isRetryableError", () => {
  test("returns true for 429 rate limit errors", () => {
    const err = new Error("Request failed with status 429");
    expect(isRetryableError(err)).toBe(true);
  });

  test("returns true for 500 server errors", () => {
    const err = new Error("Internal server error 500");
    expect(isRetryableError(err)).toBe(true);
  });

  test("returns true for 503 service unavailable", () => {
    const err = new Error("Service unavailable");
    expect(isRetryableError(err)).toBe(true);
  });

  test("returns true for timeout errors", () => {
    const err = new Error("Request timed out");
    expect(isRetryableError(err)).toBe(true);
  });

  test("returns true for rate limit messages", () => {
    const err = new Error("Rate limit exceeded, please retry");
    expect(isRetryableError(err)).toBe(true);
  });

  test("returns false for auth errors", () => {
    const err = new Error("Invalid API key");
    expect(isRetryableError(err)).toBe(false);
  });

  test("returns false for validation errors", () => {
    const err = new Error("Invalid input: messages is required");
    expect(isRetryableError(err)).toBe(false);
  });

  test("handles error objects with status property", () => {
    const err = { status: 429, message: "Too Many Requests" };
    expect(isRetryableError(err)).toBe(true);
  });

  test("returns false for non-retryable status codes", () => {
    const err = { status: 401, message: "Unauthorized" };
    expect(isRetryableError(err)).toBe(false);
  });
});

// ── routeAICall failover ────────────────────────────────────────────

describe("routeAICall", () => {
  // Build a mock env with both providers configured
  const mockEnv: AIProviderEnv = {
    cloud: {
      apiKey: "sk-test-openai-key-12345",
      baseURL: undefined,
      model: "gpt-4o",
      organization: undefined,
    },
    edge: {
      apiKey: "sk-test-openai-key-12345",
      baseURL: undefined,
      model: "gpt-4o-mini",
      organization: undefined,
    },
    fallback: undefined,
    anthropic: {
      apiKey: "sk-ant-test-anthropic-key-12345",
      model: "claude-sonnet-4-20250514",
    },
  };

  test("calls primary provider on success", async () => {
    let callCount = 0;
    const result = await routeAICall(
      mockEnv,
      async (_model) => {
        callCount += 1;
        return { response: "primary" };
      },
      "cloud",
    );
    expect(callCount).toBe(1);
    expect(result).toEqual({ response: "primary" });
  });

  test("fails over to fallback on retryable error", async () => {
    let callCount = 0;
    const result = await routeAICall(
      mockEnv,
      async (_model) => {
        callCount += 1;
        if (callCount === 1) {
          throw new Error("Request failed with status 429");
        }
        return { response: "fallback" };
      },
      "cloud",
    );
    expect(callCount).toBe(2);
    expect(result).toEqual({ response: "fallback" });
  });

  test("propagates non-retryable errors immediately", async () => {
    let callCount = 0;
    try {
      await routeAICall(
        mockEnv,
        async (_model) => {
          callCount += 1;
          throw new Error("Invalid API key");
        },
        "cloud",
      );
      expect(true).toBe(false); // Should not reach
    } catch (err) {
      expect(callCount).toBe(1); // No retry
      expect((err as Error).message).toBe("Invalid API key");
    }
  });

  test("propagates retryable error when no fallback is configured", async () => {
    const noFallbackEnv: AIProviderEnv = {
      cloud: {
        apiKey: "sk-test-key",
        baseURL: undefined,
        model: "gpt-4o",
        organization: undefined,
      },
      edge: {
        apiKey: "sk-test-key",
        baseURL: undefined,
        model: "gpt-4o-mini",
        organization: undefined,
      },
      fallback: undefined,
      anthropic: undefined,
    };

    try {
      await routeAICall(
        noFallbackEnv,
        async (_model) => {
          throw new Error("Service unavailable");
        },
        "cloud",
      );
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toBe("Service unavailable");
    }
  });
});

// ── readProviderEnv ────────────────────────────────────────────────

describe("readProviderEnv", () => {
  test("returns AIProviderEnv with expected shape", () => {
    const providerEnv = readProviderEnv();
    expect(providerEnv.cloud).toBeDefined();
    expect(providerEnv.cloud.model).toBeString();
    expect(providerEnv.edge).toBeDefined();
    expect(providerEnv.edge.model).toBeString();
  });

  test("cloud model defaults to gpt-4o", () => {
    const providerEnv = readProviderEnv();
    // Unless overridden by env, default is gpt-4o
    expect(providerEnv.cloud.model).toBe("gpt-4o");
  });

  test("edge model defaults to gpt-4o-mini", () => {
    const providerEnv = readProviderEnv();
    expect(providerEnv.edge.model).toBe("gpt-4o-mini");
  });
});

// ── getModelForTier ─────────────────────────────────────────────────

describe("getModelForTier", () => {
  test("returns a LanguageModel for cloud tier", () => {
    const envWithOpenAI: AIProviderEnv = {
      cloud: {
        apiKey: "sk-test-key-12345",
        baseURL: undefined,
        model: "gpt-4o",
        organization: undefined,
      },
      edge: {
        apiKey: "sk-test-key-12345",
        baseURL: undefined,
        model: "gpt-4o-mini",
        organization: undefined,
      },
      fallback: undefined,
      anthropic: undefined,
    };
    const model = getModelForTier("cloud", envWithOpenAI);
    expect(model).toBeDefined();
    expect(modelId(model)).toBe("gpt-4o");
  });

  test("prefers Anthropic for cloud tier when configured", () => {
    const envWithBoth: AIProviderEnv = {
      cloud: {
        apiKey: "sk-test-openai-key-12345",
        baseURL: undefined,
        model: "gpt-4o",
        organization: undefined,
      },
      edge: {
        apiKey: "sk-test-openai-key-12345",
        baseURL: undefined,
        model: "gpt-4o-mini",
        organization: undefined,
      },
      fallback: undefined,
      anthropic: {
        apiKey: "sk-ant-test-key-12345",
        model: "claude-sonnet-4-20250514",
      },
    };
    const model = getModelForTier("cloud", envWithBoth);
    expect(model).toBeDefined();
    expect(modelId(model)).toBe("claude-sonnet-4-20250514");
  });

  test("returns edge model for edge tier regardless of Anthropic", () => {
    const envWithBoth: AIProviderEnv = {
      cloud: {
        apiKey: "sk-test-openai-key-12345",
        baseURL: undefined,
        model: "gpt-4o",
        organization: undefined,
      },
      edge: {
        apiKey: "sk-test-openai-key-12345",
        baseURL: undefined,
        model: "gpt-4o-mini",
        organization: undefined,
      },
      fallback: undefined,
      anthropic: {
        apiKey: "sk-ant-test-key-12345",
        model: "claude-sonnet-4-20250514",
      },
    };
    const model = getModelForTier("edge", envWithBoth);
    expect(modelId(model)).toBe("gpt-4o-mini");
  });
});

// ── getFallbackModel ────────────────────────────────────────────────

describe("getFallbackModel", () => {
  test("returns OpenAI as fallback when Anthropic is primary", () => {
    const envWithBoth: AIProviderEnv = {
      cloud: {
        apiKey: "sk-test-openai-key-12345",
        baseURL: undefined,
        model: "gpt-4o",
        organization: undefined,
      },
      edge: {
        apiKey: "sk-test-openai-key-12345",
        baseURL: undefined,
        model: "gpt-4o-mini",
        organization: undefined,
      },
      fallback: undefined,
      anthropic: {
        apiKey: "sk-ant-test-key-12345",
        model: "claude-sonnet-4-20250514",
      },
    };
    const fallback = getFallbackModel(envWithBoth);
    expect(fallback).toBeDefined();
    expect(modelId(fallback)).toBe("gpt-4o");
  });

  test("returns undefined when only OpenAI is configured (no fallback)", () => {
    const envOpenAIOnly: AIProviderEnv = {
      cloud: {
        apiKey: "sk-test-key-12345",
        baseURL: undefined,
        model: "gpt-4o",
        organization: undefined,
      },
      edge: {
        apiKey: "sk-test-key-12345",
        baseURL: undefined,
        model: "gpt-4o-mini",
        organization: undefined,
      },
      fallback: undefined,
      anthropic: undefined,
    };
    const fallback = getFallbackModel(envOpenAIOnly);
    expect(fallback).toBeUndefined();
  });

  test("explicit fallback config takes priority", () => {
    const envWithExplicit: AIProviderEnv = {
      cloud: {
        apiKey: "sk-test-key",
        baseURL: undefined,
        model: "gpt-4o",
        organization: undefined,
      },
      edge: {
        apiKey: "sk-test-key",
        baseURL: undefined,
        model: "gpt-4o-mini",
        organization: undefined,
      },
      fallback: {
        apiKey: "sk-fallback-key-12345",
        baseURL: undefined,
        model: "gpt-4o-mini",
        organization: undefined,
      },
      anthropic: {
        apiKey: "sk-ant-key-12345",
        model: "claude-sonnet-4-20250514",
      },
    };
    const fallback = getFallbackModel(envWithExplicit);
    expect(fallback).toBeDefined();
    expect(modelId(fallback)).toBe("gpt-4o-mini");
  });
});
