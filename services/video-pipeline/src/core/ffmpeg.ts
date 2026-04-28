// ── ffmpeg Argument Construction ────────────────────────────────────────
// Pure function — produces an array of CLI args, takes no action.
// The actual subprocess spawn is handled by the server tier; this lets
// us unit-test the command we WOULD run without invoking ffmpeg.

import { calculateBitrate, clampResolution } from "./resolution";
import {
  type AudioCodec,
  type Container,
  type TargetSpec,
  type VideoCodec,
} from "./types";

const VIDEO_CODEC_FLAG: Record<VideoCodec, string> = {
  h264: "libx264",
  h265: "libx265",
  vp9: "libvpx-vp9",
  av1: "libaom-av1",
};

const AUDIO_CODEC_FLAG: Record<AudioCodec, string> = {
  aac: "aac",
  opus: "libopus",
  mp3: "libmp3lame",
};

const CONTAINER_FLAG: Record<Container, string> = {
  mp4: "mp4",
  webm: "webm",
  mov: "mov",
};

export interface FfmpegArgsInput {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly target: TargetSpec;
}

/**
 * Build ffmpeg CLI args for a transcoding job.
 *
 * - Resolution is clamped to 4K and forced to even dimensions.
 * - Bitrate is computed from resolution+fps+codec when not provided.
 * - Output container/codec flags use canonical ffmpeg names.
 */
export function buildFfmpegArgs(input: FfmpegArgsInput): readonly string[] {
  const { inputPath, outputPath, target } = input;

  const resolution = clampResolution({
    width: target.width,
    height: target.height,
  });
  const fps = target.fps ?? 30;
  const bitrate =
    target.bitrate ?? calculateBitrate(resolution, fps, target.videoCodec);

  return [
    "-hide_banner",
    "-y",
    "-i",
    inputPath,
    "-c:v",
    VIDEO_CODEC_FLAG[target.videoCodec],
    "-b:v",
    `${bitrate}`,
    "-vf",
    `scale=${resolution.width}:${resolution.height}`,
    "-r",
    `${fps}`,
    "-c:a",
    AUDIO_CODEC_FLAG[target.audioCodec],
    "-f",
    CONTAINER_FLAG[target.container],
    outputPath,
  ];
}
