// ── Modal.com GPU Video Processing Worker ──────────────────────────
// Server-side video processing on A100/H100 GPUs via Modal.com.
// Transcoding, AI scene detection, thumbnail generation.
// Returns processed video URLs + rich metadata.

import { z } from "zod";
import { type ModalEnv, ModalEnvSchema, GPUWorkerError, type InferenceError } from "./inference";

// ── Video Format Definitions ────────────────────────────────────────

export const VIDEO_FORMATS = [
  "mp4",
  "webm",
  "mov",
  "avi",
  "mkv",
  "hevc",
  "prores",
] as const;

export type VideoFormat = (typeof VIDEO_FORMATS)[number];

export const VideoFormatSchema = z.enum(VIDEO_FORMATS);

export const VIDEO_CODECS = [
  "h264",
  "h265",
  "vp9",
  "av1",
  "prores",
] as const;

export type VideoCodec = (typeof VIDEO_CODECS)[number];

export const VideoCodecSchema = z.enum(VIDEO_CODECS);

// ── Transcoding Schemas ─────────────────────────────────────────────

export const TranscodeInputSchema = z.object({
  sourceUrl: z.string().url(),
  outputFormat: VideoFormatSchema,
  codec: VideoCodecSchema.optional(),
  resolution: z
    .object({
      width: z.number().int().min(128).max(7680),
      height: z.number().int().min(128).max(4320),
    })
    .optional(),
  bitrate: z.number().int().min(100_000).max(500_000_000).optional(),
  fps: z.number().min(1).max(240).optional(),
  audioBitrate: z.number().int().min(32_000).max(512_000).optional(),
  trim: z
    .object({
      startMs: z.number().int().nonnegative(),
      endMs: z.number().int().positive(),
    })
    .optional(),
  webhookUrl: z.string().url().optional(),
});

export type TranscodeInput = z.infer<typeof TranscodeInputSchema>;

export const TranscodeOutputSchema = z.object({
  id: z.string(),
  status: z.enum(["completed", "failed"]),
  outputUrl: z.string().url(),
  format: VideoFormatSchema,
  codec: VideoCodecSchema,
  durationMs: z.number().int().nonnegative(),
  fileSizeBytes: z.number().int().nonnegative(),
  resolution: z.object({
    width: z.number().int(),
    height: z.number().int(),
  }),
  processingTimeMs: z.number().nonnegative(),
});

export type TranscodeOutput = z.infer<typeof TranscodeOutputSchema>;

// ── Scene Detection Schemas ─────────────────────────────────────────

export const SceneDetectionInputSchema = z.object({
  sourceUrl: z.string().url(),
  /** Sensitivity threshold 0-1. Lower = more scenes detected. */
  threshold: z.number().min(0).max(1).default(0.3),
  /** Max number of scenes to detect */
  maxScenes: z.number().int().min(1).max(1000).default(100),
  /** Generate a thumbnail for each scene */
  generateThumbnails: z.boolean().default(true),
  /** Thumbnail dimensions */
  thumbnailWidth: z.number().int().min(64).max(1920).default(320),
  webhookUrl: z.string().url().optional(),
});

export type SceneDetectionInput = z.infer<typeof SceneDetectionInputSchema>;

