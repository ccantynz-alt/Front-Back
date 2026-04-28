// ── Resolution Clamping & Bitrate Calculation ───────────────────────────
// Pure functions — no IO.

import { MAX_HEIGHT, MAX_WIDTH, type VideoCodec } from "./types";

export interface Resolution {
  readonly width: number;
  readonly height: number;
}

/**
 * Clamp a requested resolution to the allowed maximum (4K) while
 * preserving aspect ratio. Always returns even dimensions — most
 * encoders reject odd width/height.
 */
export function clampResolution(req: Resolution): Resolution {
  if (req.width <= 0 || req.height <= 0) {
    throw new Error(
      `Invalid resolution: ${req.width}x${req.height} — width & height must be > 0`,
    );
  }

  let { width, height } = req;

  if (width > MAX_WIDTH || height > MAX_HEIGHT) {
    const scale = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height);
    width = Math.floor(width * scale);
    height = Math.floor(height * scale);
  }

  // Force even dimensions for codec compatibility.
  if (width % 2 !== 0) width -= 1;
  if (height % 2 !== 0) height -= 1;

  return { width, height };
}

/**
 * Codec-specific bits-per-pixel-per-frame baselines.
 * Calibrated for "high quality" output — newer codecs are far more
 * efficient and need a smaller bpp budget for equivalent quality.
 */
const BITS_PER_PIXEL: Record<VideoCodec, number> = {
  h264: 0.1,
  h265: 0.05,
  vp9: 0.06,
  av1: 0.04,
};

/**
 * Calculate a target bitrate in bits/sec based on resolution, fps and codec.
 * Result is clamped to a sensible range [200kbps .. 100Mbps].
 */
export function calculateBitrate(
  res: Resolution,
  fps: number,
  codec: VideoCodec,
): number {
  if (fps <= 0) {
    throw new Error(`Invalid fps: ${fps} — must be > 0`);
  }
  const bpp = BITS_PER_PIXEL[codec];
  const raw = Math.round(res.width * res.height * fps * bpp);
  const min = 200_000;
  const max = 100_000_000;
  return Math.max(min, Math.min(max, raw));
}
