// ── Modal.com GPU Workers — Unified Entry Point ────────────────────
// Cloud tier of Crontech's three-tier AI compute model.
// Client GPU ($0) → Edge (sub-50ms) → Cloud (full H100 power)
//
// This module exports:
//   1. GPU inference client (Llama 3.1 70B, Mixtral 8x7B, SDXL)
//   2. Video processing client (transcode, scene detection, thumbnails)
//   3. Fine-tuning client (LoRA on A100/H100)
//   4. Unified GPUWorkerClient that wraps all three

import { z } from "zod";
import {
  GPUInferenceClient,
  ModalEnvSchema,
} from "./inference";
import type {
  InferenceInput,
  InferenceOutput,
  InferenceStreamChunk,
  ImageGenerationOutput,
  HealthCheckOutput,
  ModalEnv,
} from "./inference";
import { VideoProcessingClient } from "./video-processing";
import {
  TranscodeInputSchema,
  SceneDetectionInputSchema,
  ThumbnailInputSchema,
} from "./video-processing";
import type {
  TranscodeOutput,
  SceneDetectionInput,
  SceneDetectionOutput,
  ThumbnailOutput,
  VideoMetadata,
} from "./video-processing";
import { FineTuningClient } from "./training";
import type {
  FineTuneInput,
  FineTuneOutput,
} from "./training";

// ── Re-export everything ────────────────────────────────────────────

// Inference
export {
  GPUInferenceClient,
  createInferenceClient,
  GPU_MODELS,
  GPUModelIdSchema,
  InferenceInputSchema,
  InferenceOutputSchema,
  InferenceStreamChunkSchema,
  ImageGenerationInputSchema,
  ImageGenerationOutputSchema,
  HealthCheckOutputSchema,
  InferenceErrorSchema,
  ModalEnvSchema,
  GPUWorkerError,
} from "./inference";

export type {
  GPUModelId,
  InferenceInput,
  InferenceOutput,
  InferenceStreamChunk,
  ImageGenerationInput,
  ImageGenerationOutput,
  HealthCheckOutput,
  InferenceError,
  ModalEnv,
} from "./inference";

// Video Processing
export {
  VideoProcessingClient,
  createVideoProcessingClient,
  VIDEO_FORMATS,
  VIDEO_CODECS,
  VideoFormatSchema,
  VideoCodecSchema,
  TranscodeInputSchema,
  TranscodeOutputSchema,
  SceneDetectionInputSchema,
  SceneDetectionOutputSchema,
  DetectedSceneSchema,
  ThumbnailInputSchema,
  ThumbnailSchema,
  ThumbnailOutputSchema,
  VideoMetadataSchema,
} from "./video-processing";

export type {
  VideoFormat,
  VideoCodec,
  TranscodeInput,
  TranscodeOutput,
  SceneDetectionInput,
  SceneDetectionOutput,
  DetectedScene,
  ThumbnailInput,
  Thumbnail,
  ThumbnailOutput,
  VideoMetadata,
} from "./video-processing";

// Training / Fine-Tuning
export {
  FineTuningClient,
  createFineTuningClient,
  FINE_TUNE_BASE_MODELS,
  FineTuneBaseModelSchema,
  DatasetFormatSchema,
  DatasetSourceSchema,
  LoRAConfigSchema,
  TrainingParamsSchema,
  FineTuneInputSchema,
  FineTuneJobStatusSchema,
  TrainingMetricsSchema,
  CheckpointSchema,
  FineTuneOutputSchema,
  TrainingProgressSchema,
} from "./training";

export type {
  FineTuneBaseModel,
  DatasetFormat,
  DatasetSource,
  LoRAConfig,
  TrainingParams,
  FineTuneInput,
  FineTuneJobStatus,
  TrainingMetrics,
  Checkpoint,
  FineTuneOutput,
  TrainingProgress,
} from "./training";

// ── Environment Helper ──────────────────────────────────────────────

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

// ── Unified GPU Worker Client ───────────────────────────────────────

/**
 * Unified client wrapping all Modal.com GPU worker capabilities:
 * - AI inference (text generation, image generation)
 * - Video processing (transcode, scene detection, thumbnails)
 * - Fine-tuning (LoRA on supported base models)
 *
 * Single constructor, single auth config, three domain clients.
 */
export class GPUWorkerClient {
  readonly inference: GPUInferenceClient;
  readonly video: VideoProcessingClient;
  readonly training: FineTuningClient;

  constructor(env: ModalEnv) {
    this.inference = new GPUInferenceClient(env);
    this.video = new VideoProcessingClient(env);
    this.training = new FineTuningClient(env);
  }

  // ── Convenience Methods ─────────────────────────────────────────

  /**
   * Run text inference. Delegates to the inference client.
   * For streaming, use `streamInference()`.
   */
  async runInference(
    model: InferenceInput["model"],
    prompt: string,
    opts?: {
      systemPrompt?: string;
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      stop?: string[];
    },
  ): Promise<InferenceOutput> {
    return this.inference.runInference({
      model,
      prompt,
      maxTokens: opts?.maxTokens ?? 2048,
      temperature: opts?.temperature ?? 0.7,
      topP: opts?.topP ?? 0.9,
      stream: false,
      systemPrompt: opts?.systemPrompt,
      stop: opts?.stop,
    });
  }

