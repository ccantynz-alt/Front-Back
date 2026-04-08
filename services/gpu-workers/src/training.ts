// ── Modal.com GPU Fine-Tuning Worker ────────────────────────────────
// LoRA fine-tuning on A100/H100 GPUs via Modal.com serverless compute.
// Accepts dataset + base model + training params.
// Progress reporting via webhooks. Returns fine-tuned model artifacts.

import { z } from "zod";
import { type ModalEnv, ModalEnvSchema, GPUWorkerError, type InferenceError } from "./inference";

// ── Supported Base Models ───────────────────────────────────────────

export const FINE_TUNE_BASE_MODELS = [
  "llama-3.1-8b",
  "llama-3.1-70b",
  "mistral-7b",
  "mixtral-8x7b",
  "phi-3-mini",
  "gemma-2-9b",
] as const;

export type FineTuneBaseModel = (typeof FINE_TUNE_BASE_MODELS)[number];

export const FineTuneBaseModelSchema = z.enum(FINE_TUNE_BASE_MODELS);

// ── Dataset Schemas ─────────────────────────────────────────────────

export const DatasetFormatSchema = z.enum([
  "jsonl",
  "csv",
  "parquet",
  "huggingface",
]);

export type DatasetFormat = z.infer<typeof DatasetFormatSchema>;

export const DatasetSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("url"),
    url: z.string().url(),
    format: DatasetFormatSchema,
  }),
  z.object({
    type: z.literal("huggingface"),
    repoId: z.string().min(1),
    split: z.string().default("train"),
    subset: z.string().optional(),
  }),
  z.object({
    type: z.literal("inline"),
    /** Array of training examples in chat/completion format */
    examples: z
      .array(
        z.object({
          input: z.string().min(1),
          output: z.string().min(1),
          systemPrompt: z.string().optional(),
        }),
      )
      .min(10)
      .max(100_000),
  }),
]);

export type DatasetSource = z.infer<typeof DatasetSourceSchema>;

// ── LoRA Configuration ──────────────────────────────────────────────

export const LoRAConfigSchema = z.object({
  /** LoRA rank. Higher = more parameters, more capacity, slower training. */
  rank: z.number().int().min(1).max(256).default(16),
  /** LoRA alpha. Scaling factor. Typically rank * 2. */
  alpha: z.number().int().min(1).max(512).default(32),
  /** Dropout for LoRA layers. 0 = no dropout. */
  dropout: z.number().min(0).max(0.5).default(0.05),
  /** Target modules to apply LoRA to. Default: attention layers. */
  targetModules: z
    .array(z.string())
    .default(["q_proj", "k_proj", "v_proj", "o_proj"]),
  /** Use 4-bit quantization (QLoRA) for memory efficiency */
  use4bit: z.boolean().default(true),
});

export type LoRAConfig = z.infer<typeof LoRAConfigSchema>;

// ── Training Parameters ─────────────────────────────────────────────

export const TrainingParamsSchema = z.object({
  epochs: z.number().int().min(1).max(100).default(3),
  batchSize: z.number().int().min(1).max(128).default(4),
  gradientAccumulationSteps: z.number().int().min(1).max(64).default(4),
  learningRate: z.number().min(1e-7).max(1e-2).default(2e-4),
  warmupSteps: z.number().int().min(0).max(10_000).default(100),
  maxSteps: z.number().int().min(-1).max(1_000_000).default(-1),
  weightDecay: z.number().min(0).max(1).default(0.01),
  maxGradNorm: z.number().min(0).max(10).default(1.0),
  scheduler: z
    .enum(["linear", "cosine", "cosine_with_restarts", "constant", "constant_with_warmup"])
    .default("cosine"),
  /** Max sequence length for training */
  maxSeqLength: z.number().int().min(64).max(32_768).default(2048),
  /** Save checkpoint every N steps */
  saveSteps: z.number().int().min(1).default(500),
  /** Evaluate every N steps */
  evalSteps: z.number().int().min(1).default(500),
  /** Seed for reproducibility */
  seed: z.number().int().default(42),
});

export type TrainingParams = z.infer<typeof TrainingParamsSchema>;

// ── Fine-Tune Job Schemas ───────────────────────────────────────────

