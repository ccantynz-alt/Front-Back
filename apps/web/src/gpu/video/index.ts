/**
 * WebCodecs video processing pipeline.
 *
 * Barrel export for all public APIs:
 *
 * - **codec-support** — feature detection and codec capability queries
 * - **decoder** — `VideoFrameDecoder` for frame-by-frame video decoding
 * - **encoder** — `VideoFrameEncoder` for encoding frames to chunks / Blob
 * - **processor** — `VideoProcessor` for effect chains and transcoding
 * - **types** — all TypeScript interfaces and constants
 */

// Feature detection & codec queries
export {
  isWebCodecsSupported,
  getSupportedCodecs,
  getBestCodec,
} from "./codec-support";

// Decoder
export { VideoFrameDecoder } from "./decoder";
export type { FrameCallback, DecoderOptions } from "./decoder";

// Encoder
export { VideoFrameEncoder } from "./encoder";

// Processor
export { VideoProcessor } from "./processor";

// Types & constants
export {
  CODEC_STRINGS,
  type VideoCodecId,
  type VideoCodecName,
  type CodecSupportResult,
  type SupportedCodecsReport,
  type EncoderConfig,
  type HardwarePreference,
  type VideoMetadata,
  type VideoEffect,
  type BrightnessEffect,
  type ContrastEffect,
  type GrayscaleEffect,
  type BlurEffect,
  type CustomEffect,
  type TranscodeOptions,
  type ProgressInfo,
  type ProgressCallback,
  type WebCodecsSupport,
} from "./types";