  /**
   * Stream text inference. Delegates to the inference client.
   * Returns an async generator yielding token chunks.
   */
  async *streamInference(
    model: InferenceInput["model"],
    prompt: string,
    opts?: {
      systemPrompt?: string;
      maxTokens?: number;
      temperature?: number;
      topP?: number;
      stop?: string[];
    },
  ): AsyncGenerator<InferenceStreamChunk, void, undefined> {
    yield* this.inference.streamInference({
      model,
      prompt,
      maxTokens: opts?.maxTokens ?? 2048,
      temperature: opts?.temperature ?? 0.7,
      topP: opts?.topP ?? 0.9,
      stream: true,
      systemPrompt: opts?.systemPrompt,
      stop: opts?.stop,
    });
  }

  /**
   * Generate an image using SDXL. Delegates to the inference client.
   */
  async generateImage(
    prompt: string,
    opts?: {
      negativePrompt?: string;
      width?: number;
      height?: number;
      steps?: number;
      guidanceScale?: number;
      seed?: number;
    },
  ): Promise<ImageGenerationOutput> {
    return this.inference.runImageGeneration({
      model: "sdxl-1.0",
      prompt,
      width: opts?.width ?? 1024,
      height: opts?.height ?? 1024,
      steps: opts?.steps ?? 30,
      guidanceScale: opts?.guidanceScale ?? 7.5,
      negativePrompt: opts?.negativePrompt,
      seed: opts?.seed,
    });
  }

  /**
   * Process a video: transcode, detect scenes, or generate thumbnails.
   * Delegates to the video processing client.
   */
  async processVideo(
    url: string,
    instructions: VideoProcessingInstructions,
  ): Promise<VideoProcessingResult> {
    const results: VideoProcessingResult = {
      sourceUrl: url,
    };

    if (instructions.transcode) {
      results.transcode = await this.video.transcode({
        sourceUrl: url,
        ...instructions.transcode,
      });
    }

    if (instructions.detectScenes) {
      const sceneInput: SceneDetectionInput =
        typeof instructions.detectScenes === "boolean"
          ? { sourceUrl: url, threshold: 0.3, maxScenes: 100, generateThumbnails: true, thumbnailWidth: 320 }
          : { sourceUrl: url, ...instructions.detectScenes };
      results.scenes = await this.video.detectScenes(sceneInput);
    }

    if (instructions.thumbnails) {
      results.thumbnails = await this.video.generateThumbnails({
        sourceUrl: url,
        ...instructions.thumbnails,
      });
    }

    if (instructions.metadata) {
      results.metadata = await this.video.getMetadata(url);
    }

    return results;
  }

  /**
   * Start a fine-tuning job. Delegates to the training client.
   * Returns immediately with job ID. Poll or use webhooks for progress.
   */
  async fineTune(
    dataset: FineTuneInput["dataset"],
    baseModel: FineTuneInput["baseModel"],
    params?: {
      jobName?: string;
      lora?: FineTuneInput["lora"];
      training?: FineTuneInput["training"];
      gpu?: FineTuneInput["gpu"];
      gpuCount?: FineTuneInput["gpuCount"];
      webhookUrl?: string;
      tags?: string[];
    },
  ): Promise<FineTuneOutput> {
    return this.training.startFineTune({
      jobName: params?.jobName ?? `ft-${baseModel}-${Date.now()}`,
      baseModel,
      dataset,
      gpu: params?.gpu ?? "A100",
      gpuCount: params?.gpuCount ?? 1,
      lora: params?.lora,
      training: params?.training,
      webhookUrl: params?.webhookUrl,
      tags: params?.tags,
    });
  }

  /**
   * Health check across all GPU worker subsystems.
   */
  async healthCheck(): Promise<HealthCheckOutput> {
    return this.inference.healthCheck();
  }
}

// ── Video Processing Instructions Type ──────────────────────────────

export const VideoProcessingInstructionsSchema = z.object({
  transcode: TranscodeInputSchema.omit({ sourceUrl: true }).optional(),
  detectScenes: z
    .union([
      z.literal(true),
      SceneDetectionInputSchema.omit({ sourceUrl: true }),
    ])
    .optional(),
  thumbnails: ThumbnailInputSchema.omit({ sourceUrl: true }).optional(),
  metadata: z.boolean().optional(),
});

export type VideoProcessingInstructions = z.infer<
  typeof VideoProcessingInstructionsSchema
>;

export interface VideoProcessingResult {
  sourceUrl: string;
  transcode?: TranscodeOutput;
  scenes?: SceneDetectionOutput;
  thumbnails?: ThumbnailOutput;
  metadata?: VideoMetadata;
}

// ── Factory ─────────────────────────────────────────────────────────

/**
 * Creates a unified GPU worker client from environment variables.
 * Reads MODAL_TOKEN_ID, MODAL_TOKEN_SECRET, and optional MODAL_ENDPOINT_URL.
 */
export function createGPUWorkerClient(
  envOverrides?: Partial<ModalEnv>,
): GPUWorkerClient {
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
  return new GPUWorkerClient(env);
}