export const FineTuneInputSchema = z.object({
  /** Unique job name for identification */
  jobName: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9][a-z0-9_-]*$/),
  baseModel: FineTuneBaseModelSchema,
  dataset: DatasetSourceSchema,
  lora: LoRAConfigSchema.optional(),
  training: TrainingParamsSchema.optional(),
  /** GPU type to use */
  gpu: z.enum(["A100", "H100"]).default("A100"),
  /** Number of GPUs (for data/model parallelism) */
  gpuCount: z.number().int().min(1).max(8).default(1),
  /** Webhook URL for progress updates */
  webhookUrl: z.string().url().optional(),
  /** Tags for organization */
  tags: z.array(z.string().max(64)).max(10).optional(),
});

export type FineTuneInput = z.infer<typeof FineTuneInputSchema>;

export const FineTuneJobStatusSchema = z.enum([
  "queued",
  "preparing",
  "training",
  "evaluating",
  "uploading",
  "completed",
  "failed",
  "cancelled",
]);

export type FineTuneJobStatus = z.infer<typeof FineTuneJobStatusSchema>;

export const TrainingMetricsSchema = z.object({
  step: z.number().int().nonnegative(),
  epoch: z.number().nonnegative(),
  loss: z.number(),
  learningRate: z.number(),
  evalLoss: z.number().optional(),
  evalPerplexity: z.number().optional(),
  gradNorm: z.number().optional(),
  tokensPerSecond: z.number().optional(),
  gpuMemoryUsedMB: z.number().optional(),
});

export type TrainingMetrics = z.infer<typeof TrainingMetricsSchema>;

