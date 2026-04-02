/**
 * TypeScript types for the WebCodecs video processing pipeline.
 *
 * All interfaces are framework-agnostic. The pipeline runs purely on
 * browser APIs (WebCodecs, OffscreenCanvas, VideoFrame) so it can be
 * consumed from SolidJS components, Web Workers, or plain scripts.
 */

// ---------------------------------------------------------------------------
// Codec configuration
// ---------------------------------------------------------------------------

/** Identifies a video codec by its WebCodecs codec string. */
export type VideoCodecId = "avc1.42001E" | "vp09.00.10.08" | "av01.0.01M.08";

/** Human-readable codec name. */
export type VideoCodecName = "h264" | "vp9" | "av1";

/** Maps a human-readable name to its WebCodecs codec string. */
export const CODEC_STRINGS: Record<VideoCodecName, VideoCodecId> = {
  h264: "avc1.42001E",
  vp9: "vp09.00.10.08",
  av1: "av01.0.01M.08",
} as const;

/** Result of probing a single codec for support. */
export interface CodecSupportResult {
  readonly codec: VideoCodecName;
  readonly codecString: VideoCodecId;
  readonly supported: boolean;
  readonly hardwareAccelerated: boolean;
}

/** Aggregated results from `getSupportedCodecs`. */
export interface SupportedCodecsReport {
  readonly results: readonly CodecSupportResult[];
  readonly bestCodec: VideoCodecName | null;
}

// ---------------------------------------------------------------------------
// Encoder configuration
// ---------------------------------------------------------------------------

export interface EncoderConfig {
  readonly codec: VideoCodecName;
  readonly width: number;
  readonly height: number;
  readonly bitrate: number;
  readonly framerate: number;
  /** @default "prefer-hardware" */
  readonly hardwareAcceleration?: HardwarePreference;
  /** Latency mode — "quality" favours bitrate efficiency, "realtime" favours speed. */
  readonly latencyMode?: "quality" | "realtime";
}

export type HardwarePreference =
  | "no-preference"
  | "prefer-hardware"
  | "prefer-software";

// ---------------------------------------------------------------------------
// Decoder metadata
// ---------------------------------------------------------------------------

export interface VideoMetadata {
  readonly frameCount: number;
  readonly duration: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
  readonly codec: string;
}

// ---------------------------------------------------------------------------
// Video effects
// ---------------------------------------------------------------------------

/** Discriminated union for built-in video effects. */
export type VideoEffect =
  | BrightnessEffect
  | ContrastEffect
  | GrayscaleEffect
  | BlurEffect
  | CustomEffect;

export interface BrightnessEffect {
  readonly type: "brightness";
  /** Multiplier. 1.0 = no change. */
  readonly value: number;
}

export interface ContrastEffect {
  readonly type: "contrast";
  /** Multiplier. 1.0 = no change. */
  readonly value: number;
}

export interface GrayscaleEffect {
  readonly type: "grayscale";
}

export interface BlurEffect {
  readonly type: "blur";
  /** Blur radius in pixels. */
  readonly radius: number;
}

export interface CustomEffect {
  readonly type: "custom";
  /** A user-supplied function applied to the canvas context. */
  readonly apply: (
    ctx: OffscreenCanvasRenderingContext2D,
    width: number,
    height: number,
  ) => void;
}

// ---------------------------------------------------------------------------
// Processing options
// ---------------------------------------------------------------------------

export interface TranscodeOptions {
  readonly outputCodec: VideoCodecName;
  readonly width?: number;
  readonly height?: number;
  readonly bitrate?: number;
  readonly framerate?: number;
  readonly effects?: readonly VideoEffect[];
  readonly hardwareAcceleration?: HardwarePreference;
  readonly latencyMode?: "quality" | "realtime";
}

export interface ProgressInfo {
  readonly framesProcessed: number;
  readonly totalFrames: number;
  /** 0..1 */
  readonly progress: number;
  readonly currentTimestamp: number;
}

export type ProgressCallback = (info: ProgressInfo) => void;

// ---------------------------------------------------------------------------
// WebCodecs feature detection
// ---------------------------------------------------------------------------

export interface WebCodecsSupport {
  readonly videoEncoder: boolean;
  readonly videoDecoder: boolean;
  readonly audioEncoder: boolean;
  readonly audioDecoder: boolean;
  readonly allSupported: boolean;
}
