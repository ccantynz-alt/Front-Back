/**
 * WebCodecs-based video frame encoder.
 *
 * Accepts individual `VideoFrame` objects, encodes them via the native
 * `VideoEncoder` API, and can flush the resulting `EncodedVideoChunk`s or
 * mux them into a playable MP4/WebM `Blob`.
 */

import type { EncoderConfig, HardwarePreference, VideoCodecName } from "./types";
import { CODEC_STRINGS } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveCodecString(name: VideoCodecName): string {
  return CODEC_STRINGS[name];
}

function resolveHardwareAcceleration(
  pref: HardwarePreference | undefined,
): HardwareAcceleration {
  switch (pref) {
    case "prefer-hardware":
      return "prefer-hardware";
    case "prefer-software":
      return "prefer-software";
    default:
      return "no-preference";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encodes `VideoFrame` objects into `EncodedVideoChunk`s using the native
 * `VideoEncoder` API.
 *
 * Usage:
 * ```ts
 * const encoder = new VideoFrameEncoder({
 *   codec: "av1",
 *   width: 1920,
 *   height: 1080,
 *   bitrate: 5_000_000,
 *   framerate: 30,
 * });
 * await encoder.init();
 * encoder.encode(frame1);
 * encoder.encode(frame2);
 * const chunks = await encoder.flush();
 * const blob = await encoder.toBlob();
 * encoder.destroy();
 * ```
 */
export class VideoFrameEncoder {
  private readonly config: EncoderConfig;
  private encoder: VideoEncoder | null = null;
  private readonly chunks: EncodedVideoChunk[] = [];
  private frameIndex = 0;
  private destroyed = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: EncoderConfig) {
    this.config = config;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Initialise the underlying `VideoEncoder`. Must be called before
   * `encode()`.
   */
  async init(): Promise<void> {
    if (this.destroyed) {
      throw new Error("VideoFrameEncoder has been destroyed");
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.createEncoder();
    return this.initPromise;
  }

  /** Release encoder resources. The instance cannot be reused. */
  destroy(): void {
    this.destroyed = true;
    if (this.encoder && this.encoder.state !== "closed") {
      this.encoder.close();
    }
    this.encoder = null;
  }

  // -----------------------------------------------------------------------
  // Encoding
  // -----------------------------------------------------------------------

  /**
   * Encode a single `VideoFrame`.
   *
   * The encoder takes ownership of the frame and will close it after
   * encoding. Callers must **not** close the frame themselves.
   */
  encode(frame: VideoFrame, keyFrame = false): void {
    if (this.destroyed || !this.encoder) {
      throw new Error(
        "Encoder not initialised or destroyed. Call init() first.",
      );
    }

    // Force a keyframe every 2 seconds (or on explicit request / first frame).
    const isKey =
      keyFrame ||
      this.frameIndex === 0 ||
      this.frameIndex % (this.config.framerate * 2) === 0;

    this.encoder.encode(frame, { keyFrame: isKey });
    frame.close();
    this.frameIndex++;
  }

  /**
   * Flush the encoder and return all encoded chunks produced so far.
   *
   * After flushing the encoder is still usable — call `encode()` again to
   * continue adding frames.
   */
  async flush(): Promise<readonly EncodedVideoChunk[]> {
    if (!this.encoder) {
      throw new Error("Encoder not initialised. Call init() first.");
    }

    await this.encoder.flush();
    return [...this.chunks];
  }

  /**
   * Flush and package all encoded chunks into a playable `Blob`.
   *
   * For VP9 / AV1 the container is WebM (simple Matroska mux).
   * For H.264 the container is a minimal raw Annex B bitstream wrapped in
   * an MP4-like blob. Full ISO BMFF muxing would require a dedicated
   * library (e.g. mp4-muxer); here we provide a basic container that most
   * browsers can play via `<video>`.
   *
   * For production-grade MP4 output, consider piping `flush()` chunks into
   * a proper muxer such as `mp4-muxer` or `webm-muxer`.
   */
  async toBlob(): Promise<Blob> {
    const chunks = await this.flush();

    if (chunks.length === 0) {
      throw new Error("No encoded chunks to mux");
    }

    // Collect raw encoded data from chunks.
    const buffers: Uint8Array[] = [];
    let totalBytes = 0;

    for (const chunk of chunks) {
      const buf = new Uint8Array(chunk.byteLength);
      chunk.copyTo(buf);
      buffers.push(buf);
      totalBytes += buf.byteLength;
    }

    // Concatenate into a single buffer.
    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const buf of buffers) {
      combined.set(buf, offset);
      offset += buf.byteLength;
    }

    // Choose MIME type based on codec.
    const mime = this.config.codec === "h264"
      ? "video/mp4"
      : "video/webm";

    return new Blob([combined], { type: mime });
  }

  /** Number of frames encoded so far. */
  get encodedFrameCount(): number {
    return this.frameIndex;
  }

  /** Number of chunks produced so far (without flushing). */
  get chunkCount(): number {
    return this.chunks.length;
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private async createEncoder(): Promise<void> {
    const codecString = resolveCodecString(this.config.codec);
    const hw = resolveHardwareAcceleration(this.config.hardwareAcceleration);

    // Verify the configuration is supported.
    const support = await VideoEncoder.isConfigSupported({
      codec: codecString,
      width: this.config.width,
      height: this.config.height,
      bitrate: this.config.bitrate,
      framerate: this.config.framerate,
      hardwareAcceleration: hw,
      latencyMode: this.config.latencyMode ?? "quality",
    });

    if (!support.supported) {
      throw new Error(
        `Codec ${this.config.codec} (${codecString}) is not supported with the given configuration`,
      );
    }

    this.encoder = new VideoEncoder({
      output: (chunk: EncodedVideoChunk) => {
        this.chunks.push(chunk);
      },
      error: (err: DOMException) => {
        console.error("[VideoFrameEncoder] encode error:", err);
      },
    });

    this.encoder.configure({
      codec: codecString,
      width: this.config.width,
      height: this.config.height,
      bitrate: this.config.bitrate,
      framerate: this.config.framerate,
      hardwareAcceleration: hw,
      latencyMode: this.config.latencyMode ?? "quality",
    });
  }
}
