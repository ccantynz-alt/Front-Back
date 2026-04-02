/**
 * Video frame processor — applies effect chains to individual frames and
 * orchestrates full decode -> process -> encode transcoding pipelines.
 *
 * Effects are applied via an `OffscreenCanvas` so the work stays off the
 * main thread when called from a Web Worker.
 */

import { VideoFrameDecoder } from "./decoder";
import { VideoFrameEncoder } from "./encoder";
import type {
  EncoderConfig,
  ProgressCallback,
  ProgressInfo,
  TranscodeOptions,
  VideoEffect,
} from "./types";

// ---------------------------------------------------------------------------
// Effect application
// ---------------------------------------------------------------------------

/**
 * Build a CSS `filter` string from an array of built-in effects.
 * Custom effects are handled separately after the filter pass.
 */
function buildFilterString(effects: readonly VideoEffect[]): string {
  const parts: string[] = [];

  for (const fx of effects) {
    switch (fx.type) {
      case "brightness":
        parts.push(`brightness(${fx.value})`);
        break;
      case "contrast":
        parts.push(`contrast(${fx.value})`);
        break;
      case "grayscale":
        parts.push("grayscale(1)");
        break;
      case "blur":
        parts.push(`blur(${fx.radius}px)`);
        break;
      case "custom":
        // Handled after the filter pass.
        break;
    }
  }

  return parts.join(" ");
}

/**
 * Apply the effect chain to a single `VideoFrame` and return a new
 * `VideoFrame` with the results.
 *
 * The **input** frame is **not** closed — the caller retains ownership.
 */
function applyEffects(
  frame: VideoFrame,
  effects: readonly VideoEffect[],
  canvas: OffscreenCanvas,
  ctx: OffscreenCanvasRenderingContext2D,
): VideoFrame {
  const width = frame.displayWidth;
  const height = frame.displayHeight;

  canvas.width = width;
  canvas.height = height;

  // 1. Apply CSS-filter-mapped effects.
  const filterStr = buildFilterString(effects);
  ctx.filter = filterStr || "none";
  ctx.drawImage(frame, 0, 0, width, height);

  // 2. Apply custom effects (these operate on the already-drawn pixels).
  ctx.filter = "none";
  for (const fx of effects) {
    if (fx.type === "custom") {
      fx.apply(ctx, width, height);
    }
  }

  // 3. Capture the canvas as a new VideoFrame.
  return new VideoFrame(canvas, {
    timestamp: frame.timestamp ?? 0,
  });
}

// ---------------------------------------------------------------------------
// VideoProcessor
// ---------------------------------------------------------------------------

export class VideoProcessor {
  private readonly effects: VideoEffect[] = [];

  // -----------------------------------------------------------------------
  // Effect chain management
  // -----------------------------------------------------------------------

  /** Append an effect to the processing chain. */
  addEffect(effect: VideoEffect): void {
    this.effects.push(effect);
  }

  /** Remove all effects. */
  clearEffects(): void {
    this.effects.length = 0;
  }

  /** Return a shallow copy of the current effect chain. */
  getEffects(): readonly VideoEffect[] {
    return [...this.effects];
  }

  // -----------------------------------------------------------------------
  // Single-frame processing
  // -----------------------------------------------------------------------

  /**
   * Process a single frame through the current effect chain.
   *
   * Returns a **new** `VideoFrame`. The caller is responsible for closing
   * both the input and the output frame.
   */
  processFrame(frame: VideoFrame): VideoFrame {
    if (this.effects.length === 0) {
      // No effects — clone the frame so ownership semantics are consistent.
      return new VideoFrame(frame, { timestamp: frame.timestamp ?? 0 });
    }

    const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to create OffscreenCanvas 2d context");
    }

    return applyEffects(frame, this.effects, canvas, ctx);
  }

  // -----------------------------------------------------------------------
  // Full transcode pipeline
  // -----------------------------------------------------------------------

  /**
   * Decode → process → encode a video file.
   *
   * Returns a `Blob` containing the transcoded output. Accepts an optional
   * `onProgress` callback that fires after every processed frame.
   */
  async transcode(
    input: File,
    options: TranscodeOptions,
    onProgress?: ProgressCallback,
  ): Promise<Blob> {
    const {
      outputCodec,
      effects: extraEffects,
      hardwareAcceleration,
      latencyMode,
    } = options;

    // Merge one-off effects with the persistent chain.
    const allEffects: readonly VideoEffect[] = extraEffects
      ? [...this.effects, ...extraEffects]
      : this.effects;

    // --- Decode pass (to determine metadata) ---
    const decoder = new VideoFrameDecoder(input);
    const frames: VideoFrame[] = [];

    const meta = await decoder.decode((frame) => {
      frames.push(frame);
    });

    const width = options.width ?? meta.width;
    const height = options.height ?? meta.height;
    const framerate = options.framerate ?? meta.fps;
    const bitrate = options.bitrate ?? 5_000_000;

    // --- Encoder setup ---
    const encoderConfig: EncoderConfig = {
      codec: outputCodec,
      width,
      height,
      bitrate,
      framerate,
      hardwareAcceleration: hardwareAcceleration ?? "prefer-hardware",
      latencyMode: latencyMode ?? "quality",
    };

    const encoder = new VideoFrameEncoder(encoderConfig);
    await encoder.init();

    // --- Process + encode each frame ---
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to create OffscreenCanvas 2d context");
    }

    const totalFrames = frames.length;

    for (let i = 0; i < totalFrames; i++) {
      const srcFrame = frames[i];
      if (!srcFrame) continue;

      let processed: VideoFrame;
      if (allEffects.length > 0) {
        processed = applyEffects(srcFrame, allEffects, canvas, ctx);
        srcFrame.close();
      } else {
        processed = srcFrame;
      }

      encoder.encode(processed);
      // encode() closes the frame.

      if (onProgress) {
        const info: ProgressInfo = {
          framesProcessed: i + 1,
          totalFrames,
          progress: (i + 1) / totalFrames,
          currentTimestamp: (processed.timestamp ?? 0) / 1_000_000,
        };
        onProgress(info);
      }
    }

    // --- Finalize ---
    const blob = await encoder.toBlob();

    encoder.destroy();
    decoder.destroy();

    return blob;
  }
}