export const CheckpointSchema = z.object({
  step: z.number().int().nonnegative(),
  url: z.string().url(),
  sizeBytes: z.number().int().nonnegative(),
  metrics: TrainingMetricsSchema,
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;

export const FineTuneOutputSchema = z.object({
  id: z.string(),
  jobName: z.string(),
  status: FineTuneJobStatusSchema,
  baseModel: FineTuneBaseModelSchema,
  /** URL to the final LoRA adapter weights */
  adapterUrl: z.string().url().optional(),
  /** URL to the merged full model (if requested) */
  mergedModelUrl: z.string().url().optional(),
  /** All training checkpoints */
  checkpoints: z.array(CheckpointSchema),
  /** Final training metrics */
  finalMetrics: TrainingMetricsSchema.optional(),
  /** Total training time in milliseconds */
  trainingTimeMs: z.number().int().nonnegative(),
  /** Total GPU hours consumed */
  gpuHours: z.number().nonnegative(),
  /** Total tokens processed */
  totalTokensProcessed: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  error: z.string().optional(),
});

export type FineTuneOutput = z.infer<typeof FineTuneOutputSchema>;

// ── Progress Webhook Payload ────────────────────────────────────────

export const TrainingProgressSchema = z.object({
  jobId: z.string(),
  jobName: z.string(),
  status: FineTuneJobStatusSchema,
  progress: z.number().min(0).max(1),
  currentStep: z.number().int().nonnegative(),
  totalSteps: z.number().int().nonnegative(),
  currentEpoch: z.number().nonnegative(),
  totalEpochs: z.number().int().positive(),
  metrics: TrainingMetricsSchema.optional(),
  estimatedRemainingMs: z.number().int().nonnegative().optional(),
  timestamp: z.string().datetime(),
});

export type TrainingProgress = z.infer<typeof TrainingProgressSchema>;

// ── Fine-Tuning Client ──────────────────────────────────────────────

export class FineTuningClient {
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
   * Start a fine-tuning job. Returns immediately with job ID.
   * Poll `getJobStatus()` or use webhooks for progress updates.
   */
  async startFineTune(input: FineTuneInput): Promise<FineTuneOutput> {
    const validated = FineTuneInputSchema.parse(input);

    const datasetPayload = this.serializeDatasetSource(validated.dataset);
    const loraConfig = validated.lora ?? LoRAConfigSchema.parse({});
    const trainingParams = validated.training ?? TrainingParamsSchema.parse({});

    const response = await this.makeRequest("/v1/training/start", {
      job_name: validated.jobName,
      base_model: validated.baseModel,
      dataset: datasetPayload,
      lora: {
        rank: loraConfig.rank,
        alpha: loraConfig.alpha,
        dropout: loraConfig.dropout,
        target_modules: loraConfig.targetModules,
        use_4bit: loraConfig.use4bit,
      },
      training: {
        epochs: trainingParams.epochs,
        batch_size: trainingParams.batchSize,
        gradient_accumulation_steps: trainingParams.gradientAccumulationSteps,
        learning_rate: trainingParams.learningRate,
        warmup_steps: trainingParams.warmupSteps,
        max_steps: trainingParams.maxSteps,
        weight_decay: trainingParams.weightDecay,
        max_grad_norm: trainingParams.maxGradNorm,
        scheduler: trainingParams.scheduler,
        max_seq_length: trainingParams.maxSeqLength,
        save_steps: trainingParams.saveSteps,
        eval_steps: trainingParams.evalSteps,
        seed: trainingParams.seed,
      },
      gpu: validated.gpu,
      gpu_count: validated.gpuCount,
      webhook_url: validated.webhookUrl,
      tags: validated.tags,
    });

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }

    const body = (await response.json()) as {
      id: string;
      job_name: string;
      status: string;
      base_model: string;
      created_at: string;
    };

    return FineTuneOutputSchema.parse({
      id: body.id,
      jobName: body.job_name,
      status: body.status,
      baseModel: body.base_model,
      checkpoints: [],
      trainingTimeMs: 0,
      gpuHours: 0,
      totalTokensProcessed: 0,
      createdAt: body.created_at,
    });
  }

  /**
   * Get the current status and metrics of a fine-tuning job.
   */
  async getJobStatus(jobId: string): Promise<FineTuneOutput> {
    const response = await this.makeRequest(
      `/v1/training/status/${encodeURIComponent(jobId)}`,
      {},
      "GET",
    );

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }

    const body = (await response.json()) as {
      id: string;
      job_name: string;
      status: string;
      base_model: string;
      adapter_url?: string;
      merged_model_url?: string;
      checkpoints: Array<{
        step: number;
        url: string;
        size_bytes: number;
        metrics: {
          step: number;
          epoch: number;
          loss: number;
          learning_rate: number;
          eval_loss?: number;
          eval_perplexity?: number;
          grad_norm?: number;
          tokens_per_second?: number;
          gpu_memory_used_mb?: number;
        };
      }>;
      final_metrics?: {
        step: number;
        epoch: number;
        loss: number;
        learning_rate: number;
        eval_loss?: number;
        eval_perplexity?: number;
        grad_norm?: number;
        tokens_per_second?: number;
        gpu_memory_used_mb?: number;
      };
      training_time_ms: number;
      gpu_hours: number;
      total_tokens_processed: number;
      created_at: string;
      completed_at?: string;
      error?: string;
    };

    return FineTuneOutputSchema.parse({
      id: body.id,
      jobName: body.job_name,
      status: body.status,
      baseModel: body.base_model,
      adapterUrl: body.adapter_url,
      mergedModelUrl: body.merged_model_url,
      checkpoints: body.checkpoints.map((cp) => ({
        step: cp.step,
        url: cp.url,
        sizeBytes: cp.size_bytes,
        metrics: {
          step: cp.metrics.step,
          epoch: cp.metrics.epoch,
          loss: cp.metrics.loss,
          learningRate: cp.metrics.learning_rate,
          evalLoss: cp.metrics.eval_loss,
          evalPerplexity: cp.metrics.eval_perplexity,
          gradNorm: cp.metrics.grad_norm,
          tokensPerSecond: cp.metrics.tokens_per_second,
          gpuMemoryUsedMB: cp.metrics.gpu_memory_used_mb,
        },
      })),
      finalMetrics: body.final_metrics
        ? {
            step: body.final_metrics.step,
            epoch: body.final_metrics.epoch,
            loss: body.final_metrics.loss,
            learningRate: body.final_metrics.learning_rate,
            evalLoss: body.final_metrics.eval_loss,
            evalPerplexity: body.final_metrics.eval_perplexity,
            gradNorm: body.final_metrics.grad_norm,
            tokensPerSecond: body.final_metrics.tokens_per_second,
            gpuMemoryUsedMB: body.final_metrics.gpu_memory_used_mb,
          }
        : undefined,
      trainingTimeMs: body.training_time_ms,
      gpuHours: body.gpu_hours,
      totalTokensProcessed: body.total_tokens_processed,
      createdAt: body.created_at,
      completedAt: body.completed_at,
      error: body.error,
    });
  }

  /**
   * Cancel a running fine-tuning job.
   */
  async cancelJob(jobId: string): Promise<FineTuneOutput> {
    const response = await this.makeRequest(
      `/v1/training/cancel/${encodeURIComponent(jobId)}`,
      {},
    );

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }

    return this.getJobStatus(jobId);
  }

  /**
   * List all fine-tuning jobs, optionally filtered by status.
   */
  async listJobs(
    filters?: { status?: FineTuneJobStatus; limit?: number; offset?: number },
  ): Promise<{ jobs: FineTuneOutput[]; total: number }> {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.limit !== undefined) params.set("limit", String(filters.limit));
    if (filters?.offset !== undefined) params.set("offset", String(filters.offset));

    const query = params.toString();
    const path = `/v1/training/jobs${query ? `?${query}` : ""}`;

    const response = await this.makeRequest(path, {}, "GET");

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }

    const body = (await response.json()) as {
      jobs: Array<{
        id: string;
        job_name: string;
        status: string;
        base_model: string;
        adapter_url?: string;
        merged_model_url?: string;
        checkpoints: Array<{
          step: number;
          url: string;
          size_bytes: number;
          metrics: {
            step: number;
            epoch: number;
            loss: number;
            learning_rate: number;
          };
        }>;
        training_time_ms: number;
        gpu_hours: number;
        total_tokens_processed: number;
        created_at: string;
        completed_at?: string;
        error?: string;
      }>;
      total: number;
    };

    return {
      jobs: body.jobs.map((job) =>
        FineTuneOutputSchema.parse({
          id: job.id,
          jobName: job.job_name,
          status: job.status,
          baseModel: job.base_model,
          adapterUrl: job.adapter_url,
          mergedModelUrl: job.merged_model_url,
          checkpoints: job.checkpoints.map((cp) => ({
            step: cp.step,
            url: cp.url,
            sizeBytes: cp.size_bytes,
            metrics: {
              step: cp.metrics.step,
              epoch: cp.metrics.epoch,
              loss: cp.metrics.loss,
              learningRate: cp.metrics.learning_rate,
            },
          })),
          trainingTimeMs: job.training_time_ms,
          gpuHours: job.gpu_hours,
          totalTokensProcessed: job.total_tokens_processed,
          createdAt: job.created_at,
          completedAt: job.completed_at,
          error: job.error,
        }),
      ),
      total: body.total,
    };
  }

  // ── Private Helpers ────────────────────────────────────────────────

  private serializeDatasetSource(
    dataset: DatasetSource,
  ): Record<string, unknown> {
    switch (dataset.type) {
      case "url":
        return { type: "url", url: dataset.url, format: dataset.format };
      case "huggingface":
        return {
          type: "huggingface",
          repo_id: dataset.repoId,
          split: dataset.split,
          subset: dataset.subset,
        };
      case "inline":
        return {
          type: "inline",
          examples: dataset.examples.map((ex) => {
            const mapped: Record<string, string> = {
              input: ex.input,
              output: ex.output,
            };
            if (ex.systemPrompt !== undefined) {
              mapped["system_prompt"] = ex.systemPrompt;
            }
            return mapped;
          }),
        };
      default: {
        const _exhaustive: never = dataset;
        throw new Error(`Unknown dataset type: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

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
}

// ── Factory ─────────────────────────────────────────────────────────

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
 * Creates a fine-tuning client from environment variables.
 * Reads MODAL_TOKEN_ID, MODAL_TOKEN_SECRET, and optional MODAL_ENDPOINT_URL.
 */
export function createFineTuningClient(
  envOverrides?: Partial<ModalEnv>,
): FineTuningClient {
  const raw = {
    MODAL_TOKEN_ID:
      envOverrides?.MODAL_TOKEN_ID ?? readEnv("MODAL_TOKEN_ID") ?? "",
    MODAL_TOKEN_SECRET:
      envOverrides?.MODAL_TOKEN_SECRET ?? readEnv("MODAL_TOKEN_SECRET") ?? "",
    MODAL_ENDPOINT_URL:
      envOverrides?.MODAL_ENDPOINT_URL ??
      readEnv("MODAL_ENDPOINT_URL") ??
      "https://api.modal.com",
  };

  const env = ModalEnvSchema.parse(raw);
  return new FineTuningClient(env);
}