export const DetectedSceneSchema = z.object({
  index: z.number().int().nonnegative(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  thumbnailUrl: z.string().url().optional(),
  /** AI-generated description of the scene content */
  description: z.string().optional(),
  /** Confidence score for the scene boundary detection */
  confidence: z.number().min(0).max(1),
});

export type DetectedScene = z.infer<typeof DetectedSceneSchema>;

export const SceneDetectionOutputSchema = z.object({
  id: z.string(),
  status: z.enum(["completed", "failed"]),
  sourceUrl: z.string().url(),
  scenes: z.array(DetectedSceneSchema),
  totalScenes: z.number().int().nonnegative(),
  videoDurationMs: z.number().int().nonnegative(),
  processingTimeMs: z.number().nonnegative(),
});

export type SceneDetectionOutput = z.infer<typeof SceneDetectionOutputSchema>;

// ── Thumbnail Generation Schemas ────────────────────────────────────

export const ThumbnailInputSchema = z.object({
  sourceUrl: z.string().url(),
  /** Timestamps in milliseconds to capture thumbnails at */
  timestamps: z.array(z.number().int().nonnegative()).min(1).max(100),
  width: z.number().int().min(64).max(3840).default(640),
  height: z.number().int().min(64).max(2160).optional(),
  format: z.enum(["jpg", "png", "webp"]).default("webp"),
  quality: z.number().int().min(1).max(100).default(85),
  webhookUrl: z.string().url().optional(),
});

export type ThumbnailInput = z.infer<typeof ThumbnailInputSchema>;

export const ThumbnailSchema = z.object({
  timestampMs: z.number().int().nonnegative(),
  url: z.string().url(),
  width: z.number().int(),
  height: z.number().int(),
  fileSizeBytes: z.number().int().nonnegative(),
});

export type Thumbnail = z.infer<typeof ThumbnailSchema>;

export const ThumbnailOutputSchema = z.object({
  id: z.string(),
  status: z.enum(["completed", "failed"]),
  thumbnails: z.array(ThumbnailSchema),
  processingTimeMs: z.number().nonnegative(),
});

export type ThumbnailOutput = z.infer<typeof ThumbnailOutputSchema>;

// ── Video Metadata Schema ───────────────────────────────────────────

export const VideoMetadataSchema = z.object({
  durationMs: z.number().int().nonnegative(),
  width: z.number().int(),
  height: z.number().int(),
  codec: z.string(),
  fps: z.number(),
  bitrate: z.number().int(),
  fileSizeBytes: z.number().int().nonnegative(),
  hasAudio: z.boolean(),
  audioCodec: z.string().optional(),
  audioBitrate: z.number().int().optional(),
  audioSampleRate: z.number().int().optional(),
});

export type VideoMetadata = z.infer<typeof VideoMetadataSchema>;

// ── Video Processing Client ─────────────────────────────────────────

export class VideoProcessingClient {
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
   * Transcode a video to a different format/codec/resolution.
   * Runs on GPU-accelerated NVENC for hardware encoding when available.
   */
  async transcode(input: TranscodeInput): Promise<TranscodeOutput> {
    const validated = TranscodeInputSchema.parse(input);
    const startMs = performance.now();

    const response = await this.makeRequest("/v1/video/transcode", {
      source_url: validated.sourceUrl,
      output_format: validated.outputFormat,
      codec: validated.codec,
      resolution: validated.resolution
        ? { width: validated.resolution.width, height: validated.resolution.height }
        : undefined,
      bitrate: validated.bitrate,
      fps: validated.fps,
      audio_bitrate: validated.audioBitrate,
      trim: validated.trim
        ? { start_ms: validated.trim.startMs, end_ms: validated.trim.endMs }
        : undefined,
      webhook_url: validated.webhookUrl,
    });

    const processingTimeMs = performance.now() - startMs;

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }

    const body = (await response.json()) as {
      id: string;
      output_url: string;
      format: string;
      codec: string;
      duration_ms: number;
      file_size_bytes: number;
      resolution: { width: number; height: number };
    };

    return TranscodeOutputSchema.parse({
      id: body.id,
      status: "completed",
      outputUrl: body.output_url,
      format: body.format,
      codec: body.codec,
      durationMs: body.duration_ms,
      fileSizeBytes: body.file_size_bytes,
      resolution: body.resolution,
      processingTimeMs,
    });
  }

  /**
   * AI-powered scene detection. Uses GPU-accelerated frame analysis
   * to identify scene boundaries and optionally generate thumbnails.
   */
  async detectScenes(input: SceneDetectionInput): Promise<SceneDetectionOutput> {
    const validated = SceneDetectionInputSchema.parse(input);
    const startMs = performance.now();

    const response = await this.makeRequest("/v1/video/scenes", {
      source_url: validated.sourceUrl,
      threshold: validated.threshold,
      max_scenes: validated.maxScenes,
      generate_thumbnails: validated.generateThumbnails,
      thumbnail_width: validated.thumbnailWidth,
      webhook_url: validated.webhookUrl,
    });

    const processingTimeMs = performance.now() - startMs;

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }

    const body = (await response.json()) as {
      id: string;
      source_url: string;
      scenes: Array<{
        index: number;
        start_ms: number;
        end_ms: number;
        duration_ms: number;
        thumbnail_url?: string;
        description?: string;
        confidence: number;
      }>;
      total_scenes: number;
      video_duration_ms: number;
    };

    return SceneDetectionOutputSchema.parse({
      id: body.id,
      status: "completed",
      sourceUrl: body.source_url,
      scenes: body.scenes.map((s) => ({
        index: s.index,
        startMs: s.start_ms,
        endMs: s.end_ms,
        durationMs: s.duration_ms,
        thumbnailUrl: s.thumbnail_url,
        description: s.description,
        confidence: s.confidence,
      })),
      totalScenes: body.total_scenes,
      videoDurationMs: body.video_duration_ms,
      processingTimeMs,
    });
  }

  /**
   * Generate thumbnails from a video at specified timestamps.
   * GPU-accelerated decoding for fast frame extraction.
   */
  async generateThumbnails(input: ThumbnailInput): Promise<ThumbnailOutput> {
    const validated = ThumbnailInputSchema.parse(input);
    const startMs = performance.now();

    const response = await this.makeRequest("/v1/video/thumbnails", {
      source_url: validated.sourceUrl,
      timestamps: validated.timestamps,
      width: validated.width,
      height: validated.height,
      format: validated.format,
      quality: validated.quality,
      webhook_url: validated.webhookUrl,
    });

    const processingTimeMs = performance.now() - startMs;

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }

    const body = (await response.json()) as {
      id: string;
      thumbnails: Array<{
        timestamp_ms: number;
        url: string;
        width: number;
        height: number;
        file_size_bytes: number;
      }>;
    };

    return ThumbnailOutputSchema.parse({
      id: body.id,
      status: "completed",
      thumbnails: body.thumbnails.map((t) => ({
        timestampMs: t.timestamp_ms,
        url: t.url,
        width: t.width,
        height: t.height,
        fileSizeBytes: t.file_size_bytes,
      })),
      processingTimeMs,
    });
  }

  /**
   * Retrieve metadata for a video file without processing it.
   * Fast probe using GPU-accelerated decoding.
   */
  async getMetadata(sourceUrl: string): Promise<VideoMetadata> {
    const url = z.string().url().parse(sourceUrl);

    const response = await this.makeRequest("/v1/video/metadata", {
      source_url: url,
    });

    if (!response.ok) {
      throw await this.handleErrorResponse(response);
    }

    const body = (await response.json()) as {
      duration_ms: number;
      width: number;
      height: number;
      codec: string;
      fps: number;
      bitrate: number;
      file_size_bytes: number;
      has_audio: boolean;
      audio_codec?: string;
      audio_bitrate?: number;
      audio_sample_rate?: number;
    };

    return VideoMetadataSchema.parse({
      durationMs: body.duration_ms,
      width: body.width,
      height: body.height,
      codec: body.codec,
      fps: body.fps,
      bitrate: body.bitrate,
      fileSizeBytes: body.file_size_bytes,
      hasAudio: body.has_audio,
      audioCodec: body.audio_codec,
      audioBitrate: body.audio_bitrate,
      audioSampleRate: body.audio_sample_rate,
    });
  }

  // ── Private Helpers ────────────────────────────────────────────────

  private async makeRequest(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    return fetch(url, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });
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
 * Creates a video processing client from environment variables.
 * Reads MODAL_TOKEN_ID, MODAL_TOKEN_SECRET, and optional MODAL_ENDPOINT_URL.
 */
export function createVideoProcessingClient(
  envOverrides?: Partial<ModalEnv>,
): VideoProcessingClient {
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
  return new VideoProcessingClient(env);
}
