// ── Video Pipeline — Core Types ─────────────────────────────────────────
// Shared types between BROWSER (WebGPU) and SERVER (Hono + ffmpeg) tiers.
// Crontech does WebGPU client-side encoding/transforms before falling back
// to server-side ffmpeg — Vercel/Cloudflare can't do that.

/** Containers / codecs we negotiate over. */
export const VIDEO_CODECS = ["h264", "h265", "vp9", "av1"] as const;
export type VideoCodec = (typeof VIDEO_CODECS)[number];

export const AUDIO_CODECS = ["aac", "opus", "mp3"] as const;
export type AudioCodec = (typeof AUDIO_CODECS)[number];

export const CONTAINERS = ["mp4", "webm", "mov"] as const;
export type Container = (typeof CONTAINERS)[number];

/** Job lifecycle — strict state machine. */
export const JOB_STATES = [
  "queued",
  "running",
  "uploading",
  "done",
  "failed",
] as const;
export type JobState = (typeof JOB_STATES)[number];

/** Browser-side error codes — surfaced when the browser can't process. */
export type BrowserFallbackReason =
  | "no_webcodecs"
  | "no_webgpu"
  | "unsupported_codec"
  | "unsupported_container"
  | "resolution_too_large"
  | "shader_compile_failed";

/** Maximum supported resolution: 4K (3840x2160). */
export const MAX_WIDTH = 3840;
export const MAX_HEIGHT = 2160;

/** Encoder target spec — browser & server both consume this. */
export interface TargetSpec {
  readonly container: Container;
  readonly videoCodec: VideoCodec;
  readonly audioCodec: AudioCodec;
  readonly width: number;
  readonly height: number;
  /** Bitrate in bits/sec. If omitted, callers compute from resolution+fps. */
  readonly bitrate?: number;
  readonly fps?: number;
}

/** Source descriptor — either an in-memory blob (browser) or URL (server). */
export type SourceRef =
  | { readonly kind: "blob"; readonly blob: Blob }
  | { readonly kind: "url"; readonly url: string };

/** Progress event emitted from both browser & server transcoders. */
export interface ProgressEvent {
  readonly state: JobState;
  /** 0..1 fraction. */
  readonly progress: number;
  /** Optional human-readable status. */
  readonly message?: string;
}

/** Server-side job record. */
export interface JobRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly state: JobState;
  readonly source: SourceRef;
  readonly target: TargetSpec;
  readonly progress: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly resultUrl?: string;
  readonly error?: string;
}

/** Codec negotiation result. */
export interface CodecNegotiation {
  readonly accepted: true;
  readonly target: TargetSpec;
}

export interface CodecNegotiationFailure {
  readonly accepted: false;
  readonly reason: string;
}

export type CodecNegotiationResult =
  | CodecNegotiation
  | CodecNegotiationFailure;
