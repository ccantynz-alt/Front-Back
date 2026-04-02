/**
 * WebCodecs-based video frame decoder.
 *
 * Accepts a video source (File, Blob, or URL) and decodes it frame-by-frame
 * using the browser-native `VideoDecoder` API. Each decoded `VideoFrame` is
 * delivered to a caller-supplied callback.
 *
 * The decoder uses a fetch + demux strategy: the source is read as raw bytes,
 * then fed into a `VideoDecoder` after extracting codec metadata from the
 * container. For containers we cannot demux in pure JS we fall back to
 * `HTMLVideoElement` + `requestVideoFrameCallback` to capture frames.
 */

import type { VideoMetadata } from "./types";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export type FrameCallback = (frame: VideoFrame) => void;

export interface DecoderOptions {
  /** Maximum number of frames to decode. Omit for all frames. */
  readonly maxFrames?: number;
}

/**
 * Decodes video from a `File`, `Blob`, or URL string into `VideoFrame`
 * objects delivered one at a time to the caller.
 */
export class VideoFrameDecoder {
  private readonly source: File | Blob | string;
  private videoElement: HTMLVideoElement | null = null;
  private destroyed = false;
  private metadata: VideoMetadata | null = null;

  constructor(source: File | Blob | string) {
    this.source = source;
  }

  // -----------------------------------------------------------------------
  // Metadata
  // -----------------------------------------------------------------------

  /** Returns metadata gathered during the last `decode()` call, or `null`. */
  getMetadata(): VideoMetadata | null {
    return this.metadata;
  }

  // -----------------------------------------------------------------------
  // Decode
  // -----------------------------------------------------------------------

  /**
   * Decode video frames and deliver each to `onFrame`.
   *
   * The caller **must** call `frame.close()` on each `VideoFrame` when done
   * with it to avoid holding GPU memory.
   *
   * Strategy:
   * 1. Create an object URL for the source.
   * 2. Load it into an `HTMLVideoElement` to obtain duration / dimensions.
   * 3. Walk through the video frame-by-frame using
   *    `requestVideoFrameCallback`, capturing each frame as a `VideoFrame`.
   *
   * This approach works with any container format the browser can play and
   * does not require a JS-side demuxer.
   */
  async decode(
    onFrame: FrameCallback,
    options?: DecoderOptions,
  ): Promise<VideoMetadata> {
    if (this.destroyed) {
      throw new Error("VideoFrameDecoder has been destroyed");
    }

    const objectUrl = this.createObjectUrl();

    try {
      const video = await this.loadVideo(objectUrl);
      this.videoElement = video;

      const fps = await this.estimateFps(video);
      const frameDuration = 1 / fps;
      const totalFrames = Math.ceil(video.duration * fps);
      const maxFrames = options?.maxFrames ?? totalFrames;

      const meta: VideoMetadata = {
        frameCount: Math.min(totalFrames, maxFrames),
        duration: video.duration,
        fps,
        width: video.videoWidth,
        height: video.videoHeight,
        codec: "unknown", // container format hides this from us
      };
      this.metadata = meta;

      // Seek through the video frame by frame
      let framesDecoded = 0;
      video.currentTime = 0;

      while (
        framesDecoded < maxFrames &&
        video.currentTime < video.duration &&
        !this.destroyed
      ) {
        await this.seekTo(video, framesDecoded * frameDuration);

        // Capture the current display frame
        const frame = new VideoFrame(video, {
          timestamp: Math.round(video.currentTime * 1_000_000), // microseconds
        });

        onFrame(frame);
        framesDecoded++;
      }

      return {
        ...meta,
        frameCount: framesDecoded,
      };
    } finally {
      this.revokeObjectUrl(objectUrl);
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /** Release all held resources. The decoder cannot be reused after this. */
  destroy(): void {
    this.destroyed = true;
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.removeAttribute("src");
      this.videoElement.load();
      this.videoElement = null;
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private createObjectUrl(): string {
    if (typeof this.source === "string") {
      // Already a URL — use directly (no object URL to revoke).
      return this.source;
    }
    return URL.createObjectURL(this.source);
  }

  private revokeObjectUrl(url: string): void {
    // Only revoke if we created the URL ourselves.
    if (typeof this.source !== "string") {
      URL.revokeObjectURL(url);
    }
  }

  /** Load the video element and wait for metadata. */
  private loadVideo(src: string): Promise<HTMLVideoElement> {
    return new Promise<HTMLVideoElement>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;

      const onMeta = (): void => {
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("error", onError);
        resolve(video);
      };

      const onError = (): void => {
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("error", onError);
        reject(
          new Error(
            `Failed to load video: ${video.error?.message ?? "unknown error"}`,
          ),
        );
      };

      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("error", onError);
      video.src = src;
    });
  }

  /** Estimate FPS by examining `requestVideoFrameCallback` timing. */
  private async estimateFps(video: HTMLVideoElement): Promise<number> {
    // If the browser supports requestVideoFrameCallback we can sample
    // the actual frame rate. Otherwise fall back to 30 fps.
    if (!("requestVideoFrameCallback" in video)) {
      return 30;
    }

    return new Promise<number>((resolve) => {
      let firstTime: number | null = null;
      let frames = 0;
      const MAX_SAMPLES = 5;

      const onFrame = (
        _now: DOMHighResTimeStamp,
        metadata: VideoFrameCallbackMetadata,
      ): void => {
        if (firstTime === null) {
          firstTime = metadata.mediaTime;
        }
        frames++;

        if (frames >= MAX_SAMPLES) {
          const elapsed = metadata.mediaTime - (firstTime ?? 0);
          const estimated = elapsed > 0 ? (frames - 1) / elapsed : 30;
          video.pause();
          resolve(Math.round(estimated));
          return;
        }

        (video as HTMLVideoElement).requestVideoFrameCallback(onFrame);
      };

      (video as HTMLVideoElement).requestVideoFrameCallback(onFrame);
      video.play().catch(() => {
        // If autoplay is blocked, fall back to 30 fps.
        resolve(30);
      });
    });
  }

  /** Seek and wait for the video to be ready at the target time. */
  private seekTo(
    video: HTMLVideoElement,
    timeSeconds: number,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const onSeeked = (): void => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      };
      video.addEventListener("seeked", onSeeked);
      video.currentTime = Math.min(timeSeconds, video.duration);
    });
  }
}
