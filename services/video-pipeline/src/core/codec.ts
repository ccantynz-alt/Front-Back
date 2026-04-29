// ── Codec Negotiation ───────────────────────────────────────────────────
// Pure functions — no IO, fully testable.

import {
  type AudioCodec,
  type CodecNegotiationResult,
  type Container,
  type TargetSpec,
  type VideoCodec,
} from "./types";

/**
 * Container/codec compatibility matrix.
 * Source of truth — used by both browser & server.
 */
export const CONTAINER_VIDEO_CODECS: Record<Container, readonly VideoCodec[]> =
  {
    mp4: ["h264", "h265", "av1"],
    webm: ["vp9", "av1"],
    mov: ["h264", "h265"],
  };

export const CONTAINER_AUDIO_CODECS: Record<Container, readonly AudioCodec[]> =
  {
    mp4: ["aac", "mp3"],
    webm: ["opus"],
    mov: ["aac"],
  };

/**
 * Negotiate a target spec — verifies that the requested combination of
 * container + video codec + audio codec is mutually compatible.
 *
 * Returns a discriminated union with a structured failure reason so the
 * caller can decide whether to retry server-side or surface the error.
 */
export function negotiateCodec(target: TargetSpec): CodecNegotiationResult {
  const allowedVideo = CONTAINER_VIDEO_CODECS[target.container];
  if (!allowedVideo.includes(target.videoCodec)) {
    return {
      accepted: false,
      reason: `Container '${target.container}' does not support video codec '${target.videoCodec}'`,
    };
  }

  const allowedAudio = CONTAINER_AUDIO_CODECS[target.container];
  if (!allowedAudio.includes(target.audioCodec)) {
    return {
      accepted: false,
      reason: `Container '${target.container}' does not support audio codec '${target.audioCodec}'`,
    };
  }

  return { accepted: true, target };
}

/**
 * Browser-tier codec support — what WebCodecs can encode reliably today.
 * AV1 + h265 encoding are still patchy in browsers, so we keep this list
 * conservative. Anything else falls back to the server tier.
 */
export const BROWSER_ENCODE_CODECS: readonly VideoCodec[] = [
  "h264",
  "vp9",
] as const;

export function isBrowserEncodable(codec: VideoCodec): boolean {
  return BROWSER_ENCODE_CODECS.includes(codec);
}
