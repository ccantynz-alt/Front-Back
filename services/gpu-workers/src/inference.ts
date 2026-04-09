// ── Modal.com GPU Inference Worker ─────────────────────────────────
// Heavy AI inference on A100/H100 GPUs via Modal.com serverless compute.
// Supports Llama 3.1 70B, Mixtral 8x7B, and Stable Diffusion XL.
// Streaming responses, health checks, graceful error handling.

import { z } from "zod";

// ── Environment ──────────────────────────────────────────────────────

export const ModalEnvSchema = z.object({
  MODAL_TOKEN_ID: z.string().min(1),
  MODAL_TOKEN_SECRET: z.string().min(1),
  MODAL_ENDPOINT_URL: z
    .string()
    .url()
    .default("https://api.modal.com"),
});

export type ModalEnv = z.infer<typeof ModalEnvSchema>;

// ── Supported Models ─────────────────────────────────────────────────

export const GPU_MODELS = {
  "llama-3.1-70b": {
    id: "llama-3.1-70b",
    displayName: "Llama 3.1 70B",
    parametersBillion: 70,
    gpu: "A100" as const,
    gpuCount: 2,
    maxTokens: 4096,
    category: "text" as const,
  },
  "mixtral-8x7b": {
    id: "mixtral-8x7b",
    displayName: "Mixtral 8x7B",
    parametersBillion: 46.7,
    gpu: "A100" as const,
    gpuCount: 1,
    maxTokens: 32768,
    category: "text" as const,
  },
  "sdxl-1.0": {
    id: "sdxl-1.0",
    displayName: "Stable Diffusion XL 1.0",
    parametersBillion: 6.6,
    gpu: "A100" as const,
    gpuCount: 1,
    maxTokens: 0,
    category: "image" as const,
  },
} as const;

export type GPUModelId = keyof typeof GPU_MODELS;

export const GPUModelIdSchema = z.enum(
  Object.keys(GPU_MODELS) as [GPUModelId, ...GPUModelId[]],
);

// ── Input/Output Schemas ─────────────────────────────────────────────

export const InferenceInputSchema = z.object({
  model: GPUModelIdSchema,
  prompt: z.string().min(1).max(100_000),
  systemPrompt: z.string().max(10_000).optional(),
  maxTokens: z.number().int().min(1).max(32_768).default(2048),
  temperature: z.number().min(0).max(2).default(0.7),
  topP: z.number().min(0).max(1).default(0.9),
  stream: z.boolean().default(true),
  stop: z.array(z.string()).max(8).optional(),
});

export type InferenceInput = z.infer<typeof InferenceInputSchema>;

export const InferenceOutputSchema = z.object({
  id: z.string(),
  model: GPUModelIdSchema,
  text: z.string(),
  finishReason: z.enum(["stop", "length", "error"]),
  usage: z.object({
    promptTokens: z.number().int().nonnegative(),
    completionTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  }),
  latencyMs: z.number().nonnegative(),
});

export type InferenceOutput = z.infer<typeof InferenceOutputSchema>;

export const InferenceStreamChunkSchema = z.object({
  id: z.string(),
  delta: z.string(),
  finishReason: z.enum(["stop", "length", "error"]).nullable(),
});

export type InferenceStreamChunk = z.infer<typeof InferenceStreamChunkSchema>;

// ── Image Generation Schemas ─────────────────────────────────────────

export const ImageGenerationInputSchema = z.object({
  model: z.literal("sdxl-1.0"),
  prompt: z.string().min(1).max(10_000),
  negativePrompt: z.string().max(10_000).optional(),
  width: z.number().int().min(512).max(2048).default(1024),
  height: z.number().int().min(512).max(2048).default(1024),
  steps: z.number().int().min(1).max(150).default(30),
  guidanceScale: z.number().min(0).max(50).default(7.5),
  seed: z.number().int().optional(),
});

export type ImageGenerationInput = z.infer<typeof ImageGenerationInputSchema>;

export const ImageGenerationOutputSchema = z.object({
  id: z.string(),
  model: z.literal("sdxl-1.0"),
  imageUrl: z.string().url(),
  width: z.number().int(),
  height: z.number().int(),
  seed: z.number().int(),
  latencyMs: z.number().nonnegative(),
});

export type ImageGenerationOutput = z.infer<typeof ImageGenerationOutputSchema>;

// ── Health Check ─────────────────────────────────────────────────────

export const HealthCheckOutputSchema = z.object({
  status: z.enum(["healthy", "degraded", "unhealthy"]),
  timestamp: z.string().datetime(),
  models: z.record(
    GPUModelIdSchema,
    z.object({
      available: z.boolean(),
      coldStartMs: z.number().nonnegative().optional(),
      queueDepth: z.number().int().nonnegative().optional(),
    }),
  ),
  region: z.string(),
});

export type HealthCheckOutput = z.infer<typeof HealthCheckOutputSchema>;

// ── Error Types ──────────────────────────────────────────────────────

export const InferenceErrorSchema = z.object({
  code: z.enum([
    "MODEL_UNAVAILABLE",
    "GPU_OOM",
    "RATE_LIMITED",
    "TIMEOUT",
    "INVALID_INPUT",
    "AUTH_FAILED",
    "INTERNAL_ERROR",
  ]),
  message: z.string(),
  retryable: z.boolean(),
  retryAfterMs: z.number().int().nonnegative().optional(),
});

export type InferenceError = z.infer<typeof InferenceErrorSchema>;

// ── GPU Inference Client ─────────────────────────────────────────────

export class GPUInferenceClient {
  private readonly baseUrl: string;
  private readonly tokenId: string;
  private readonly tokenSecret: string;

  constructor(env: ModalEnv) {
    this.baseUrl = env.MODAL_ENDPOINT_URL;
    this.tokenId = env.MODAL_TOKEN_ID;
    this.tokenSecret = env.MODAL_TOKEN_SECRET;
  }

  /** Build auth headers for Modal.com API */
  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.tokenId}:${this.tokenSecret}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Run text inference (non-streaming). Returns the full response.
   * For streaming, use `streamInference()`.
   */
  async runInference(input: InferenceInput): Promise<InferenceOutput> {
    const validated = InferenceInputSchema.parse(input);
    const modelId = validated.model;
    const modelDef = GPU_MODELS[modelId];

    if (modelDef.category === "image") {
      throw new GPUWorkerError({
        code: "INVALID_INPUT",
        message: `Model ${modelId} is an image model. Use runImageGeneration() instead.`,
        retryable: false,
      });
    }

    const startMs = performance.now();

    const response = await this.makeRequest("/v1/inference", {
      model: validated.model,
      prompt: validated.prompt,
      system_prompt: validated.systemPrompt,
      max_tokens: validated.maxTokens,
      temperature: validated.temperature,
      top_p: validated.topP,
      stop: validated.stop,
      stream: false,
    });

    const latencyMs = performance.now() - startMs;

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }

    const body = (await response.json()) as {
      id: string;
      text: string;
      finish_reason: string;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    return InferenceOutputSchema.parse({
      id: body.id,
      model: validated.model,
      text: body.text,
      finishReason: body.finish_reason,
      usage: {
        promptTokens: body.usage.prompt_tokens,
        completionTokens: body.usage.completion_tokens,
        totalTokens: body.usage.total_tokens,
      },
      latencyMs,
    });
  }

  /**
   * Stream text inference. Returns an async iterable of chunks.
   * Each chunk contains a delta string and optional finish reason.
   */
  async *streamInference(
    input: InferenceInput,
  ): AsyncGenerator<InferenceStreamChunk, void, undefined> {
    const validated = InferenceInputSchema.parse({ ...input, stream: true });
    const modelId = validated.model;
    const modelDef = GPU_MODELS[modelId];

    if (modelDef.category === "image") {
      throw new GPUWorkerError({
        code: "INVALID_INPUT",
        message: `Model ${modelId} is an image model. Streaming is not supported.`,
        retryable: false,
      });
    }

    const response = await this.makeRequest("/v1/inference", {
      model: validated.model,
      prompt: validated.prompt,
      system_prompt: validated.systemPrompt,
      max_tokens: validated.maxTokens,
      temperature: validated.temperature,
      top_p: validated.topP,
      stop: validated.stop,
      stream: true,
    });

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }

    const body = response.body;
    if (!body) {
      throw new GPUWorkerError({
        code: "INTERNAL_ERROR",
        message: "No response body for streaming inference",
        retryable: true,
        retryAfterMs: 1000,
      });
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last potentially incomplete line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data) as {
              id: string;
              delta: string;
              finish_reason: string | null;
            };
            yield InferenceStreamChunkSchema.parse({
              id: parsed.id,
              delta: parsed.delta,
              finishReason: parsed.finish_reason,
            });
          } catch {
            // Skip malformed chunks -- server-sent events can be noisy
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Generate an image using Stable Diffusion XL.
   */
  async runImageGeneration(
    input: ImageGenerationInput,
  ): Promise<ImageGenerationOutput> {
    const validated = ImageGenerationInputSchema.parse(input);
    const startMs = performance.now();

    const response = await this.makeRequest("/v1/image/generate", {
      model: validated.model,
      prompt: validated.prompt,
      negative_prompt: validated.negativePrompt,
      width: validated.width,
      height: validated.height,
      steps: validated.steps,
      guidance_scale: validated.guidanceScale,
      seed: validated.seed,
    });

    const latencyMs = performance.now() - startMs;

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }

    const body = (await response.json()) as {
      id: string;
      image_url: string;
      width: number;
      height: number;
      seed: number;
    };

    return ImageGenerationOutputSchema.parse({
      id: body.id,
      model: "sdxl-1.0",
      imageUrl: body.image_url,
      width: body.width,
      height: body.height,
      seed: body.seed,
      latencyMs,
    });
  }

  /**
   * Health check -- reports model availability and queue depth.
   */
  async healthCheck(): Promise<HealthCheckOutput> {
    try {
      const response = await this.makeRequest("/v1/health", {}, "GET");

      if (!response.ok) {
        return this.degradedHealth("Modal API returned non-200");
      }

      const body = (await response.json()) as {
        models: Record<
          string,
          { available: boolean; cold_start_ms?: number; queue_depth?: number }
        >;
        region: string;
      };

      const models: Record<
        string,
        { available: boolean; coldStartMs?: number | undefined; queueDepth?: number | undefined }
      > = {};

      for (const [modelId, status] of Object.entries(body.models)) {
        const entry: { available: boolean; coldStartMs?: number | undefined; queueDepth?: number | undefined } = {
          available: status.available,
        };
        if (status.cold_start_ms !== undefined) entry.coldStartMs = status.cold_start_ms;
        if (status.queue_depth !== undefined) entry.queueDepth = status.queue_depth;
        models[modelId] = entry;
      }

      const allAvailable = Object.values(models).every((m) => m.available);

      return HealthCheckOutputSchema.parse({
        status: allAvailable ? "healthy" : "degraded",
        timestamp: new Date().toISOString(),
        models,
        region: body.region,
      });
    } catch {
      return this.degradedHealth("Modal API unreachable");
    }
  }

  // ── Private Helpers ────────────────────────────────────────────────

  private async makeRequest(
    path: string,
    body: Record<string, unknown>,
    method: "POST" | "GET" = "POST",
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: this.authHeaders(),
    };
    if (method === "POST") {
      options.body = JSON.stringify(body);
    }
    return fetch(url, options);
  }

  private async handleErrorResponse(response: Response): Promise<GPUWorkerError> {
    let body: { error?: string; code?: string; retry_after_ms?: number } = {};
    try {
      body = (await response.json()) as typeof body;
    } catch {
      // Response body may not be JSON
    }

    const statusToCode: Record<number, InferenceError["code"]> = {
      401: "AUTH_FAILED",
      403: "AUTH_FAILED",
      422: "INVALID_INPUT",
      429: "RATE_LIMITED",
      503: "MODEL_UNAVAILABLE",
      504: "TIMEOUT",
    };

    const code = statusToCode[response.status] ?? "INTERNAL_ERROR";
    const retryable = response.status >= 500 || response.status === 429;

    return new GPUWorkerError({
      code,
      message: body.error ?? `Modal API error: HTTP ${response.status}`,
      retryable,
      retryAfterMs: body.retry_after_ms,
    });
  }

  private degradedHealth(reason: string): HealthCheckOutput {
    const models: Record<
      string,
      { available: boolean; coldStartMs?: number; queueDepth?: number }
    > = {};
    for (const modelId of Object.keys(GPU_MODELS)) {
      models[modelId] = { available: false };
    }

    return {
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      models,
      region: `unknown (${reason})`,
    };
  }
}

// ── Error Class ──────────────────────────────────────────────────────

export class GPUWorkerError extends Error {
  readonly code: InferenceError["code"];
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;

  constructor(error: InferenceError) {
    super(error.message);
    this.name = "GPUWorkerError";
    this.code = error.code;
    this.retryable = error.retryable;
    this.retryAfterMs = error.retryAfterMs;
  }

  toJSON(): InferenceError {
    return InferenceErrorSchema.parse({
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
    });
  }
}

// ── Factory ──────────────────────────────────────────────────────────

/**
 * Reads a single env var safely across Bun, Node, and Workers.
 */
function readEnv(key: string): string | undefined {
  try {
    const proc = (globalThis as Record<string, unknown>)["process"] as
      | { env: Record<string, string | undefined> }
      | undefined;
    return proc?.env[key] ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Creates a GPU inference client from environment variables.
 * Reads MODAL_TOKEN_ID, MODAL_TOKEN_SECRET, and optional MODAL_ENDPOINT_URL.
 */
export function createInferenceClient(envOverrides?: Partial<ModalEnv>): GPUInferenceClient {
  const raw = {
    MODAL_TOKEN_ID: envOverrides?.MODAL_TOKEN_ID ?? readEnv("MODAL_TOKEN_ID") ?? "",
    MODAL_TOKEN_SECRET:
      envOverrides?.MODAL_TOKEN_SECRET ?? readEnv("MODAL_TOKEN_SECRET") ?? "",
    MODAL_ENDPOINT_URL:
      envOverrides?.MODAL_ENDPOINT_URL ??
      readEnv("MODAL_ENDPOINT_URL") ??
      "https://api.modal.com",
  };

  const env = ModalEnvSchema.parse(raw);
  return new GPUInferenceClient(env);
}
